import math
import uuid

from datetime import datetime, timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.core.cache import cache
from django.db import transaction
from django.db.models import Avg, CharField, Count, ExpressionWrapper, F, IntegerField, Q, Subquery, OuterRef, Value
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework import status as http_status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cineprime_api.permissions import IsAdminUserOrReadOnly
from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView

from cineprime_api.localization import DEFAULT_LOCALE, get_request_locale
from reservations.models import SessionSeat, SessionSeatStatus, Ticket
from reservations.services import detach_tickets
from catalog.exceptions import SessionsHaveValidTickets
from catalog.models import (
    AudioFormat,
    Genre,
    Movie,
    MovieInterest,
    MovieReview,
    MovieReviewVote,
    MovieStatus,
    ProjectionFormat,
    Room,
    RoomExperienceType,
    RoomTypePricing,
    Session,
    SessionType,
)
from catalog.serializers import (
    GenreSerializer,
    MovieInterestStatusSerializer,
    MovieReadSerializer,
    MovieReviewSerializer,
    MovieWriteSerializer,
    RoomSerializer,
    RoomTypePricingSerializer,
    SessionReadSerializer,
    SessionWriteSerializer,
    compute_session_price,
)


def _review_queryset(movie, request):
    """Annotate review queryset with vote counts and current user's vote."""
    like_expr = Count("votes", filter=Q(votes__vote=MovieReviewVote.LIKE))
    dislike_expr = Count("votes", filter=Q(votes__vote=MovieReviewVote.DISLIKE))

    qs = (
        MovieReview.objects.filter(movie=movie)
        .select_related("user")
        .annotate(
            like_count=like_expr,
            dislike_count=dislike_expr,
            # Compute net_votes inline to avoid F()-referencing-annotation issues
            net_votes=ExpressionWrapper(
                Count("votes", filter=Q(votes__vote=MovieReviewVote.LIKE))
                - Count("votes", filter=Q(votes__vote=MovieReviewVote.DISLIKE)),
                output_field=IntegerField(),
            ),
        )
    )
    if request.user.is_authenticated:
        user_vote_sq = MovieReviewVote.objects.filter(
            review=OuterRef("pk"),
            user=request.user,
        ).values("vote")[:1]
        qs = qs.annotate(user_vote=Subquery(user_vote_sq, output_field=CharField()))
    else:
        qs = qs.annotate(user_vote=Value(None, output_field=CharField()))
    return qs.order_by("-net_votes", "-created_at")

MOVIE_LIST_CACHE_VERSION_KEY = "catalog:movies:version"
SESSION_LIST_CACHE_VERSION_KEY = "catalog:sessions:version"
INITIAL_CACHE_VERSION = 1


def _safe_cache_add(key, value, *, timeout):
    try:
        return cache.add(key, value, timeout=timeout)
    except Exception:
        return None


def _safe_cache_get(key):
    try:
        return cache.get(key)
    except Exception:
        return None


def _safe_cache_set(key, value, *, timeout):
    try:
        cache.set(key, value, timeout=timeout)
    except Exception:
        return


def _safe_cache_incr(key):
    try:
        return cache.incr(key)
    except ValueError:
        return None
    except Exception:
        return None


def _get_cache_namespace_version(version_key):
    if _safe_cache_add(version_key, INITIAL_CACHE_VERSION, timeout=None) is None:
        return None
    return _safe_cache_get(version_key)


def _bump_cache_namespace_version(version_key):
    if _safe_cache_add(version_key, INITIAL_CACHE_VERSION, timeout=None) is None:
        return

    if _safe_cache_incr(version_key) is None:
        _safe_cache_set(version_key, INITIAL_CACHE_VERSION + 1, timeout=None)


def _catalog_list_cache_key(namespace, version_key, request):
    version = _get_cache_namespace_version(version_key)
    if version is None:
        return None
    locale = get_request_locale(request)
    if locale == DEFAULT_LOCALE:
        return f"catalog:{namespace}:v{version}:{request.get_full_path()}"
    return f"catalog:{namespace}:v{version}:{locale}:{request.get_full_path()}"


PUBLIC_SESSION_VISIBILITY_WINDOW_SECONDS = 300


