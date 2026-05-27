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
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from cineprime_api.throttling import ReservationRateThrottle

from catalog.models import Session
from reservations.exceptions import (
    InvalidSeatSelectionError,
    SeatAlreadyReservedApiException,
    SeatUnavailableError,
    SessionNotFoundError,
)
from reservations.models import Seat, SeatRow, SessionSeat, Ticket
from reservations.serializers import (
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


@extend_schema(tags=["Reservations"], summary="List or create seat rows")
class SeatRowListCreateView(ListCreateAPIView):
    queryset = SeatRow.objects.select_related("room").all()
    serializer_class = SeatRowSerializer
    permission_classes = [IsAdminUser]


@extend_schema(tags=["Reservations"], summary="Get, update or delete seat row")
class SeatRowDetailView(RetrieveUpdateDestroyAPIView):
    queryset = SeatRow.objects.select_related("room").all()
    serializer_class = SeatRowSerializer
    permission_classes = [IsAdminUser]

    def perform_destroy(self, instance):
        validate_room_layout_changes_are_allowed({instance.room_id})
        instance.delete()


@extend_schema(tags=["Reservations"], summary="List or create seats")
class SeatListCreateView(ListCreateAPIView):
    queryset = Seat.objects.select_related("row", "row__room").all()
    serializer_class = SeatSerializer
    permission_classes = [IsAdminUser]


@extend_schema(tags=["Reservations"], summary="Get, update or delete seat")
class SeatDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Seat.objects.select_related("row", "row__room").all()
    serializer_class = SeatSerializer
    permission_classes = [IsAdminUser]

    def perform_destroy(self, instance):
        validate_room_layout_changes_are_allowed({instance.row.room_id})
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


@extend_schema(tags=["Reservations"], summary="Get or delete ticket")
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
            )
        except CheckoutInvalidSeatSelectionError as exc:
            raise ValidationError(detail={"seats": [str(exc)]}) from exc
        except InvalidSubmittedTotalError as exc:
            raise ValidationError(detail={"total_amount": [str(exc)]}) from exc
        except ReservationOwnershipError as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        except ExpiredReservationError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc
        except InvalidSeatStateError as exc:
            raise SeatAlreadyReservedApiException(detail=str(exc)) from exc

        response_serializer = CheckoutResponseSerializer(checkout_result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
