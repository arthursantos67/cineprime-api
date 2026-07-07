import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models


class SeatRow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(
        "catalog.Room",
        on_delete=models.CASCADE,
        related_name="seat_rows",
    )
    name = models.CharField(max_length=10)
    is_accessible_row = models.BooleanField(default=False)

    class Meta:
        db_table = "reservation_seat_rows"
        ordering = ["room", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["room", "name"],
                name="unique_seat_row_per_room",
            ),
            models.UniqueConstraint(
                fields=["room"],
                condition=models.Q(is_accessible_row=True),
                name="unique_accessible_row_per_room",
            ),
        ]
        indexes = [
            models.Index(fields=["room"], name="seat_row_room_idx"),
        ]

    def clean(self):
        self.name = self.name.strip().upper()

        if not self.name:
            raise ValidationError({"name": "Seat row name cannot be blank."})

        if not self.name.isalpha():
            raise ValidationError({"name": "Seat row name must contain letters only."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.room.name} - Row {self.name}"


class Seat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    row = models.ForeignKey(
        "reservations.SeatRow",
        on_delete=models.CASCADE,
        related_name="seats",
    )
    number = models.PositiveIntegerField()
    is_accessible = models.BooleanField(default=False)
    companion_seat = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paired_by",
    )

    class Meta:
        db_table = "reservation_seats"
        ordering = ["row", "number"]
        constraints = [
            models.UniqueConstraint(
                fields=["row", "number"],
                name="unique_seat_number_per_row",
            )
        ]
        indexes = [
            models.Index(fields=["row"], name="seat_row_idx"),
        ]

    @property
    def room(self):
        return self.row.room

    def clean(self):
        if self.number <= 0:
            raise ValidationError({"number": "Seat number must be greater than zero."})

        if not self.row_id:
            return

        room = self.row.room
        existing_seats = Seat.objects.filter(row__room=room)
        if self.pk:
            existing_seats = existing_seats.exclude(pk=self.pk)

        if existing_seats.count() >= room.capacity:
            raise ValidationError(
                {"row": ("Room capacity cannot be exceeded by adding another seat.")}
            )

        if self.companion_seat_id:
            if self.companion_seat_id == self.pk:
                raise ValidationError(
                    {"companion_seat": "A seat cannot be its own companion."}
                )
            if self.companion_seat.row.room_id != room.pk:
                raise ValidationError(
                    {"companion_seat": "Companion seat must belong to the same room."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.row.room.name} - {self.row.name}{self.number}"


class SessionSeatStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    RESERVED = "RESERVED", "Reserved"
    PURCHASED = "PURCHASED", "Purchased"


class TicketType(models.TextChoices):
    INTEIRA = "inteira", "Inteira"
    MEIA = "meia", "Meia"
    GRATUITO = "gratuito", "Gratuito"


class PaymentMethod(models.TextChoices):
    CARTAO_CREDITO = "cartao_credito", "Cartao de credito"
    PIX = "pix", "PIX"


class SessionSeat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        "catalog.Session",
        on_delete=models.CASCADE,
        related_name="session_seats",
    )
    seat = models.ForeignKey(
        "reservations.Seat",
        on_delete=models.CASCADE,
        related_name="session_seats",
    )
    status = models.CharField(
        max_length=20,
        choices=SessionSeatStatus.choices,
        default=SessionSeatStatus.AVAILABLE,
    )
    locked_by_user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="locked_session_seats",
    )
    lock_expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reservation_session_seats"
        ordering = ["session", "seat__row__name", "seat__number"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "seat"],
                name="unique_seat_per_session",
            )
        ]
        indexes = [
            models.Index(fields=["session", "status"], name="session_status_idx"),
            models.Index(
                fields=["session", "lock_expires_at"],
                name="session_lock_expires_idx",
            ),
        ]

    def clean(self):
        if self.seat_id and self.session_id:
            if self.seat.row.room_id != self.session.room_id:
                raise ValidationError(
                    {"seat": "Seat must belong to the same room as the session."}
                )

        if self.status == SessionSeatStatus.AVAILABLE:
            if self.locked_by_user is not None:
                raise ValidationError(
                    {"locked_by_user": "Available seats cannot have a locked user."}
                )
            if self.lock_expires_at is not None:
                raise ValidationError(
                    {
                        "lock_expires_at": "Available seats cannot have a lock expiration."
                    }
                )

        elif self.status == SessionSeatStatus.RESERVED:
            if self.locked_by_user is None:
                raise ValidationError(
                    {"locked_by_user": "Reserved seats must have a locked user."}
                )
            if self.lock_expires_at is None:
                raise ValidationError(
                    {"lock_expires_at": "Reserved seats must have a lock expiration."}
                )

        elif self.status == SessionSeatStatus.PURCHASED:
            if self.locked_by_user is not None:
                raise ValidationError(
                    {"locked_by_user": "Purchased seats cannot have a locked user."}
                )
            if self.lock_expires_at is not None:
                raise ValidationError(
                    {
                        "lock_expires_at": "Purchased seats cannot have a lock expiration."
                    }
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return (
            f"{self.session.movie.title} | "
            f"{self.session.room.name} | "
            f"{self.seat.row.name}{self.seat.number} | "
            f"{self.status}"
        )


class Ticket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "users.User",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    session_seat = models.OneToOneField(
        "reservations.SessionSeat",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticket",
    )
    session_snapshot = models.JSONField(null=True, blank=True)
    ticket_code = models.CharField(max_length=64, unique=True, editable=False)
    ticket_type = models.CharField(
        max_length=20,
        choices=TicketType.choices,
        default=TicketType.INTEIRA,
    )
    amount_paid = models.DecimalField(
        max_digits=8,
        decimal_places=2,
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.PIX,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reservation_tickets"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user"], name="ticket_user_idx"),
            models.Index(fields=["ticket_code"], name="ticket_code_idx"),
        ]

    @staticmethod
    def generate_ticket_code() -> str:
        return uuid.uuid4().hex.upper()

    @staticmethod
    def calculate_amount(base_price, ticket_type):
        base_price = Decimal(str(base_price))

        if ticket_type == TicketType.MEIA:
            return (base_price * Decimal("0.50")).quantize(Decimal("0.01"))

        if ticket_type == TicketType.GRATUITO:
            return Decimal("0.00")

        return base_price.quantize(Decimal("0.01"))

    def clean(self):
        errors = {}

        if self.session_seat_id is None and not self.session_snapshot:
            errors["session_snapshot"] = (
                "Tickets without a session seat must keep a session snapshot."
            )

        if self.session_seat_id and self.user_id:
            seat_errors = []
            if self.session_seat.status != SessionSeatStatus.PURCHASED:
                seat_errors.append("Tickets can only be created for purchased session seats.")
            if self.session_seat.locked_by_user is not None:
                seat_errors.append(
                    "Purchased session seats linked to tickets cannot keep a locked user."
                )
            if self.session_seat.lock_expires_at is not None:
                seat_errors.append(
                    "Purchased session seats linked to tickets cannot keep a lock expiration."
                )
            if seat_errors:
                errors["session_seat"] = seat_errors

        if self.session_seat_id and self.ticket_type in TicketType.values:
            expected_amount = self.calculate_amount(
                self.session_seat.session.base_price,
                self.ticket_type,
            )

            if self.amount_paid is None:
                errors["amount_paid"] = "Ticket amount paid is required."
            elif Decimal(self.amount_paid).quantize(Decimal("0.01")) != expected_amount:
                errors["amount_paid"] = (
                    "Ticket amount paid must match the session price and ticket type."
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self.ticket_code:
            self.ticket_code = self.generate_ticket_code()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.ticket_code} | {self.user.email}"