def _public_session_horizon():
    """Now, rounded UP to the next visibility-window boundary.

    The public session list is cached; filtering with the exact current time
    would let already-started sessions linger in cached responses for the
    whole TTL. Filtering with the window's end (and keying the cache by the
    window) guarantees a cached page never lists a session that has already
    started — at the cost of hiding sessions up to 5 minutes before start,
    which the 15-minute presale cutoff makes irrelevant.
    """
    window = PUBLIC_SESSION_VISIBILITY_WINDOW_SECONDS
    now_ts = timezone.now().timestamp()
    horizon_ts = math.ceil(now_ts / window) * window
    return datetime.fromtimestamp(horizon_ts, tz=dt_timezone.utc)


def _validate_choice_filter(name, value, allowed_values):
    if value in allowed_values:
        return value

    allowed = ", ".join(allowed_values)
    raise ValidationError(
        {name: [f"Invalid {name} filter. Expected one of: {allowed}."]}
    )


def invalidate_movie_list_cache():
    _bump_cache_namespace_version(MOVIE_LIST_CACHE_VERSION_KEY)


def invalidate_session_list_cache():
    _bump_cache_namespace_version(SESSION_LIST_CACHE_VERSION_KEY)


def invalidate_movie_and_session_list_cache():
    invalidate_movie_list_cache()
    invalidate_session_list_cache()


@extend_schema(tags=["Catalog"], summary="List or create genres")
class GenreListCreateView(ListCreateAPIView):
    serializer_class = GenreSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def get_queryset(self):
        qs = Genre.objects.all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


@extend_schema(tags=["Catalog"], summary="Get, update or delete genre")
class GenreDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Genre.objects.all()
    serializer_class = GenreSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def perform_update(self, serializer):
        serializer.save()
        invalidate_movie_and_session_list_cache()

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        invalidate_movie_and_session_list_cache()
        return response


def _sessions_with_valid_tickets(sessions_qs):
    """Sessions that haven't ended yet and still have at least one sold ticket."""
    return sessions_qs.filter(
        end_time__gte=timezone.now(),
        session_seats__ticket__isnull=False,
    ).distinct()


def _movie_queryset_with_aggregates():
    # Reviews attached to a movie that has moved back to "em_breve" are not
    # surfaced anywhere (see MovieReviewListCreateView.get), so they must not
    # count toward the rating either, or the two would disagree.
    not_coming_soon = ~Q(status=MovieStatus.EM_BREVE)
    return (
        Movie.objects.prefetch_related("genres", "cast")
        .annotate(
            average_rating=Avg("reviews__rating", filter=not_coming_soon),
            review_count=Count("reviews", filter=not_coming_soon),
        )
    )


@extend_schema(tags=["Catalog"], summary="List or create movies")
class MovieListCreateView(ListCreateAPIView):
    queryset = _movie_queryset_with_aggregates()
    permission_classes = [IsAdminUserOrReadOnly]
    CACHE_TTL_SECONDS = 300
    IS_FEATURED_FILTER_VALUES = {
        "true": True,
        "1": True,
        "false": False,
        "0": False,
    }

    def _get_validated_filters(self):
        if hasattr(self, "_validated_filters"):
            return self._validated_filters

        filters = {}
        status = self.request.query_params.get("status")
        is_featured = self.request.query_params.get("is_featured")
        search = self.request.query_params.get("search")

        if search is not None:
            normalized_search = search.strip()
            if normalized_search:
                filters["search"] = normalized_search

        if status is not None:
            if status not in MovieStatus.values:
                allowed_statuses = ", ".join(MovieStatus.values)
                raise ValidationError(
                    {
                        "status": [
                            f"Invalid status filter. Expected one of: {allowed_statuses}."
                        ]
                    }
                )
            filters["status"] = status

        if is_featured is not None:
            normalized_is_featured = is_featured.lower()
            if normalized_is_featured not in self.IS_FEATURED_FILTER_VALUES:
                raise ValidationError(
                    {
                        "is_featured": [
                            "Invalid is_featured filter. Expected one of: true, false, 1, 0."
                        ]
                    }
                )
            filters["is_featured"] = self.IS_FEATURED_FILTER_VALUES[
                normalized_is_featured
            ]

        self._validated_filters = filters
        return filters

    def get_queryset(self):
        queryset = super().get_queryset()
        filters = self._get_validated_filters()

        if "status" in filters:
            queryset = queryset.filter(status=filters["status"])

        if "is_featured" in filters:
            queryset = queryset.filter(is_featured=filters["is_featured"])

        if "search" in filters:
            queryset = queryset.filter(
                Q(title__icontains=filters["search"])
                | Q(synopsis__icontains=filters["search"])
            )

        return queryset

    def get_serializer_class(self):
        if self.request.method == "GET":
            return MovieReadSerializer
        return MovieWriteSerializer

    def list(self, request, *args, **kwargs):
        self._get_validated_filters()
        cache_key = _catalog_list_cache_key(
            "movies",
            MOVIE_LIST_CACHE_VERSION_KEY,
            request,
        )
        cached_response = None
        if cache_key is not None:
            cached_response = _safe_cache_get(cache_key)

        if cached_response is not None:
            return Response(cached_response)

        response = super().list(request, *args, **kwargs)
        if cache_key is not None:
            _safe_cache_set(cache_key, response.data, timeout=self.CACHE_TTL_SECONDS)
        return response

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        invalidate_movie_list_cache()
        return response


