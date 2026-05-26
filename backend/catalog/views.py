import uuid

from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response

from cineprime_natal_api.permissions import IsAdminUserOrReadOnly
from catalog.models import Genre, Movie, MovieStatus, Room, Session
from catalog.serializers import (
    GenreSerializer,
    MovieReadSerializer,
    MovieWriteSerializer,
    RoomSerializer,
    SessionReadSerializer,
    SessionWriteSerializer,
)

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
    return f"catalog:{namespace}:v{version}:{request.get_full_path()}"


def invalidate_movie_list_cache():
    _bump_cache_namespace_version(MOVIE_LIST_CACHE_VERSION_KEY)


def invalidate_session_list_cache():
    _bump_cache_namespace_version(SESSION_LIST_CACHE_VERSION_KEY)


def invalidate_movie_and_session_list_cache():
    invalidate_movie_list_cache()
    invalidate_session_list_cache()


@extend_schema(tags=["Catalog"], summary="List or create genres")
class GenreListCreateView(ListCreateAPIView):
    queryset = Genre.objects.all()
    serializer_class = GenreSerializer
    permission_classes = [IsAdminUserOrReadOnly]


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


@extend_schema(tags=["Catalog"], summary="List or create movies")
class MovieListCreateView(ListCreateAPIView):
    queryset = Movie.objects.prefetch_related("genres").all()
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
    queryset = Movie.objects.prefetch_related("genres").all()
    permission_classes = [IsAdminUserOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return MovieReadSerializer
        return MovieWriteSerializer

    def perform_update(self, serializer):
        serializer.save()
        invalidate_movie_and_session_list_cache()

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
        .prefetch_related("movie__genres")
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

        return queryset

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
        invalidate_session_list_cache()
        return response


@extend_schema(tags=["Catalog"], summary="Get, update or delete session")
class SessionDetailView(RetrieveUpdateDestroyAPIView):
    queryset = (
        Session.objects.select_related("movie", "room")
        .prefetch_related("movie__genres")
        .all()
    )
    permission_classes = [IsAdminUserOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return SessionReadSerializer
        return SessionWriteSerializer

    def perform_update(self, serializer):
        serializer.save()
        invalidate_session_list_cache()

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        invalidate_session_list_cache()
        return response
