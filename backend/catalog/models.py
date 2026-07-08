import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.apps import apps
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Func


class MovieStatus(models.TextChoices):
    EM_CARTAZ = "em_cartaz", "Em cartaz"
    PRE_VENDA = "pre_venda", "Pre-venda"
    EM_BREVE = "em_breve", "Em breve"


class AgeRating(models.TextChoices):
    LIVRE = "L", "Livre"
    TEN = "10", "10 anos"
    TWELVE = "12", "12 anos"
    FOURTEEN = "14", "14 anos"
    SIXTEEN = "16", "16 anos"
    EIGHTEEN = "18", "18 anos"


class RoomExperienceType(models.TextChoices):
    STANDARD = "standard", "Traditional"
    VIP = "vip", "VIP"
    PREMIUM = "premium", "Premium"
    IMAX = "imax", "IMAX"


class AudioFormat(models.TextChoices):
    ORIGINAL = "original", "Original"
    SUBTITLED = "legendado", "Subtitled"
    DUBBED = "dublado", "Dubbed"


class ProjectionFormat(models.TextChoices):
    TWO_D = "2d", "2D"
    THREE_D = "3d", "3D"
    IMAX = "imax", "IMAX"


class SessionType(models.TextChoices):
    REGULAR = "regular", "Regular"
    PREVIEW = "preview", "Preview"
    SPECIAL_EVENT = "special_event", "Special event"


class Movie(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    genres = models.ManyToManyField(
        "Genre",
        related_name="movies",
    )
    synopsis = models.TextField()
    translations = models.JSONField(default=dict, blank=True)
    duration_minutes = models.PositiveIntegerField()
    release_date = models.DateField()
    poster_url = models.URLField(max_length=500)
    spotlight_url = models.URLField(max_length=500, null=True, blank=True)
    ticket_image_url = models.URLField(
        max_length=500,
        null=True,
        blank=True,
        verbose_name="Imagem de fundo do ingresso",
        help_text="Imagem horizontal (paisagem), proporção ideal 16:9 (ex.: 1280×720).",
    )
    trailer_url = models.URLField(max_length=500, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=MovieStatus.choices,
        default=MovieStatus.EM_CARTAZ,
    )
    age_rating = models.CharField(
        max_length=2,
        choices=AgeRating.choices,
        blank=True,
        default="",
        verbose_name="Faixa etária",
    )
    classification_description = models.TextField(blank=True, default="", verbose_name="Descrição da classificação")
    director = models.CharField(max_length=255, blank=True, default="", verbose_name="Direção")
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


class RoomTypePricing(models.Model):
    experience_type = models.CharField(
        max_length=30,
        choices=RoomExperienceType.choices,
        unique=True,
    )
    base_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "room_type_pricing"
        ordering = ["experience_type"]

    def __str__(self):
        return f"{self.experience_type}: {self.base_price}"


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    capacity = models.PositiveIntegerField()
    experience_type = models.CharField(
        max_length=30,
        choices=RoomExperienceType.choices,
        blank=True,
        default="",
    )
    display_name = models.CharField(max_length=120, blank=True, default="")
    description = models.TextField(blank=True, default="")
    max_center_seats_per_row = models.PositiveIntegerField(null=True, blank=True)
    accessible_row_index = models.PositiveIntegerField(default=0)
    translations = models.JSONField(default=dict, blank=True)
    base_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
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
        effective_type = self.experience_type or "standard"
        try:
            pricing = RoomTypePricing.objects.get(experience_type=effective_type)
            self.base_price = pricing.base_price
        except ObjectDoesNotExist:
            if not self.base_price:
                self.base_price = Decimal("25.00")
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
    audio_format = models.CharField(
        max_length=30,
        choices=AudioFormat.choices,
        blank=True,
        default="",
    )
    projection_format = models.CharField(
        max_length=30,
        choices=ProjectionFormat.choices,
        blank=True,
        default="",
    )
    session_type = models.CharField(
        max_length=30,
        choices=SessionType.choices,
        blank=True,
        default="",
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


class CastMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="cast")
    name = models.CharField(max_length=255)
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Ordem")

    class Meta:
        db_table = "cast_members"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class MovieInterest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="interests")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="movie_interests",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "movie_interests"
        constraints = [
            models.UniqueConstraint(
                fields=["movie", "user"],
                name="unique_movie_interest_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} → {self.movie}"


class MovieReview(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="movie_reviews",
    )
    rating = models.DecimalField(max_digits=3, decimal_places=1)
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "movie_reviews"
        constraints = [
            models.UniqueConstraint(
                fields=["movie", "user"],
                name="unique_movie_review_per_user",
            ),
            models.CheckConstraint(
                condition=models.Q(rating__gte=Decimal("0.5")) & models.Q(rating__lte=Decimal("5.0")),
                name="movie_review_rating_half_to_5",
            ),
        ]

    def __str__(self):
        return f"{self.user} → {self.movie} ({self.rating}★)"


class MovieReviewVote(models.Model):
    LIKE = "like"
    DISLIKE = "dislike"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review = models.ForeignKey(MovieReview, on_delete=models.CASCADE, related_name="votes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_votes",
    )
    vote = models.CharField(max_length=7, choices=[(LIKE, "Like"), (DISLIKE, "Dislike")])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "movie_review_votes"
        constraints = [
            models.UniqueConstraint(
                fields=["review", "user"],
                name="unique_review_vote_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} → {self.review_id} ({self.vote})"


class Genre(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    translations = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "genres"
        ordering = ["name"]

    def __str__(self):
        return self.name
