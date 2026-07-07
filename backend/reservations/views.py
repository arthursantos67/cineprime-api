from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import (
    GenericAPIView,
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
    RetrieveDestroyAPIView,
)
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from cineprime_api.localization import get_request_locale
from cineprime_api.throttling import GlobalAnonRateThrottle, ReservationRateThrottle

from catalog.exceptions import SessionsHaveValidTickets
from catalog.models import Room, Session
from reservations.exceptions import (
    InvalidSeatSelectionError,
    SeatAlreadyReservedApiException,
    SeatUnavailableError,
    SessionExpiredApiException,
    SessionExpiredError,
    SessionNotFoundError,
)
from reservations.models import Seat, SeatRow, SessionSeat, Ticket
from users.models import WalletTransaction
from reservations.serializers import (
    AccessibleRowRequestSerializer,
    BulkLayoutRequestSerializer,
    BulkLayoutRowResultSerializer,
    CheckoutRequestSerializer,
    CheckoutResponseSerializer,
    SeatRowSerializer,
    SeatSerializer,
    SessionSeatSerializer,
    SessionSeatMapItemSerializer,
    TicketSerializer,
    TemporaryReservationReleaseRequestSerializer,
    TemporaryReservationReleaseResponseSerializer,
    TemporaryReservationRequestSerializer,
    TemporaryReservationResponseSerializer,
    validate_room_layout_changes_are_allowed,
)
from reservations.services import (
    TemporaryReservationReleaseService,
    TemporaryReservationService,
    detach_tickets,
)
from reservations.services.checkout_service import (
    ExpiredReservationError,
    InvalidSeatStateError,
    CheckoutService,
    InvalidSeatSelectionError as CheckoutInvalidSeatSelectionError,
    InvalidSubmittedTotalError,
    ReservationOwnershipError,
)
from reservations.services.release_service import (
    ExpiredReservationReleaseError,
    InvalidReservationReleaseStateError,
    InvalidSessionSeatSelectionError,
    ReleaseReservationOwnershipError,
)


class AdminLayoutPagination(PageNumberPagination):
    page_size = 500


@extend_schema(tags=["Reservations"], summary="List or create seat rows")
class SeatRowListCreateView(ListCreateAPIView):
    queryset = SeatRow.objects.select_related("room").all()
    serializer_class = SeatRowSerializer
    permission_classes = [IsAdminUser]
    pagination_class = AdminLayoutPagination

    def get_queryset(self):
        qs = super().get_queryset()
        room_id = self.request.query_params.get("room")
        if room_id:
            qs = qs.filter(room_id=room_id)
        return qs


@extend_schema(tags=["Reservations"], summary="Get, update or delete seat row")
class SeatRowDetailView(RetrieveUpdateDestroyAPIView):
    queryset = SeatRow.objects.select_related("room").all()
    serializer_class = SeatRowSerializer
    permission_classes = [IsAdminUser]

    def perform_destroy(self, instance):
        validate_room_layout_changes_are_allowed({instance.room_id})
        with transaction.atomic():
            detach_tickets(Ticket.objects.filter(session_seat__seat__row=instance))
            instance.delete()


@extend_schema(tags=["Reservations"], summary="List or create seats")
class SeatListCreateView(ListCreateAPIView):
    queryset = Seat.objects.select_related("row", "row__room").all()
    serializer_class = SeatSerializer
    permission_classes = [IsAdminUser]
    pagination_class = AdminLayoutPagination

    def get_queryset(self):
        qs = super().get_queryset()
        room_id = self.request.query_params.get("room")
        if room_id:
            qs = qs.filter(row__room_id=room_id)
        return qs


@extend_schema(tags=["Reservations"], summary="Get, update or delete seat")
class SeatDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Seat.objects.select_related("row", "row__room").all()
    serializer_class = SeatSerializer
    permission_classes = [IsAdminUser]

    def perform_destroy(self, instance):
        validate_room_layout_changes_are_allowed({instance.row.room_id})
        with transaction.atomic():
            detach_tickets(Ticket.objects.filter(session_seat__seat=instance))
            instance.delete()


