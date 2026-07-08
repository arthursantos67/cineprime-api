import logging
import re
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from cineprime_api.catalog_translation import translate_text
from cineprime_api.genre_translation import translate_genre_name
from cineprime_api.localization import (
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    available_translation_locales,
    get_context_locale,
    get_translation_value,
    normalize_locale,
    normalize_translation_payload,
)

from catalog.models import CastMember, Genre, Movie, MovieInterest, MovieReview, MovieReviewVote, Room, RoomTypePricing, Session
from reservations.models import SessionSeat, SessionSeatStatus, Seat

logger = logging.getLogger(__name__)

_WEEKEND_WEEKDAYS = {4, 5, 6}  # Friday, Saturday, Sunday

_YOUTUBE_URL_RE = re.compile(
    r"^https?://(?:www\.)?(?:youtube\.com/watch\?(?:.*&)?v=(?P<watch_id>[\w-]{11})"
    r"|youtu\.be/(?P<short_id>[\w-]{11}))(?:[&?].*)?$"
)
_VIMEO_URL_RE = re.compile(r"^https?://(?:www\.)?vimeo\.com/(?P<vimeo_id>\d+)(?:[/?].*)?$")


def normalize_trailer_url(url: str) -> str:
    """Convert plain YouTube/Vimeo links into their embeddable form."""
    youtube_match = _YOUTUBE_URL_RE.match(url)
    if youtube_match:
        video_id = youtube_match.group("watch_id") or youtube_match.group("short_id")
        return f"https://www.youtube.com/embed/{video_id}"

    vimeo_match = _VIMEO_URL_RE.match(url)
    if vimeo_match:
        return f"https://player.vimeo.com/video/{vimeo_match.group('vimeo_id')}"

    return url


def compute_session_price(room_base_price, start_time):
    """Return session ticket price: room base_price with 24% surcharge on Fri/Sat/Sun."""
    price = Decimal(str(room_base_price))
    if start_time.weekday() in _WEEKEND_WEEKDAYS:
        price = price * Decimal("1.24")
    return price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def raise_serializer_validation_error(exc):
    details = getattr(exc, "message_dict", None) or getattr(exc, "messages", None)
    raise serializers.ValidationError(details or str(exc)) from exc


