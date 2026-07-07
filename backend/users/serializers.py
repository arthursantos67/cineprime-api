from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db import connection, transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from users.exceptions import WrongPassword
from users.models import AdminPermissionLog, User, WalletTransaction
from reservations.models import Ticket


class TmdbTokenResponseSerializer(serializers.Serializer):
    configured = serializers.BooleanField()
    hint = serializers.CharField(allow_null=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


class TmdbTokenBodySerializer(serializers.Serializer):
    value = serializers.CharField(min_length=1, max_length=2000)


class ProfileUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(required=False)
    current_password = serializers.CharField(
        write_only=True, required=False, trim_whitespace=False
    )

    def validate_username(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("This field may not be blank.")

        user = self.context["request"].user
        if User.objects.filter(username=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("This username is already taken.")

        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        current_password = attrs.pop("current_password", None)

        if not attrs:
            raise serializers.ValidationError(
                "Provide at least one field to update: username or email."
            )

        # Changing the account email is an account-takeover-grade operation:
        # require re-authentication so a hijacked session alone is not enough.
        if "email" in attrs:
            user = self.context["request"].user
            if not current_password or not user.check_password(current_password):
                raise WrongPassword()

        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    # new_password is validated in the view with user context, so validators
    # like UserAttributeSimilarityValidator can compare against email/username.
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ("id", "amount", "reason", "reference", "created_at")
        read_only_fields = fields


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
    )

    class Meta:
        model = User
        fields = ("id", "email", "username", "password", "created_at")
        read_only_fields = ("id", "created_at")
        # Disable the auto-added UniqueValidator so we can return a generic message
        # that does not confirm whether a given email address is already registered.
        extra_kwargs = {
            "email": {"validators": []},
        }

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError(
                "Unable to register with the provided details."
            )
        return normalized

    def validate_username(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("This field may not be blank.")

        return value

    def create(self, validated_data):
        # The very first account in an empty database becomes the protected
        # master admin, so a fresh install always has an owner that cannot be
        # locked out or demoted by later accounts.
        with transaction.atomic():
            is_first_user = False
            if not User.objects.exists():
                # Serialize only the bootstrap path: concurrent registrations
                # against an empty database could otherwise both pass the
                # exists() check (READ COMMITTED) and create two protected
                # masters. The lock is only ever taken with an empty table,
                # so normal registrations never wait on it.
                if connection.vendor == "postgresql":
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [713001])
                is_first_user = not User.objects.exists()

            user = User.objects.create_user(**validated_data)

            if is_first_user:
                user.is_staff = True
                user.is_superuser = True
                user.is_protected_master = True
                user.is_verified = True
                user.save(
                    update_fields=[
                        "is_staff",
                        "is_superuser",
                        "is_protected_master",
                        "is_verified",
                        "updated_at",
                    ]
                )

        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        email = attrs["email"]
        password = attrs["password"]

        user = authenticate(
            request=self.context.get("request"),
            username=email,
            password=password,
        )

        if user is None:
            raise AuthenticationFailed("Invalid credentials.")

        if not user.is_active:
            raise AuthenticationFailed("User account is disabled.")

        attrs["user"] = user
        return attrs


class UserTicketSessionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()


class UserTicketRoomSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class UserTicketMovieSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    poster_url = serializers.URLField(allow_null=True)


class UserTicketSeatSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    row = serializers.CharField()
    number = serializers.IntegerField()
    identifier = serializers.CharField()


class UserTicketSerializer(serializers.ModelSerializer):
    ticket_id = serializers.UUIDField(source="id")
    ticket_code = serializers.CharField()
    created_at = serializers.DateTimeField()

    session = serializers.SerializerMethodField()
    room = serializers.SerializerMethodField()
    movie = serializers.SerializerMethodField()
    seat = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = (
            "ticket_id",
            "ticket_code",
            "ticket_type",
            "amount_paid",
            "payment_method",
            "created_at",
            "session",
            "room",
            "movie",
            "seat",
        )

    @extend_schema_field(UserTicketSessionSerializer)
    def get_session(self, obj):
        if obj.session_seat_id is None:
            return (obj.session_snapshot or {}).get("session")

        session = obj.session_seat.session
        return {
            "id": str(session.id),
            "start_time": session.start_time,
            "end_time": session.end_time,
        }

    @extend_schema_field(UserTicketRoomSerializer)
    def get_room(self, obj):
        if obj.session_seat_id is None:
            snapshot = (obj.session_snapshot or {}).get("room")
            if not snapshot:
                return None
            return {
                "id": snapshot["id"],
                "name": snapshot["name"],
            }

        room = obj.session_seat.session.room
        return {
            "id": str(room.id),
            "name": room.display_name or room.name,
        }

    @extend_schema_field(UserTicketMovieSerializer)
    def get_movie(self, obj):
        if obj.session_seat_id is None:
            snapshot = (obj.session_snapshot or {}).get("movie")
            if not snapshot:
                return None
            return {
                "id": snapshot["id"],
                "title": snapshot["title"],
                "poster_url": snapshot["poster_url"],
            }

        movie = obj.session_seat.session.movie
        return {
            "id": str(movie.id),
            "title": movie.title,
            "poster_url": movie.poster_url,
        }

    @extend_schema_field(UserTicketSeatSerializer)
    def get_seat(self, obj):
        if obj.session_seat_id is None:
            return (obj.session_snapshot or {}).get("seat")

        seat = obj.session_seat.seat
        return {
            "id": str(seat.id),
            "row": seat.row.name,
            "number": seat.number,
            "identifier": f"{seat.row.name}{seat.number}",
        }


class UserListSerializer(serializers.ModelSerializer):
    role = serializers.CharField(read_only=True)
    is_protected = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "username", "is_staff", "role", "is_protected", "created_at")
        read_only_fields = fields

    def get_is_protected(self, obj) -> bool:
        return obj.is_protected


class AdminPermissionLogSerializer(serializers.ModelSerializer):
    actor = serializers.EmailField(source="actor.email", read_only=True)
    target = serializers.EmailField(source="target.email", read_only=True)

    class Meta:
        model = AdminPermissionLog
        fields = ("actor", "target", "action", "role", "created_at")