@extend_schema(tags=["Reservations"], summary="List or create session seats")
class SessionSeatListCreateView(ListCreateAPIView):
    queryset = SessionSeat.objects.select_related(
        "session", "seat", "seat__row", "seat__row__room", "locked_by_user"
    ).all()
    serializer_class = SessionSeatSerializer
    permission_classes = [IsAdminUser]


@extend_schema(tags=["Reservations"], summary="Get or delete session seat")
class SessionSeatDetailView(RetrieveDestroyAPIView):
    queryset = SessionSeat.objects.select_related(
        "session", "seat", "seat__row", "seat__row__room", "locked_by_user"
    ).all()
    serializer_class = SessionSeatSerializer
    permission_classes = [IsAdminUser]

    def perform_destroy(self, instance):
        with transaction.atomic():
            # Lock the same row CheckoutService.execute() locks so a
            # concurrent checkout can't turn this seat into a ticket between
            # the check below and the delete.
            locked_instance = SessionSeat.objects.select_for_update(
                of=("self",)
            ).get(pk=instance.pk)

            if Ticket.objects.filter(session_seat=locked_instance).exists():
                raise SessionsHaveValidTickets(
                    session_count=1,
                    ticket_count=1,
                    detail=(
                        "Session seat has a linked ticket and cannot be "
                        "deleted directly."
                    ),
                )

            instance.delete()


@extend_schema(tags=["Reservations"], summary="List tickets")
class TicketListCreateView(ListAPIView):
    queryset = Ticket.objects.select_related(
        "user",
        "session_seat",
        "session_seat__session",
        "session_seat__session__movie",
        "session_seat__session__room",
        "session_seat__seat",
        "session_seat__seat__row",
    ).all()
    serializer_class = TicketSerializer
    permission_classes = [IsAdminUser]


@extend_schema(
    tags=["Reservations"],
    summary="Get or delete ticket",
    description=(
        "Deleting a ticket (staff cancellation/refund) credits the paid "
        "amount to the ticket owner's wallet as internal store credit."
    ),
)
class TicketDetailView(RetrieveDestroyAPIView):
    queryset = Ticket.objects.select_related(
        "user",
        "session_seat",
        "session_seat__session",
        "session_seat__session__movie",
        "session_seat__session__room",
        "session_seat__seat",
        "session_seat__seat__row",
    ).all()
    serializer_class = TicketSerializer
    permission_classes = [IsAdminUser]

    def perform_destroy(self, instance):
        with transaction.atomic():
            if instance.amount_paid and instance.amount_paid > 0:
                WalletTransaction.objects.create(
                    user=instance.user,
                    amount=instance.amount_paid,
                    reason=WalletTransaction.Reason.REFUND,
                    reference=instance.ticket_code,
                )
            instance.delete()


@extend_schema_view(
    get=extend_schema(
        tags=["Reservations"],
        summary="Get session seat map",
        description="Return seat map for a specific session.",
        responses={200: SessionSeatMapItemSerializer(many=True)},
    )
)
class SessionSeatMapView(ListAPIView):
    serializer_class = SessionSeatMapItemSerializer
    permission_classes = [AllowAny]
    throttle_classes = [GlobalAnonRateThrottle]
    pagination_class = None

    def get_queryset(self):
        session = get_object_or_404(Session, id=self.kwargs["session_id"])

        return (
            SessionSeat.objects.select_related("seat", "seat__row")
            .filter(session=session)
            .order_by("seat__row__name", "seat__number")
        )