class TranslatedCatalogSerializerMixin(serializers.Serializer):
    translation_fields = ()

    locale = serializers.SerializerMethodField()
    available_locales = serializers.SerializerMethodField()

    def get_locale(self, obj):
        return get_context_locale(self.context)

    def get_available_locales(self, obj):
        return available_translation_locales(
            fields=self.translation_fields,
            translations=getattr(obj, "translations", {}),
        )

    def validate_translations(self, value):
        try:
            return normalize_translation_payload(
                value,
                fields=self.translation_fields,
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def to_representation(self, instance):
        data = super().to_representation(instance)
        locale = get_context_locale(self.context)
        translations = getattr(instance, "translations", {})

        for field in self.translation_fields:
            if field in data:
                data[field] = get_translation_value(
                    fallback_value=getattr(instance, field, "") or "",
                    field=field,
                    locale=locale,
                    translations=translations,
                )

        return data


class GenreSerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("name",)

    source_language = serializers.CharField(
        required=False,
        write_only=True,
        allow_blank=False,
    )

    class Meta:
        model = Genre
        fields = [
            "id",
            "name",
            "translations",
            "source_language",
            "locale",
            "available_locales",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "locale", "available_locales", "created_at", "updated_at"]

    def validate_name(self, value):
        return value.strip()

    def validate_source_language(self, value):
        normalized = normalize_locale(value)
        if normalized is None:
            supported = ", ".join(SUPPORTED_LOCALES)
            raise serializers.ValidationError(
                f"Unsupported locale. Expected one of: {supported}."
            )
        return normalized

    def _check_name_unique(self, name: str, exclude_pk=None) -> None:
        qs = Genre.objects.filter(name__iexact=name)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if qs.exists():
            raise serializers.ValidationError({"name": "A genre with this name already exists."})

    def _resolve_primary_name(self, input_name: str, source_locale: str, translated: dict[str, str]) -> str:
        if source_locale == DEFAULT_LOCALE:
            return input_name
        return translated.get(DEFAULT_LOCALE, input_name)

    def _apply_translation(self, validated_data: dict, source_language: str, instance=None) -> None:
        input_name = validated_data.get("name", instance.name if instance else "")
        translated = translate_genre_name(input_name, source_language)
        if translated:
            validated_data["name"] = self._resolve_primary_name(input_name, source_language, translated)
            validated_data["translations"] = {
                loc: {"name": n}
                for loc, n in translated.items()
                if loc != DEFAULT_LOCALE
            }
        elif source_language != DEFAULT_LOCALE:
            validated_data["translations"] = {source_language: {"name": input_name}}

    def create(self, validated_data):
        source_language = validated_data.pop("source_language", None)
        if source_language:
            self._apply_translation(validated_data, source_language)
        self._check_name_unique(validated_data["name"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        source_language = validated_data.pop("source_language", None)
        if source_language:
            self._apply_translation(validated_data, source_language, instance)
        if "name" in validated_data:
            self._check_name_unique(validated_data["name"], exclude_pk=instance.pk)
        return super().update(instance, validated_data)


class GenreSummarySerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("name",)

    class Meta:
        model = Genre
        fields = ["id", "name", "locale"]
        read_only_fields = ["id", "locale"]


class RoomSerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("display_name", "description")

    source_language = serializers.CharField(
        required=False,
        write_only=True,
        allow_blank=False,
    )

    class Meta:
        model = Room
        fields = [
            "id",
            "name",
            "capacity",
            "max_center_seats_per_row",
            "accessible_row_index",
            "experience_type",
            "display_name",
            "description",
            "translations",
            "source_language",
            "locale",
            "available_locales",
            "base_price",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "base_price",
            "locale",
            "available_locales",
            "created_at",
            "updated_at",
        ]

    def validate_source_language(self, value):
        normalized = normalize_locale(value)
        if normalized is None:
            supported = ", ".join(SUPPORTED_LOCALES)
            raise serializers.ValidationError(
                f"Unsupported locale. Expected one of: {supported}."
            )
        return normalized

    def validate_capacity(self, value):
        if self.instance is None:
            return value

        actual_seat_count = Seat.objects.filter(row__room=self.instance).count()
        if value < actual_seat_count:
            raise serializers.ValidationError(
                "Room capacity cannot be lower than the number of registered seats."
            )

        return value

    def _apply_display_name_translation(self, validated_data: dict, source_language: str) -> None:
        input_display_name = validated_data.get("display_name", "")
        if not input_display_name:
            return

        translated = translate_text(input_display_name, source_language)
        if not translated:
            return

        expected_locales = set(SUPPORTED_LOCALES) - {source_language}
        missing = expected_locales - set(translated.keys())
        if missing:
            logger.warning(
                "Auto-translation incomplete for display_name %r: missing locales %s",
                input_display_name,
                sorted(missing),
            )

        existing_translations = dict(validated_data.get("translations") or {})

        for loc, text in translated.items():
            if loc == DEFAULT_LOCALE:
                if source_language == DEFAULT_LOCALE:
                    validated_data["display_name"] = text
            else:
                locale_entry = dict(existing_translations.get(loc) or {})
                locale_entry["display_name"] = text
                existing_translations[loc] = locale_entry

        if source_language != DEFAULT_LOCALE and DEFAULT_LOCALE in translated:
            validated_data["display_name"] = translated[DEFAULT_LOCALE]

        validated_data["translations"] = existing_translations

    def create(self, validated_data):
        source_language = validated_data.pop("source_language", None)
        if source_language:
            self._apply_display_name_translation(validated_data, source_language)

        room = Room(**validated_data)

        try:
            room.save()
        except DjangoValidationError as exc:
            raise_serializer_validation_error(exc)

        return room

    def update(self, instance, validated_data):
        source_language = validated_data.pop("source_language", None)
        if source_language:
            self._apply_display_name_translation(validated_data, source_language)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        try:
            instance.save()
        except DjangoValidationError as exc:
            raise_serializer_validation_error(exc)

        return instance


class RoomSummarySerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("display_name", "description")

    class Meta:
        model = Room
        fields = [
            "id",
            "name",
            "capacity",
            "max_center_seats_per_row",
            "accessible_row_index",
            "experience_type",
            "display_name",
            "description",
            "locale",
        ]
        read_only_fields = ["id", "locale"]


class RoomTypePricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomTypePricing
        fields = ["id", "experience_type", "base_price", "updated_at"]
        read_only_fields = ["id", "experience_type", "updated_at"]


class MovieWriteSerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("title", "synopsis")

    genres = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Genre.objects.all(),
    )
    cast = serializers.ListField(
        child=serializers.CharField(max_length=255),
        required=False,
        default=list,
        write_only=True,
    )

    class Meta:
        model = Movie
        fields = [
            "id",
            "title",
            "genres",
            "synopsis",
            "translations",
            "locale",
            "available_locales",
            "duration_minutes",
            "release_date",
            "poster_url",
            "spotlight_url",
            "ticket_image_url",
            "trailer_url",
            "age_rating",
            "classification_description",
            "director",
            "cast",
            "status",
            "is_featured",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "locale", "available_locales", "created_at", "updated_at"]

    def validate_trailer_url(self, value):
        if not value:
            return value
        return normalize_trailer_url(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["cast"] = [m.name for m in instance.cast.all()]
        return data

    @transaction.atomic
    def create(self, validated_data):
        cast_names = validated_data.pop("cast", [])
        movie = super().create(validated_data)
        CastMember.objects.bulk_create(
            [CastMember(movie=movie, name=name, order=i) for i, name in enumerate(cast_names)]
        )
        return movie

    @transaction.atomic
    def update(self, instance, validated_data):
        cast_names = validated_data.pop("cast", None)
        movie = super().update(instance, validated_data)
        if cast_names is not None:
            instance.cast.all().delete()
            CastMember.objects.bulk_create(
                [CastMember(movie=movie, name=name, order=i) for i, name in enumerate(cast_names)]
            )
        return movie


class MovieReadSerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("title", "synopsis")

    genres = GenreSummarySerializer(many=True, read_only=True)
    cast = serializers.SerializerMethodField()
    average_rating = serializers.FloatField(read_only=True, allow_null=True)
    review_count = serializers.IntegerField(read_only=True)

    def get_cast(self, obj):
        return [m.name for m in obj.cast.all()]

    class Meta:
        model = Movie
        fields = [
            "id",
            "title",
            "genres",
            "synopsis",
            "translations",
            "locale",
            "available_locales",
            "duration_minutes",
            "release_date",
            "poster_url",
            "spotlight_url",
            "ticket_image_url",
            "trailer_url",
            "age_rating",
            "classification_description",
            "director",
            "cast",
            "status",
            "is_featured",
            "average_rating",
            "review_count",
            "created_at",
            "updated_at",
        ]


class MovieSummarySerializer(TranslatedCatalogSerializerMixin, serializers.ModelSerializer):
    translation_fields = ("title", "synopsis")

    genres = GenreSummarySerializer(many=True, read_only=True)
    cast = serializers.SerializerMethodField()
    average_rating = serializers.FloatField(read_only=True, allow_null=True)
    review_count = serializers.IntegerField(read_only=True)

    def get_cast(self, obj):
        return [m.name for m in obj.cast.all()]

    class Meta:
        model = Movie
        fields = [
            "id",
            "title",
            "genres",
            "translations",
            "locale",
            "available_locales",
            "duration_minutes",
            "release_date",
            "poster_url",
            "spotlight_url",
            "trailer_url",
            "age_rating",
            "classification_description",
            "director",
            "cast",
            "status",
            "is_featured",
            "average_rating",
            "review_count",
        ]


class SessionWriteSerializer(serializers.ModelSerializer):
    extra_dates = serializers.ListField(
        child=serializers.DateField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Session
        fields = [
            "id",
            "movie",
            "room",
            "start_time",
            "end_time",
            "base_price",
            "audio_format",
            "projection_format",
            "session_type",
            "extra_dates",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "base_price", "created_at", "updated_at"]

    def validate_extra_dates(self, value):
        if self.instance is not None:
            raise serializers.ValidationError(
                "extra_dates is only supported when creating a session."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if (
            self.instance is not None
            and "room" in attrs
            and attrs["room"] != self.instance.room
        ):
            raise serializers.ValidationError(
                {"room": ("Updating the room of an existing session is not supported.")}
            )

        if self.instance is not None:
            protected_session_fields = ["movie", "room", "start_time", "end_time"]
            changed_protected_fields = [
                field
                for field in protected_session_fields
                if field in attrs and attrs[field] != getattr(self.instance, field)
            ]

            if changed_protected_fields:
                has_reserved_or_purchased_seats = SessionSeat.objects.filter(
                    session=self.instance,
                    status__in=[
                        SessionSeatStatus.RESERVED,
                        SessionSeatStatus.PURCHASED,
                    ],
                ).exists()

                if has_reserved_or_purchased_seats:
                    raise serializers.ValidationError(
                        {
                            field: (
                                "Sessions with reserved or purchased seats cannot change movie, room, or time."
                            )
                            for field in changed_protected_fields
                        }
                    )

        movie = attrs.get("movie") or (self.instance.movie if self.instance else None)
        start_time = attrs.get("start_time") or (
            self.instance.start_time if self.instance else None
        )
        end_time = attrs.get("end_time") or (
            self.instance.end_time if self.instance else None
        )

        if movie and start_time and end_time:
            min_end = start_time + timedelta(minutes=movie.duration_minutes)
            tolerance = timedelta(minutes=5)
            if end_time < min_end - tolerance:
                raise serializers.ValidationError(
                    {
                        "end_time": (
                            f"End time must be at least {movie.duration_minutes} minutes after start time "
                            f"(movie runtime). Minimum end time: {min_end.isoformat()}."
                        )
                    }
                )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        extra_dates = validated_data.pop("extra_dates", [])
        room = validated_data["room"]
        base_start_time = validated_data["start_time"]
        duration = validated_data["end_time"] - base_start_time

        sessions_data = [dict(validated_data)]
        for extra_date in extra_dates:
            extra_start_time = base_start_time.replace(
                year=extra_date.year, month=extra_date.month, day=extra_date.day
            )
            sessions_data.append(
                {
                    **validated_data,
                    "start_time": extra_start_time,
                    "end_time": extra_start_time + duration,
                }
            )

        created_sessions = []
        for index, session_data in enumerate(sessions_data):
            session_data["base_price"] = compute_session_price(
                room.base_price, session_data["start_time"]
            )
            session = Session(**session_data)
            try:
                session.save()
            except DjangoValidationError as exc:
                if index == 0:
                    raise_serializer_validation_error(exc)
                details = (
                    getattr(exc, "message_dict", None)
                    or getattr(exc, "messages", None)
                    or str(exc)
                )
                raise serializers.ValidationError(
                    {"extra_dates": {session_data["start_time"].date().isoformat(): details}}
                ) from exc
            created_sessions.append(session)

        seats = list(Seat.objects.select_related("row").filter(row__room=room))
        SessionSeat.objects.bulk_create(
            [
                SessionSeat(session=session, seat=seat)
                for session in created_sessions
                for seat in seats
            ]
        )

        if len(created_sessions) == 1:
            return created_sessions[0]
        return created_sessions

    def update(self, instance, validated_data):
        if "start_time" in validated_data:
            validated_data["base_price"] = compute_session_price(
                instance.room.base_price, validated_data["start_time"]
            )

        for field, value in validated_data.items():
            setattr(instance, field, value)

        try:
            instance.save()
        except DjangoValidationError as exc:
            raise_serializer_validation_error(exc)

        return instance


class MovieInterestStatusSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    user_interested = serializers.BooleanField(allow_null=True)


class SessionReadSerializer(serializers.ModelSerializer):
    movie = MovieSummarySerializer(read_only=True)
    room = RoomSummarySerializer(read_only=True)

    class Meta:
        model = Session
        fields = [
            "id",
            "movie",
            "room",
            "start_time",
            "end_time",
            "base_price",
            "audio_format",
            "projection_format",
            "session_type",
            "created_at",
            "updated_at",
        ]


class MovieReviewUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(read_only=True)

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "username": instance.username,
        }


class MovieReviewSerializer(serializers.ModelSerializer):
    user = MovieReviewUserSerializer(read_only=True)
    like_count = serializers.IntegerField(read_only=True, default=0)
    dislike_count = serializers.IntegerField(read_only=True, default=0)
    user_vote = serializers.CharField(read_only=True, allow_null=True, default=None)

    class Meta:
        model = MovieReview
        fields = ["id", "user", "rating", "comment", "like_count", "dislike_count", "user_vote", "created_at", "updated_at"]
        read_only_fields = ["id", "user", "like_count", "dislike_count", "user_vote", "created_at", "updated_at"]

    def validate_rating(self, value):
        from decimal import Decimal, InvalidOperation
        try:
            d = Decimal(str(value))
        except InvalidOperation:
            raise serializers.ValidationError("Rating must be a number.")
        if d < Decimal("0.5") or d > Decimal("5.0"):
            raise serializers.ValidationError("Rating must be between 0.5 and 5.")
        if (d * 2) != int(d * 2):
            raise serializers.ValidationError("Rating must be a multiple of 0.5.")
        return d