@extend_schema(tags=["Catalog"], summary="Get, update or delete movie")
class MovieDetailView(RetrieveUpdateDestroyAPIView):
    queryset = _movie_queryset_with_aggregates()
    permission_classes = [IsAdminUserOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return MovieReadSerializer
        return MovieWriteSerializer

    def perform_update(self, serializer):
        serializer.save()
        invalidate_movie_and_session_list_cache()

    def perform_destroy(self, instance):
        sessions = instance.sessions.select_related("movie", "room").all()
        session_ids = list(sessions.values_list("id", flat=True))

        with transaction.atomic():
            # Lock every SessionSeat of every session being deleted against the
            # same rows CheckoutService.execute() locks, so a checkout that is
            # concurrently turning one of these seats into a ticket is fully
            # serialized against this check instead of racing it.
            list(
                SessionSeat.objects.select_for_update(of=("self",))
                .filter(session_id__in=session_ids)
                .order_by("id")
                .values_list("id", flat=True)
            )

            blocking_session_ids = list(
                _sessions_with_valid_tickets(sessions).values_list("id", flat=True)
            )

            if blocking_session_ids:
                ticket_count = Ticket.objects.filter(
                    session_seat__session_id__in=blocking_session_ids
                ).count()
                raise SessionsHaveValidTickets(
                    session_count=len(blocking_session_ids),
                    ticket_count=ticket_count,
                    detail=(
                        "Movie has sessions with valid tickets and cannot be deleted. "
                        "Cancel those tickets before deleting the movie."
                    ),
                )

            for session in sessions:
                detach_tickets(Ticket.objects.filter(session_seat__session=session))
            sessions.delete()
            instance.delete()

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        invalidate_movie_and_session_list_cache()
        return response


@extend_schema(tags=["Catalog"], summary="List or create rooms")
class RoomListCreateView(ListCreateAPIView):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [IsAdminUserOrReadOnly]


@extend_schema(tags=["Catalog"], summary="Get, update or delete room")
class RoomDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def perform_update(self, serializer):
        serializer.save()
        invalidate_session_list_cache()

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        invalidate_session_list_cache()
        return response


@extend_schema(tags=["Catalog"], summary="List or create sessions")
class SessionListCreateView(ListCreateAPIView):
    queryset = (
        Session.objects.select_related("movie", "room")
        .prefetch_related("movie__genres", "movie__cast")
        .all()
    )
    permission_classes = [IsAdminUserOrReadOnly]
    CACHE_TTL_SECONDS = 300

    def _get_validated_filters(self):
        if hasattr(self, "_validated_filters"):
            return self._validated_filters

        filters = {}
        movie = self.request.query_params.get("movie")
        date = self.request.query_params.get("date")
        start_from = self.request.query_params.get("start_from")
        start_to = self.request.query_params.get("start_to")
        experience_type = self.request.query_params.get("experience_type")
        audio_format = self.request.query_params.get("audio_format")
        projection_format = self.request.query_params.get("projection_format")
        session_type = self.request.query_params.get("session_type")

        if movie is not None:
            try:
                filters["movie"] = uuid.UUID(movie)
            except ValueError as exc:
                raise ValidationError(
                    {"movie": ["Invalid movie filter. Expected a valid UUID."]}
                ) from exc

        if date is not None:
            parsed_date = parse_date(date)
            if parsed_date is None:
                raise ValidationError(
                    {"date": ["Invalid date filter. Expected YYYY-MM-DD."]}
                )
            filters["date"] = parsed_date

        if start_from is not None:
            parsed_start_from = parse_datetime(start_from)
            if parsed_start_from is None:
                raise ValidationError(
                    {
                        "start_from": [
                            "Invalid start_from filter. Expected ISO 8601 datetime."
                        ]
                    }
                )
            if timezone.is_naive(parsed_start_from):
                parsed_start_from = timezone.make_aware(parsed_start_from)
            filters["start_from"] = parsed_start_from

        if start_to is not None:
            parsed_start_to = parse_datetime(start_to)
            if parsed_start_to is None:
                raise ValidationError(
                    {
                        "start_to": [
                            "Invalid start_to filter. Expected ISO 8601 datetime."
                        ]
                    }
                )
            if timezone.is_naive(parsed_start_to):
                parsed_start_to = timezone.make_aware(parsed_start_to)
            filters["start_to"] = parsed_start_to

        if experience_type is not None:
            filters["experience_type"] = _validate_choice_filter(
                "experience_type",
                experience_type,
                RoomExperienceType.values,
            )

        if audio_format is not None:
            filters["audio_format"] = _validate_choice_filter(
                "audio_format",
                audio_format,
                AudioFormat.values,
            )

        if projection_format is not None:
            filters["projection_format"] = _validate_choice_filter(
                "projection_format",
                projection_format,
                ProjectionFormat.values,
            )

        if session_type is not None:
            filters["session_type"] = _validate_choice_filter(
                "session_type",
                session_type,
                SessionType.values,
            )

        self._validated_filters = filters
        return filters

    def get_queryset(self):
        queryset = super().get_queryset()
        filters = self._get_validated_filters()

        if "movie" in filters:
            queryset = queryset.filter(movie_id=filters["movie"])

        if "date" in filters:
            queryset = queryset.filter(start_time__date=filters["date"])

        if "start_from" in filters:
            queryset = queryset.filter(start_time__gte=filters["start_from"])

        if "start_to" in filters:
            queryset = queryset.filter(start_time__lte=filters["start_to"])

        if "experience_type" in filters:
            queryset = queryset.filter(room__experience_type=filters["experience_type"])

        if "audio_format" in filters:
            queryset = queryset.filter(audio_format=filters["audio_format"])

        if "projection_format" in filters:
            queryset = queryset.filter(projection_format=filters["projection_format"])

        if "session_type" in filters:
            queryset = queryset.filter(session_type=filters["session_type"])

        if not self._is_staff_request():
            queryset = queryset.filter(start_time__gte=_public_session_horizon())

        return queryset

    def _is_staff_request(self):
        user = getattr(self.request, "user", None)
        return bool(user and user.is_authenticated and user.is_staff)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return SessionReadSerializer
        return SessionWriteSerializer

    def list(self, request, *args, **kwargs):
        self._get_validated_filters()
        cache_key = _catalog_list_cache_key(
            "sessions",
            SESSION_LIST_CACHE_VERSION_KEY,
            request,
        )
        if cache_key is not None:
            if self._is_staff_request():
                cache_key = f"{cache_key}:staff"
            else:
                # Key public responses by visibility window so a fresh window
                # never serves a page filtered against an older horizon.
                horizon = int(_public_session_horizon().timestamp())
                cache_key = f"{cache_key}:h{horizon}"
        cached_response = None
        if cache_key is not None:
            cached_response = _safe_cache_get(cache_key)

        if cached_response is not None:
            return Response(cached_response)

        response = super().list(request, *args, **kwargs)
        if cache_key is not None:
            _safe_cache_set(cache_key, response.data, timeout=self.CACHE_TTL_SECONDS)
        return response

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        result = write_serializer.save()
        many = isinstance(result, list)
        read_serializer = SessionReadSerializer(
            result, many=many, context=self.get_serializer_context()
        )
        headers = {} if many else self.get_success_headers(read_serializer.data)
        invalidate_session_list_cache()
        return Response(read_serializer.data, status=http_status.HTTP_201_CREATED, headers=headers)


@extend_schema(tags=["Catalog"], summary="Get, update or delete session")
class SessionDetailView(RetrieveUpdateDestroyAPIView):
    queryset = (
        Session.objects.select_related("movie", "room")
        .prefetch_related("movie__genres", "movie__cast")
        .all()
    )
    permission_classes = [IsAdminUserOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return SessionReadSerializer
        return SessionWriteSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write_serializer = self.get_serializer(instance, data=request.data, partial=partial)
        write_serializer.is_valid(raise_exception=True)
        self.perform_update(write_serializer)
        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}
        read_serializer = SessionReadSerializer(instance, context=self.get_serializer_context())
        return Response(read_serializer.data)

    def perform_update(self, serializer):
        serializer.save()
        invalidate_session_list_cache()

    def perform_destroy(self, instance):
        with transaction.atomic():
            # Lock this session's SessionSeats against the same rows
            # CheckoutService.execute() locks, closing the race where a
            # checkout turns a seat into a ticket between the check below and
            # the delete.
            list(
                SessionSeat.objects.select_for_update(of=("self",))
                .filter(session_id=instance.id)
                .order_by("id")
                .values_list("id", flat=True)
            )

            ticket_count = Ticket.objects.filter(session_seat__session=instance).count()
            has_valid_tickets = instance.end_time >= timezone.now() and ticket_count > 0

            if has_valid_tickets:
                raise SessionsHaveValidTickets(
                    session_count=1,
                    ticket_count=ticket_count,
                    detail="Session has valid tickets and cannot be deleted.",
                )

            detach_tickets(Ticket.objects.filter(session_seat__session=instance))
            instance.delete()

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        invalidate_session_list_cache()
        return response


@extend_schema(tags=["Catalog"], summary="List room type pricing")
class RoomTypePricingListView(ListAPIView):
    queryset = RoomTypePricing.objects.all()
    serializer_class = RoomTypePricingSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = None


@extend_schema(tags=["Catalog"], summary="Update room type pricing")
class RoomTypePricingDetailView(RetrieveUpdateAPIView):
    queryset = RoomTypePricing.objects.all()
    serializer_class = RoomTypePricingSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    @transaction.atomic
    def perform_update(self, serializer):
        instance = serializer.save()
        # Rooms with a blank experience_type are priced as "standard" on save.
        room_filter = Q(experience_type=instance.experience_type)
        if instance.experience_type == "standard":
            room_filter |= Q(experience_type="")
        rooms = Room.objects.filter(room_filter)
        rooms.update(base_price=instance.base_price)
        # Sold tickets snapshot amount_paid, so repricing future sessions
        # never rewrites what buyers already paid. Sessions with a RESERVED
        # seat are skipped: checkout charges session.base_price at purchase
        # time (no freeze at reservation), so repricing mid-checkout would
        # change the price under the user between reserving and paying.
        sessions = Session.objects.filter(
            room__in=rooms,
            start_time__gt=timezone.now(),
        ).exclude(session_seats__status=SessionSeatStatus.RESERVED)
        for session in sessions.iterator():
            new_price = compute_session_price(instance.base_price, session.start_time)
            Session.objects.filter(pk=session.pk).update(base_price=new_price)
        invalidate_session_list_cache()


@extend_schema(
    tags=["Catalog"],
    summary="Get interest count and toggle interest for a movie",
)
class MovieInterestView(APIView):
    def get_permissions(self):
        if self.request.method in ("POST", "DELETE"):
            return [IsAuthenticated()]
        return []

    def _get_movie(self, movie_pk):
        return get_object_or_404(Movie, pk=movie_pk)

    def _interest_response(self, movie, user):
        count = MovieInterest.objects.filter(movie=movie).count()
        user_interested = (
            MovieInterest.objects.filter(movie=movie, user=user).exists()
            if user is not None and user.is_authenticated
            else None
        )
        serializer = MovieInterestStatusSerializer(
            {"count": count, "user_interested": user_interested}
        )
        return serializer.data

    def get(self, request, movie_pk):
        movie = self._get_movie(movie_pk)
        user = request.user if request.user.is_authenticated else None
        data = self._interest_response(movie, user)
        return Response(data)

    def post(self, request, movie_pk):
        movie = self._get_movie(movie_pk)
        if movie.status != MovieStatus.EM_BREVE:
            return Response(
                {"error": {"code": "MOVIE_NOT_COMING_SOON", "message": "Interest can only be registered for coming-soon movies.", "status": 400, "details": None}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        _, created = MovieInterest.objects.get_or_create(movie=movie, user=request.user)
        data = self._interest_response(movie, request.user)
        return Response(data, status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK)

    def delete(self, request, movie_pk):
        movie = self._get_movie(movie_pk)
        MovieInterest.objects.filter(movie=movie, user=request.user).delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Catalog"], summary="List or create reviews for a movie")
class MovieReviewListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return []

    def get(self, request, movie_pk):
        movie = get_object_or_404(Movie, pk=movie_pk)
        page_size = 10
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1

        # A movie that moved back to "em_breve" after being released keeps its
        # historical reviews in the database, but they must stop being served
        # (mirrors the average_rating/review_count filtering below).
        movie_reviews_visible = movie.status != MovieStatus.EM_BREVE
        base_qs = _review_queryset(movie, request) if movie_reviews_visible else _review_queryset(movie, request).none()
        qs = base_qs

        rating_param = request.query_params.get("rating")
        if rating_param is not None:
            try:
                rating_val = Decimal(rating_param)
                qs = qs.filter(rating__gte=rating_val, rating__lt=rating_val + 1)
            except InvalidOperation:
                pass

        total = qs.count()
        offset = (page - 1) * page_size
        reviews = list(qs[offset: offset + page_size])

        serializer = MovieReviewSerializer(reviews, many=True)

        base_url = request.build_absolute_uri(request.path)

        def page_url(p, rating=rating_param):
            url = f"{base_url}?page={p}"
            if rating is not None:
                url += f"&rating={rating}"
            return url

        response_data = {
            "count": total,
            "next": page_url(page + 1) if offset + page_size < total else None,
            "previous": page_url(page - 1) if page > 1 else None,
            "results": serializer.data,
        }

        if request.user.is_authenticated:
            my_review_qs = base_qs.filter(user=request.user).first()
            response_data["my_review"] = (
                MovieReviewSerializer(my_review_qs).data if my_review_qs else None
            )

        return Response(response_data)

    def post(self, request, movie_pk):
        movie = get_object_or_404(Movie, pk=movie_pk)

        if movie.status == MovieStatus.EM_BREVE:
            return Response(
                {
                    "error": {
                        "code": "MOVIE_NOT_RELEASED",
                        "message": "Reviews can only be submitted for released movies.",
                        "status": 400,
                        "details": None,
                    }
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        serializer = MovieReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        review, created = MovieReview.objects.update_or_create(
            movie=movie,
            user=request.user,
            defaults={
                "rating": serializer.validated_data["rating"],
                "comment": serializer.validated_data.get("comment", ""),
            },
        )

        if not created:
            review.votes.all().delete()

        invalidate_movie_list_cache()
        out_qs = _review_queryset(movie, request).get(pk=review.pk)
        out = MovieReviewSerializer(out_qs)
        return Response(
            out.data,
            status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK,
        )


@extend_schema(tags=["Catalog"], summary="Update or delete a movie review")
class MovieReviewDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, movie_pk, review_pk):
        review = get_object_or_404(MovieReview, pk=review_pk, movie_id=movie_pk)

        if review.user_id != request.user.id:
            return Response(
                {"error": {"code": "PERMISSION_DENIED", "message": "You can only edit your own reviews.", "status": 403, "details": None}},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        serializer = MovieReviewSerializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
            # Reset votes so an edited review doesn't keep its previous reputation
            review.votes.all().delete()

        movie = get_object_or_404(Movie, pk=movie_pk)
        out_qs = _review_queryset(movie, request).get(pk=review.pk)
        out = MovieReviewSerializer(out_qs)
        return Response(out.data)

    def delete(self, request, movie_pk, review_pk):
        review = get_object_or_404(MovieReview, pk=review_pk, movie_id=movie_pk)

        if review.user_id != request.user.id and not request.user.is_staff:
            return Response(
                {"error": {"code": "PERMISSION_DENIED", "message": "You do not have permission to delete this review.", "status": 403, "details": None}},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        review.delete()
        invalidate_movie_list_cache()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Catalog"], summary="Like or dislike a movie review")
class MovieReviewVoteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, movie_pk, review_pk):
        review = get_object_or_404(MovieReview, pk=review_pk, movie_id=movie_pk)
        if review.user_id == request.user.id:
            return Response(
                {"error": {"code": "SELF_VOTE", "message": "Cannot vote on your own review.", "status": 400, "details": None}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        vote_value = request.data.get("vote")
        if vote_value not in (MovieReviewVote.LIKE, MovieReviewVote.DISLIKE):
            return Response(
                {"error": {"code": "INVALID_VOTE", "message": "vote must be 'like' or 'dislike'.", "status": 400, "details": None}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        _, created = MovieReviewVote.objects.update_or_create(
            review=review,
            user=request.user,
            defaults={"vote": vote_value},
        )
        return Response({"vote": vote_value}, status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK)

    def delete(self, request, movie_pk, review_pk):
        review = get_object_or_404(MovieReview, pk=review_pk, movie_id=movie_pk)
        MovieReviewVote.objects.filter(review=review, user=request.user).delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)