@extend_schema_view(
    post=extend_schema(
        tags=["Reservations"],
        summary="Create temporary reservation",
        description="Temporarily reserve seats for the authenticated user.",
        request=TemporaryReservationRequestSerializer,
        responses={
            201: TemporaryReservationResponseSerializer,
            400: OpenApiResponse(description="Validation error."),
            404: OpenApiResponse(description="Session not found."),
            409: OpenApiResponse(description="Seat unavailable."),
            429: OpenApiResponse(description="Too many reservation attempts."),
        },
    ),
    delete=extend_schema(
        tags=["Reservations"],
        summary="Release temporary reservations",
        description="Release temporary reservations owned by the authenticated user.",
        request=TemporaryReservationReleaseRequestSerializer,
        responses={
            200: TemporaryReservationReleaseResponseSerializer,
            400: OpenApiResponse(description="Validation error."),
            404: OpenApiResponse(description="Session not found."),
            403: OpenApiResponse(description="Reservation ownership error."),
            409: OpenApiResponse(
                description="Reservation expired or invalid seat state."
            ),
            429: OpenApiResponse(description="Too many reservation attempts."),
        },
    ),
)
class TemporarySeatReservationView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TemporaryReservationRequestSerializer
    throttle_classes = [ReservationRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = TemporaryReservationService()

        try:
            reservation_result = service.execute(
                session_id=self.kwargs["session_id"],
                seat_ids=serializer.validated_data["seat_ids"],
                user=request.user,
            )
        except SessionNotFoundError as exc:
            raise NotFound(detail=str(exc)) from exc
        except SessionExpiredError as exc:
            raise SessionExpiredApiException(detail=str(exc)) from exc
        except InvalidSeatSelectionError as exc:
            raise ValidationError(detail={"seat_ids": [str(exc)]}) from exc
        except SeatUnavailableError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc

        response_payload = {
            "session_id": reservation_result["session_id"],
            "status": reservation_result["status"],
            "expires_at": reservation_result["expires_at"],
            "seats": reservation_result["seats"],
        }

        response_serializer = TemporaryReservationResponseSerializer(response_payload)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, *args, **kwargs):
        serializer = TemporaryReservationReleaseRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = TemporaryReservationReleaseService()

        try:
            release_result = service.execute(
                session_id=self.kwargs["session_id"],
                session_seat_ids=serializer.validated_data["session_seat_ids"],
                user=request.user,
            )
        except SessionNotFoundError as exc:
            raise NotFound(detail=str(exc)) from exc
        except InvalidSessionSeatSelectionError as exc:
            raise ValidationError(detail={"session_seat_ids": [str(exc)]}) from exc
        except ReleaseReservationOwnershipError as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        except ExpiredReservationReleaseError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc
        except InvalidReservationReleaseStateError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc

        response_serializer = TemporaryReservationReleaseResponseSerializer(
            release_result
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)


