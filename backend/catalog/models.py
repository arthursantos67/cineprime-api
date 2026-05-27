import uuid
from decimal import Decimal

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.apps import apps
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Func


class MovieStatus(models.TextChoices):
    EM_CARTAZ = "em_cartaz", "Em cartaz"
    PRE_VENDA = "pre_venda", "Pre-venda"
    EM_BREVE = "em_breve", "Em breve"


class Movie(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    genres = models.ManyToManyField(
        "Genre",
        related_name="movies",
    )
    synopsis = models.TextField()
    duration_minutes = models.PositiveIntegerField()
    release_date = models.DateField()
    poster_url = models.URLField(max_length=500)
    status = models.CharField(
        max_length=20,
        choices=MovieStatus.choices,
        default=MovieStatus.EM_CARTAZ,
    )
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "movies"
        ordering = ["title"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(duration_minutes__gt=0),
                name="movie_duration_minutes_gt_0",
            ),
            models.UniqueConstraint(
                fields=["title", "release_date"],
                name="unique_movie_title_release_date",
            ),
        ]

    def __str__(self):
        return self.title


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    capacity = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rooms"
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(capacity__gt=0),
                name="room_capacity_gt_0",
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()

        if not self.pk:
            return

        Seat = apps.get_model("reservations", "Seat")
        actual_seat_count = Seat.objects.filter(row__room=self).count()

        if self.capacity < actual_seat_count:
            raise ValidationError(
                {
                    "capacity": (
                        "Room capacity cannot be lower than the number of registered seats."
                    )
                }
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    movie = models.ForeignKey(
        Movie,
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    base_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()

        if self.end_time <= self.start_time:
            raise ValidationError({"end_time": "End time must be after start time."})

        if self.pk:
            try:
                original_session = Session.objects.get(pk=self.pk)
            except Session.DoesNotExist:
                original_session = None

        if self.pk and original_session is not None:
            sensitive_fields = [
                "movie_id",
                "room_id",
                "start_time",
                "end_time",
                "base_price",
            ]
            sensitive_fields_changed = any(
                getattr(self, field) != getattr(original_session, field)
                for field in sensitive_fields
            )

            if sensitive_fields_changed:
                from reservations.models import SessionSeatStatus

                SessionSeat = apps.get_model("reservations", "SessionSeat")
                sensitive_statuses = [
                    SessionSeatStatus.RESERVED,
                    SessionSeatStatus.PURCHASED,
                ]

                has_reserved_or_purchased_seats = SessionSeat.objects.filter(
                    session=self,
                    status__in=sensitive_statuses,
                ).exists()

                if has_reserved_or_purchased_seats:
                    raise ValidationError(
                        {
                            "session": (
                                "Sessions with reserved or purchased seats cannot change movie, room, time, or price."
                            )
                        }
                    )

        overlapping_sessions = Session.objects.filter(
            room=self.room,
            start_time__lt=self.end_time,
            end_time__gt=self.start_time,
        )

        if self.pk:
            overlapping_sessions = overlapping_sessions.exclude(pk=self.pk)

        if overlapping_sessions.exists():
            raise ValidationError(
                {
                    "room": "This room already has a session scheduled for the selected time range."
                }
            )

    class Meta:
        db_table = "sessions"
        ordering = ["start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="session_end_time_gt_start_time",
            ),
            models.CheckConstraint(
                condition=models.Q(base_price__gt=0),
                name="session_base_price_gt_0",
            ),
            ExclusionConstraint(
                name="exclude_overlapping_sessions_per_room",
                expressions=[
                    (
                        Func(
                            F("start_time"),
                            F("end_time"),
                            function="TSTZRANGE",
                            output_field=DateTimeRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                    ("room", RangeOperators.EQUAL),
                ],
            ),
        ]

    def __str__(self):
        return f"{self.movie.title} - {self.room.name} - {self.start_time}"

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class Genre(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "genres"
        ordering = ["name"]

    def __str__(self):
        return self.name
