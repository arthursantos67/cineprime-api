from django.utils import timezone
from rest_framework import serializers

from cineprime_api.localization import get_context_locale
from catalog.models import Session
from reservations.exceptions import (
    InvalidPaymentMethodApiException,
    InvalidTicketTypeApiException,
)
from reservations.models import (
    PaymentMethod,
    Seat,
    SeatRow,
    SessionSeat,
    SessionSeatStatus,
    Ticket,
    TicketType,
)
from reservations.ticket_payloads import (
    build_movie_payload,
    build_room_payload,
    build_seat_payload,
    build_session_payload,
    movie_from_snapshot,
    room_from_snapshot,
    seat_from_snapshot,
    session_from_snapshot,
)


def validate_room_layout_changes_are_allowed(room_ids):
    room_ids = {room_id for room_id in room_ids if room_id is not None}

    if Session.objects.filter(
        room_id__in=room_ids,
        start_time__gte=timezone.now(),
    ).exists():
        raise serializers.ValidationError(
            {
                "room": (
                    "Room seat layout cannot be changed while future sessions exist."
                )
            }
        )


class SeatRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeatRow
        fields = ["id", "room", "name", "is_accessible_row"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        attrs = super().validate(attrs)

        room = attrs.get("room", getattr(self.instance, "room", None))
        if room is None:
            return attrs

        room_ids = {room.id}
        if self.instance is not None:
            room_ids.add(self.instance.room_id)

        validate_room_layout_changes_are_allowed(room_ids)
        return attrs


class SeatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Seat
        fields = ["id", "row", "number", "is_accessible", "companion_seat"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        attrs = super().validate(attrs)

        row = attrs.get("row", getattr(self.instance, "row", None))
        if row is None:
            return attrs

        room_ids = {row.room_id}

        if self.instance is not None:
            room_ids.add(self.instance.row.room_id)

        validate_room_layout_changes_are_allowed(room_ids)

        seats_in_room = Seat.objects.filter(row__room=row.room)
        if self.instance is not None:
            seats_in_room = seats_in_room.exclude(pk=self.instance.pk)

        if seats_in_room.count() >= row.room.capacity:
            raise serializers.ValidationError(
                {"row": ("Room capacity cannot be exceeded by adding another seat.")}
            )

        return attrs


class SessionSeatSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionSeat
        fields = [
            "id",
            "session",
            "seat",
            "status",
            "locked_by_user",
            "lock_expires_at",
        ]
        read_only_fields = ["id", "status", "locked_by_user", "lock_expires_at"]


class TicketSerializer(serializers.ModelSerializer):
    movie = serializers.SerializerMethodField()
    session = serializers.SerializerMethodField()
    room = serializers.SerializerMethodField()
    seat = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id",
            "user",
            "session_seat",
            "ticket_code",
            "ticket_type",
            "amount_paid",
            "payment_method",
            "created_at",
            "movie",
            "session",
            "room",
            "seat",
        ]
        read_only_fields = ["id", "ticket_code", "created_at"]

    def get_movie(self, obj):
        locale = get_context_locale(self.context)
        if obj.session_seat_id is None:
            return movie_from_snapshot(obj.session_snapshot, locale=locale)

        return build_movie_payload(obj.session_seat.session.movie, locale=locale)

    def get_session(self, obj):
        if obj.session_seat_id is None:
            return session_from_snapshot(obj.session_snapshot)

        return build_session_payload(obj.session_seat.session)

    def get_room(self, obj):
        locale = get_context_locale(self.context)
        if obj.session_seat_id is None:
            return room_from_snapshot(obj.session_snapshot, locale=locale)

        return build_room_payload(obj.session_seat.session.room, locale=locale)

    def get_seat(self, obj):
        if obj.session_seat_id is None:
            return seat_from_snapshot(obj.session_snapshot)

        return build_seat_payload(obj.session_seat.seat)


class SessionSeatMapItemSerializer(serializers.ModelSerializer):
    session_seat_id = serializers.UUIDField(source="id", read_only=True)
    seat_id = serializers.UUIDField(source="seat.id", read_only=True)
    row = serializers.CharField(source="seat.row.name", read_only=True)
    number = serializers.IntegerField(source="seat.number", read_only=True)
    is_accessible = serializers.BooleanField(
        source="seat.is_accessible", read_only=True
    )
    is_accessible_row = serializers.BooleanField(
        source="seat.row.is_accessible_row", read_only=True
    )
    companion_seat_id = serializers.UUIDField(
        source="seat.companion_seat_id", read_only=True, allow_null=True
    )
    reserved_by_current_user = serializers.SerializerMethodField()
    lock_expires_at = serializers.SerializerMethodField()

    class Meta:
        model = SessionSeat
        fields = [
            "session_seat_id",
            "seat_id",
            "row",
            "number",
            "status",
            "is_accessible",
            "is_accessible_row",
            "companion_seat_id",
            "reserved_by_current_user",
            "lock_expires_at",
        ]

    def get_reserved_by_current_user(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        return bool(
            user
            and user.is_authenticated
            and obj.status == SessionSeatStatus.RESERVED
            and obj.locked_by_user_id == user.id
        )

    def get_lock_expires_at(self, obj):
        if not self.get_reserved_by_current_user(obj):
            return None

        return obj.lock_expires_at

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if not user or not user.is_authenticated:
            data.pop("reserved_by_current_user", None)
            data.pop("lock_expires_at", None)

        return data


class BulkLayoutRowSeatSerializer(serializers.Serializer):
    number = serializers.IntegerField(min_value=1)


class BulkLayoutRowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=10)
    seats = BulkLayoutRowSeatSerializer(many=True)

    def validate_name(self, value):
        value = value.strip().upper()
        if not value or not value.isalpha():
            raise serializers.ValidationError("Row name must contain letters only.")
        return value

    def validate_seats(self, value):
        numbers = [s["number"] for s in value]
        if len(numbers) != len(set(numbers)):
            raise serializers.ValidationError("Seat numbers must be unique within a row.")
        return value


class BulkLayoutRequestSerializer(serializers.Serializer):
    room = serializers.UUIDField()
    rows = BulkLayoutRowSerializer(many=True, allow_empty=False)

    def validate_rows(self, value):
        names = [r["name"] for r in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError("Row names must be unique.")
        return value


class BulkLayoutSeatResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = Seat
        fields = ["id", "row", "number", "is_accessible", "companion_seat"]


class BulkLayoutRowResultSerializer(serializers.ModelSerializer):
    seats = BulkLayoutSeatResultSerializer(many=True, read_only=True)

    class Meta:
        model = SeatRow
        fields = ["id", "room", "name", "is_accessible_row", "seats"]


class AccessibleRowRequestSerializer(serializers.Serializer):
    room = serializers.UUIDField()
    name = serializers.CharField(max_length=10)
    accessible_seat_count = serializers.IntegerField(min_value=1, max_value=50)


class TemporaryReservationRequestSerializer(serializers.Serializer):
    seat_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=20,
    )

    def validate_seat_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Seat IDs must be unique.")
        return value


class TemporaryReservationReleaseRequestSerializer(serializers.Serializer):
    session_seat_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )

    def validate_session_seat_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Session seat IDs must be unique.")
        return value