@extend_schema_view(
    post=extend_schema(
        tags=["Reservations"],
        summary="Checkout reserved seats",
        description="Finalize the purchase for temporarily reserved seats.",
        request=CheckoutRequestSerializer,
        responses={
            200: CheckoutResponseSerializer,
            400: OpenApiResponse(description="Validation error."),
            403: OpenApiResponse(description="Reservation ownership error."),
            409: OpenApiResponse(
                description="Reservation expired or invalid seat state."
            ),
            429: OpenApiResponse(description="Too many checkout attempts."),
        },
    )
)
class CheckoutView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CheckoutRequestSerializer
    throttle_classes = [ReservationRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = CheckoutService()

        try:
            checkout_result = service.execute(
                seats=serializer.validated_data["seats"],
                payment_method=serializer.validated_data["payment_method"],
                user=request.user,
                submitted_total=serializer.validated_data.get("total_amount"),
                locale=get_request_locale(request),
            )
        except CheckoutInvalidSeatSelectionError as exc:
            raise ValidationError(detail={"seats": [str(exc)]}) from exc
        except InvalidSubmittedTotalError as exc:
            raise ValidationError(detail={"total_amount": [str(exc)]}) from exc
        except ReservationOwnershipError as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        except SessionExpiredError as exc:
            raise SessionExpiredApiException(detail=str(exc)) from exc
        except ExpiredReservationError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc
        except InvalidSeatStateError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc

        response_serializer = CheckoutResponseSerializer(checkout_result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Reservations"],
    summary="Create an accessible priority row with companion seat pairs",
    description=(
        "Creates a seat row marked as accessible with N accessible seats and N companion seats, "
        "each pair linked and interleaved: accessible at 2k-1, companion at 2k."
    ),
)
class AccessibleRowView(GenericAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AccessibleRowRequestSerializer

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        room_id = serializer.validated_data["room"]
        row_name = serializer.validated_data["name"].strip().upper()
        accessible_count = serializer.validated_data["accessible_seat_count"]

        room = get_object_or_404(Room, pk=room_id)

        validate_room_layout_changes_are_allowed({room.id})

        if SeatRow.objects.filter(room=room, name=row_name).exists():
            raise ValidationError(
                {"name": f"Row '{row_name}' already exists in this room."}
            )

        if SeatRow.objects.filter(room=room, is_accessible_row=True).exists():
            raise ValidationError(
                {"name": "This room already has an accessible priority row."}
            )

        total_new_seats = accessible_count * 2
        existing_seat_count = Seat.objects.filter(row__room=room).count()
        if existing_seat_count + total_new_seats > room.capacity:
            raise ValidationError(
                {
                    "accessible_seat_count": (
                        f"Adding {total_new_seats} seats would exceed room capacity of "
                        f"{room.capacity} (currently {existing_seat_count} seats)."
                    )
                }
            )

        row = SeatRow(room=room, name=row_name, is_accessible_row=True)
        try:
            row.save()
        except IntegrityError:
            raise ValidationError({"name": "This room already has an accessible priority row."})

        pairs = [
            (
                Seat(row=row, number=2 * i + 1, is_accessible=True),
                Seat(row=row, number=2 * i + 2, is_accessible=False),
            )
            for i in range(accessible_count)
        ]
        all_seats = [seat for accessible, companion in pairs for seat in (accessible, companion)]
        Seat.objects.bulk_create(all_seats)

        for accessible, companion in pairs:
            Seat.objects.filter(pk=accessible.pk).update(companion_seat=companion)

        result_row = (
            SeatRow.objects.filter(pk=row.pk)
            .prefetch_related("seats")
            .first()
        )
        result_serializer = BulkLayoutRowResultSerializer(result_row)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Reservations"], summary="Bulk create seat rows and seats for a room")
class BulkLayoutView(GenericAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = BulkLayoutRequestSerializer

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        room_id = serializer.validated_data["room"]
        rows_data = serializer.validated_data["rows"]

        room = get_object_or_404(Room, pk=room_id)

        validate_room_layout_changes_are_allowed({room.id})

        existing_row_names = set(
            SeatRow.objects.filter(room=room).values_list("name", flat=True)
        )
        conflict_names = [r["name"] for r in rows_data if r["name"] in existing_row_names]
        if conflict_names:
            raise ValidationError(
                {"rows": f"Row(s) already exist in this room: {', '.join(conflict_names)}."}
            )

        existing_seat_count = Seat.objects.filter(row__room=room).count()
        new_seat_count = sum(len(r["seats"]) for r in rows_data)
        if existing_seat_count + new_seat_count > room.capacity:
            raise ValidationError(
                {
                    "rows": (
                        f"Adding {new_seat_count} seats would exceed room capacity of {room.capacity} "
                        f"(currently {existing_seat_count} seats registered)."
                    )
                }
            )

        created_rows = []
        for row_data in rows_data:
            row = SeatRow(room=room, name=row_data["name"])
            row.save()

            seats = [
                Seat(row=row, number=s["number"])
                for s in row_data["seats"]
            ]
            Seat.objects.bulk_create(seats)
            created_rows.append(row)

        result_rows = (
            SeatRow.objects.filter(id__in=[r.id for r in created_rows])
            .prefetch_related("seats")
        )
        result_serializer = BulkLayoutRowResultSerializer(result_rows, many=True)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)