class TemporaryReservationSeatSerializer(serializers.ModelSerializer):
    seat_id = serializers.UUIDField(source="seat.id", read_only=True)
    row = serializers.CharField(source="seat.row.name", read_only=True)
    number = serializers.IntegerField(source="seat.number", read_only=True)

    class Meta:
        model = SessionSeat
        fields = ["seat_id", "row", "number", "status"]


class TemporaryReservationResponseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    status = serializers.CharField()
    expires_at = serializers.DateTimeField()
    seats = TemporaryReservationSeatSerializer(many=True)


class TemporaryReservationReleaseSeatSerializer(serializers.ModelSerializer):
    session_seat_id = serializers.UUIDField(source="id", read_only=True)
    seat_id = serializers.UUIDField(source="seat.id", read_only=True)
    row = serializers.CharField(source="seat.row.name", read_only=True)
    number = serializers.IntegerField(source="seat.number", read_only=True)
    is_accessible = serializers.BooleanField(
        source="seat.is_accessible", read_only=True
    )

    class Meta:
        model = SessionSeat
        fields = [
            "session_seat_id",
            "seat_id",
            "row",
            "number",
            "status",
            "is_accessible",
        ]


class TemporaryReservationReleaseResponseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    status = serializers.CharField()
    seats = TemporaryReservationReleaseSeatSerializer(many=True)


class CheckoutSeatRequestSerializer(serializers.Serializer):
    session_seat_id = serializers.UUIDField()
    ticket_type = serializers.CharField()

    def validate_ticket_type(self, value):
        if value not in TicketType.values:
            raise InvalidTicketTypeApiException()

        return value


class CheckoutRequestSerializer(serializers.Serializer):
    seats = serializers.ListField(
        child=CheckoutSeatRequestSerializer(),
        allow_empty=False,
        max_length=20,
    )
    payment_method = serializers.CharField()
    total_amount = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
    )

    def validate_payment_method(self, value):
        if value not in PaymentMethod.values:
            raise InvalidPaymentMethodApiException()

        return value

    def validate_seats(self, value):
        session_seat_ids = [seat["session_seat_id"] for seat in value]

        if len(session_seat_ids) != len(set(session_seat_ids)):
            raise serializers.ValidationError("Session seat IDs must be unique.")

        return value


class CheckoutSeatResponseSerializer(serializers.Serializer):
    session_seat_id = serializers.UUIDField()
    seat_id = serializers.UUIDField()
    row = serializers.CharField()
    number = serializers.IntegerField()
    status = serializers.CharField()
    ticket_type = serializers.CharField()
    amount_paid = serializers.DecimalField(max_digits=8, decimal_places=2)


class CheckoutTicketResponseSerializer(serializers.Serializer):
    ticket_id = serializers.UUIDField()
    ticket_code = serializers.CharField()
    session_seat_id = serializers.UUIDField()
    seat_id = serializers.UUIDField()
    ticket_type = serializers.CharField()
    amount_paid = serializers.DecimalField(max_digits=8, decimal_places=2)
    payment_method = serializers.CharField()
    movie = serializers.DictField()
    session = serializers.DictField()
    room = serializers.DictField()
    seat = serializers.DictField()


class CheckoutResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    payment_method = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=8, decimal_places=2)
    seats = CheckoutSeatResponseSerializer(many=True)
    tickets = CheckoutTicketResponseSerializer(many=True)
