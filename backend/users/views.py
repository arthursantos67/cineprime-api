import logging

from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from decimal import Decimal

from django.db import transaction
from django.db.models import Case, IntegerField, Q, Sum, Value, When
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework import serializers
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from cryptography.fernet import InvalidToken

from cineprime_api.encryption import decrypt_value, encrypt_value
from cineprime_api.localization import get_request_locale
from cineprime_api.permissions import IsMasterUser
from cineprime_api.throttling import (
    EmailChangeRateThrottle,
    EmailVerificationResendRateThrottle,
    GlobalUserRateThrottle,
    LoginRateThrottle,
    PasswordResetEmailRateThrottle,
    PasswordResetRateThrottle,
    RegistrationRateThrottle,
)
from reservations.models import SessionSeat, SessionSeatStatus, Ticket
from users.models import AdminPermissionLog, SiteConfig, User, WalletTransaction
from users.serializers import (
    AdminPermissionLogSerializer,
    ChangePasswordSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    TmdbTokenBodySerializer,
    TmdbTokenResponseSerializer,
    UserLoginSerializer,
    UserListSerializer,
    UserRegistrationSerializer,
    UserTicketSerializer,
    WalletTransactionSerializer,
)
from users.tokens import (
    generate_email_change_token,
    resolve_email_change_payload,
    resolve_email_verification_user_id,
)

logger = logging.getLogger(__name__)


class HasActiveTickets(APIException):
    status_code = 409
    default_code = "HAS_ACTIVE_TICKETS"
    default_detail = "User has active tickets."

    def __init__(self, ticket_count=0):
        super().__init__()
        self.ticket_count = ticket_count


class OnlyMasterAdmin(APIException):
    status_code = 400
    default_code = "ONLY_MASTER_ADMIN"
    default_detail = "You are the only master admin. Promote another user to master before deleting your account."


class ProtectedTransferRequired(APIException):
    status_code = 400
    default_code = "PROTECTED_TRANSFER_REQUIRED"
    default_detail = "You are the protected master. Designate a successor master before deleting your account."


class WrongPassword(APIException):
    status_code = 400
    default_code = "WRONG_PASSWORD"
    default_detail = "Incorrect password."


def _delete_user_cascade(user):
    with transaction.atomic():
        SessionSeat.objects.filter(
            ticket__user=user,
            session__start_time__gt=timezone.now(),
        ).update(
            status=SessionSeatStatus.AVAILABLE,
            locked_by_user=None,
            lock_expires_at=None,
        )
        Ticket.objects.filter(user=user).delete()
        AdminPermissionLog.objects.filter(target=user).delete()
        user.delete()


class UserLoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class TokenRefreshResponseSerializer(serializers.Serializer):
    access = serializers.CharField()


class CurrentUserResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    username = serializers.CharField()
    created_at = serializers.DateTimeField()
    is_staff = serializers.BooleanField()
    is_verified = serializers.BooleanField()
    role = serializers.CharField()


class EmailVerificationResponseSerializer(serializers.Serializer):
    verified = serializers.BooleanField()
    already_verified = serializers.BooleanField()


class PasswordResetRequestResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


class InvalidVerificationToken(APIException):
    status_code = 400
    default_code = "INVALID_VERIFICATION_TOKEN"
    default_detail = "Invalid or expired verification link."


class InvalidPasswordResetToken(APIException):
    status_code = 400
    default_code = "INVALID_RESET_TOKEN"
    default_detail = "Invalid or expired password reset link."


class InvalidEmailChangeToken(APIException):
    status_code = 400
    default_code = "INVALID_EMAIL_CHANGE_TOKEN"
    default_detail = "Invalid or expired email change confirmation link."


class ProfileUpdateResponseSerializer(CurrentUserResponseSerializer):
    email_change_requested = serializers.BooleanField()


class EmailChangeConfirmResponseSerializer(serializers.Serializer):
    email = serializers.EmailField()
    changed = serializers.BooleanField()


class ChangePasswordResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


PASSWORD_RESET_REQUESTED_MESSAGE = (
    "If an account exists for this email, a password reset link has been sent."
)


@extend_schema_view(
    post=extend_schema(
        tags=["Auth"],
        summary="Register user",
        description="Create a new user account.",
        request=UserRegistrationSerializer,
        responses={
            201: UserRegistrationSerializer,
            400: OpenApiResponse(description="Validation error."),
        },
    )
)
class UserRegistrationView(CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationRateThrottle]

    def perform_create(self, serializer):
        user = serializer.save()

        from users.tasks import send_email_verification_email_task

        try:
            send_email_verification_email_task.apply_async(
                args=[str(user.id), get_request_locale(self.request)]
            )
        except Exception:
            logger.exception(
                "Failed to enqueue verification email for user %s", user.id
            )


@extend_schema_view(
    post=extend_schema(
        tags=["Auth"],
        summary="Login user",
        description="Authenticate with email and password and return JWT tokens.",
        request=UserLoginSerializer,
        responses={
            200: UserLoginResponseSerializer,
            401: OpenApiResponse(description="Invalid credentials."),
            429: OpenApiResponse(description="Too many login attempts."),
        },
    )
)
class UserLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = UserLoginSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


@extend_schema_view(
    post=extend_schema(
        tags=["Auth"],
        summary="Refresh access token",
        description="Issue a new JWT access token from a valid refresh token.",
        request=TokenRefreshSerializer,
        responses={
            200: TokenRefreshResponseSerializer,
            401: OpenApiResponse(description="Invalid or expired refresh token."),
        },
    )
)
class UserTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


@extend_schema(
    tags=["Auth"],
    summary="Verify email",
    description="Confirm a user's email address using the signed token sent by email.",
    responses={
        200: EmailVerificationResponseSerializer,
        400: OpenApiResponse(description="Invalid or expired token."),
    },
)
class EmailVerificationView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token, *args, **kwargs):
        user_id = resolve_email_verification_user_id(token)
        if user_id is None:
            raise InvalidVerificationToken()

        try:
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, DjangoValidationError):
            raise InvalidVerificationToken()

        if user.is_verified:
            return Response(
                {"verified": True, "already_verified": True},
                status=status.HTTP_200_OK,
            )

        user.is_verified = True
        user.save(update_fields=["is_verified", "updated_at"])
        return Response(
            {"verified": True, "already_verified": False},
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Auth"],
    summary="Resend verification email",
    description="Re-send the email verification link to the authenticated user, if not yet verified.",
    request=None,
    responses={200: EmailVerificationResponseSerializer},
)
class ResendEmailVerificationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [EmailVerificationResendRateThrottle]

    def post(self, request, *args, **kwargs):
        user = request.user

        if user.is_verified:
            return Response(
                {"verified": True, "already_verified": True},
                status=status.HTTP_200_OK,
            )

        from users.tasks import send_email_verification_email_task

        try:
            send_email_verification_email_task.apply_async(
                args=[str(user.id), get_request_locale(request)]
            )
        except Exception:
            logger.exception(
                "Failed to enqueue verification email for user %s", user.id
            )
        return Response(
            {"verified": False, "already_verified": False},
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Auth"],
    summary="Request password reset",
    description=(
        "Request a password reset email. Always returns a generic response, "
        "whether or not the email is registered, to avoid account enumeration."
    ),
    request=PasswordResetRequestSerializer,
    responses={
        200: PasswordResetRequestResponseSerializer,
        429: OpenApiResponse(description="Too many password reset requests."),
    },
)
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle, PasswordResetEmailRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email=email, is_active=True).first()
        if user is not None:
            from users.tasks import send_password_reset_email_task

            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            try:
                send_password_reset_email_task.apply_async(
                    args=[str(user.id), uid, token, get_request_locale(request)]
                )
            except Exception:
                logger.exception(
                    "Failed to enqueue password reset email for user %s", user.id
                )

        return Response(
            {"detail": PASSWORD_RESET_REQUESTED_MESSAGE},
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Auth"],
    summary="Confirm password reset",
    description="Set a new password using a valid password reset token.",
    request=PasswordResetConfirmSerializer,
    responses={
        200: OpenApiResponse(description="Password updated."),
        400: OpenApiResponse(
            description="Invalid, expired, or already-used token; or invalid password."
        ),
    },
)
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist, DjangoValidationError):
            raise InvalidPasswordResetToken()

        if not default_token_generator.check_token(user, token):
            raise InvalidPasswordResetToken()

        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])

        return Response(
            {"detail": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Auth"],
    summary="Confirm email change",
    description=(
        "Apply a pending email change using the signed token sent to the new "
        "address. Marks the account as verified, since the user proved "
        "control of the new email."
    ),
    responses={
        200: EmailChangeConfirmResponseSerializer,
        400: OpenApiResponse(description="Invalid, expired, or conflicting token."),
    },
)
class EmailChangeConfirmView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token, *args, **kwargs):
        payload = resolve_email_change_payload(token)
        if payload is None:
            raise InvalidEmailChangeToken()

        try:
            user = User.objects.get(pk=payload["user_id"])
        except (User.DoesNotExist, ValueError, DjangoValidationError):
            raise InvalidEmailChangeToken()

        new_email = str(payload["new_email"]).strip().lower()

        if user.email == new_email:
            return Response(
                {"email": user.email, "changed": False},
                status=status.HTTP_200_OK,
            )

        if User.objects.filter(email=new_email).exclude(pk=user.pk).exists():
            raise InvalidEmailChangeToken()

        user.email = new_email
        user.is_verified = True
        user.save(update_fields=["email", "is_verified", "updated_at"])

        return Response(
            {"email": user.email, "changed": True},
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Users"],
    summary="Change own password",
    description=(
        "Rotate the authenticated user's password by providing the current "
        "one. This is separate from the password reset flow, which is for "
        "users who are locked out."
    ),
    request=ChangePasswordSerializer,
    responses={
        200: ChangePasswordResponseSerializer,
        400: OpenApiResponse(description="Wrong current password or invalid new password."),
    },
)
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            raise WrongPassword()

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])

        return Response(
            {"detail": "Password changed successfully."},
            status=status.HTTP_200_OK,
        )


class WalletResponseSerializer(serializers.Serializer):
    balance = serializers.CharField()
    transactions = WalletTransactionSerializer(many=True)


@extend_schema(
    tags=["Users"],
    summary="Get wallet balance and transactions",
    description=(
        "Return the authenticated user's internal store-credit balance and "
        "recent transaction history. This wallet holds CinePrime store "
        "credit only (e.g. refunds issued by staff) — it is not a real-money "
        "wallet and involves no payment gateway or custody of funds."
    ),
    responses={200: WalletResponseSerializer},
)
class CurrentUserWalletView(APIView):
    permission_classes = [IsAuthenticated]

    MAX_TRANSACTIONS = 50

    def get(self, request, *args, **kwargs):
        transactions = WalletTransaction.objects.filter(user=request.user)[
            : self.MAX_TRANSACTIONS
        ]
        balance = (
            WalletTransaction.objects.filter(user=request.user).aggregate(
                total=Sum("amount")
            )["total"]
            or Decimal("0.00")
        )

        return Response(
            {
                "balance": str(balance.quantize(Decimal("0.01"))),
                "transactions": WalletTransactionSerializer(
                    transactions, many=True
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class DeleteConflictResponseSerializer(serializers.Serializer):
    ticket_count = serializers.IntegerField()


@extend_schema_view(
    get=extend_schema(
        tags=["Users"],
        summary="Get current user",
        description="Return profile information for the authenticated user.",
        responses={200: CurrentUserResponseSerializer},
    ),
    patch=extend_schema(
        tags=["Users"],
        summary="Update own profile",
        description=(
            "Update the authenticated user's profile. Username changes take "
            "effect immediately. Email changes do NOT take effect until the "
            "new address is confirmed via the link emailed to it."
        ),
        request=ProfileUpdateSerializer,
        responses={
            200: ProfileUpdateResponseSerializer,
            400: OpenApiResponse(description="Validation error."),
            429: OpenApiResponse(description="Too many email change requests."),
        },
    ),
    delete=extend_schema(
        tags=["Users"],
        summary="Delete own account",
        description=(
            "Permanently delete the authenticated user's account. "
            "Master admins can only delete their own account if another master exists. "
            "If the account has active tickets, resend with ?confirm=true to proceed."
        ),
        parameters=[
            OpenApiParameter(
                name="confirm",
                location=OpenApiParameter.QUERY,
                description="Set to 'true' to confirm deletion when the account has tickets.",
                required=False,
            )
        ],
        responses={
            204: None,
            400: OpenApiResponse(description="Account cannot be deleted (last master or protected)."),
            409: OpenApiResponse(response=DeleteConflictResponseSerializer, description="Account has active tickets. Resend with ?confirm=true."),
        },
    ),
)
class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [EmailChangeRateThrottle, GlobalUserRateThrottle]

    def _profile_payload(self, user):
        return {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "created_at": user.created_at,
            "is_staff": user.is_staff,
            "is_verified": user.is_verified,
            "role": user.role,
        }

    def get(self, request, *args, **kwargs):
        return Response(self._profile_payload(request.user), status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        serializer = ProfileUpdateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = request.user

        username = serializer.validated_data.get("username")
        if username and username != user.username:
            user.username = username
            user.save(update_fields=["username", "updated_at"])

        # Email changes are never applied directly: a confirmation link is
        # sent to the new address and the change only takes effect once that
        # link is followed (see EmailChangeConfirmView). The response is
        # intentionally generic when the address is already registered, to
        # avoid account enumeration.
        email_change_requested = False
        new_email = serializer.validated_data.get("email")
        if new_email and new_email != user.email:
            email_change_requested = True

            if not User.objects.filter(email=new_email).exists():
                token = generate_email_change_token(user, new_email)

                from users.tasks import send_email_change_email_task

                try:
                    send_email_change_email_task.apply_async(
                        args=[str(user.id), new_email, token, get_request_locale(request)]
                    )
                except Exception:
                    logger.exception(
                        "Failed to enqueue email change email for user %s", user.id
                    )

        payload = self._profile_payload(user)
        payload["email_change_requested"] = email_change_requested
        return Response(payload, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        user = request.user

        password = request.data.get("password", "")
        if not password or not user.check_password(password):
            raise WrongPassword()

        successor = None
        if user.is_protected:
            transfer_to_id = request.data.get("transfer_to")
            if not transfer_to_id:
                raise ProtectedTransferRequired()
            try:
                successor = User.objects.get(pk=transfer_to_id, is_superuser=True)
                if successor.pk == user.pk:
                    raise ValidationError("Cannot transfer protected status to yourself.")
            except (User.DoesNotExist, ValueError):
                raise ValidationError("Designated successor must be an existing master.")

        confirm = request.query_params.get("confirm") == "true"
        ticket_count = Ticket.objects.filter(user=user).count()

        if ticket_count > 0 and not confirm:
            raise HasActiveTickets(ticket_count=ticket_count)

        with transaction.atomic():
            if user.is_superuser:
                other_master_exists = (
                    User.objects.select_for_update()
                    .filter(is_superuser=True)
                    .exclude(pk=user.pk)
                    .exists()
                )
                if not other_master_exists:
                    raise OnlyMasterAdmin()

            if successor is not None:
                successor.is_protected_master = True
                successor.save(update_fields=["is_protected_master", "updated_at"])

            _delete_user_cascade(user)

        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(
        tags=["Users"],
        summary="List my tickets",
        description="Return tickets of the authenticated user, optionally filtered by time type.",
        parameters=[
            OpenApiParameter(
                name="type",
                required=False,
                location=OpenApiParameter.QUERY,
                description="Filter by ticket type.",
                enum=["upcoming", "past"],
            )
        ],
    )
)
class MyTicketsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserTicketSerializer
    ALLOWED_TYPE_FILTERS = {"upcoming", "past"}

    def _get_validated_type_filter(self):
        ticket_type = self.request.query_params.get("type")

        if ticket_type is None or ticket_type in self.ALLOWED_TYPE_FILTERS:
            return ticket_type

        raise ValidationError(
            {
                "type": [
                    "Invalid type filter. Expected one of: upcoming, past.",
                ]
            }
        )

    def get_queryset(self):
        queryset = (
            Ticket.objects.filter(user=self.request.user)
            .select_related(
                "session_seat__session__movie",
                "session_seat__session__room",
                "session_seat__seat__row",
            )
            .order_by("-created_at")
        )

        ticket_type = self._get_validated_type_filter()
        now = timezone.now()

        if ticket_type == "upcoming":
            queryset = queryset.filter(session_seat__session__start_time__gt=now)
        elif ticket_type == "past":
            queryset = queryset.filter(session_seat__session__start_time__lte=now)

        return queryset


class AdminGrantResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    username = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_protected = serializers.BooleanField()
    role = serializers.CharField()
    created_at = serializers.DateTimeField()


class RoleGrantBodySerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["staff", "master"], default="staff", required=False)


@extend_schema(
    tags=["Admin"],
    responses={
        200: AdminGrantResponseSerializer,
        400: OpenApiResponse(description="Cannot modify your own permissions or the protected admin account."),
        403: OpenApiResponse(description="Master access required."),
        404: OpenApiResponse(description="User not found."),
    },
)
class AdminGrantView(APIView):
    permission_classes = [IsMasterUser]

    @extend_schema(
        summary="Grant staff or master permission",
        description=(
            "Promote a user to staff or master. "
            "Only masters can call this endpoint. "
            "Pass {\"role\": \"master\"} to promote to master; defaults to staff."
        ),
        request=RoleGrantBodySerializer,
    )
    def post(self, request, user_id, *args, **kwargs):
        target = self._get_target(user_id)

        self._check_not_protected(target)

        body = RoleGrantBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        requested_role = body.validated_data["role"]

        grant_master = requested_role == "master"

        already_master = target.is_superuser
        already_staff = target.is_staff and not target.is_superuser

        # No-op if target already has the exact requested role
        if grant_master and already_master:
            return Response(self._serialize(target), status=status.HTTP_200_OK)

        if not grant_master and already_staff:
            return Response(self._serialize(target), status=status.HTTP_200_OK)

        if not grant_master and already_master:
            # Downgrade master → staff: revoke superuser, keep is_staff
            target.is_superuser = False
            target.save(update_fields=["is_superuser", "updated_at"])
            AdminPermissionLog.objects.create(
                actor=request.user,
                target=target,
                action=AdminPermissionLog.Action.REVOKED,
                role=AdminPermissionLog.Role.MASTER,
            )
            return Response(self._serialize(target), status=status.HTTP_200_OK)

        target.is_staff = True
        target.is_superuser = grant_master
        target.save(update_fields=["is_staff", "is_superuser", "updated_at"])
        AdminPermissionLog.objects.create(
            actor=request.user,
            target=target,
            action=AdminPermissionLog.Action.GRANTED,
            role=AdminPermissionLog.Role.MASTER if grant_master else AdminPermissionLog.Role.STAFF,
        )

        return Response(self._serialize(target), status=status.HTTP_200_OK)

    @extend_schema(
        summary="Revoke admin permission",
        description=(
            "Fully demote a user (staff or master) back to regular user. "
            "Blocked only for the protected primary admin account."
        ),
        request=None,
    )
    def delete(self, request, user_id, *args, **kwargs):
        target = self._get_target(user_id)
        self._check_not_protected(target)

        if target.is_superuser:
            other_masters = User.objects.filter(is_superuser=True).exclude(pk=target.pk).count()
            if other_masters == 0:
                raise ValidationError("Cannot revoke the last master admin.")

        if target.is_staff or target.is_superuser:
            revoked_role = (
                AdminPermissionLog.Role.MASTER
                if target.is_superuser
                else AdminPermissionLog.Role.STAFF
            )
            target.is_staff = False
            target.is_superuser = False
            target.save(update_fields=["is_staff", "is_superuser", "updated_at"])
            AdminPermissionLog.objects.create(
                actor=request.user,
                target=target,
                action=AdminPermissionLog.Action.REVOKED,
                role=revoked_role,
            )

        return Response(self._serialize(target), status=status.HTTP_200_OK)

    def _get_target(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            raise NotFound("User not found.")

    def _check_not_protected(self, target):
        if target == self.request.user:
            raise ValidationError("You cannot modify your own admin permissions.")
        if target.is_protected:
            raise ValidationError("Cannot modify the primary admin account.")

    def _serialize(self, user):
        return {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "is_staff": user.is_staff,
            "is_protected": user.is_protected,
            "role": user.role,
            "created_at": user.created_at,
        }


@extend_schema_view(
    get=extend_schema(
        tags=["Admin"],
        summary="List users",
        description="Return a paginated list of all users. Supports search by email or username and filtering by role.",
        parameters=[
            OpenApiParameter(
                name="search",
                required=False,
                location=OpenApiParameter.QUERY,
                description="Filter by email or username (case-insensitive partial match).",
            ),
            OpenApiParameter(
                name="role",
                required=False,
                location=OpenApiParameter.QUERY,
                description="Filter by role: 'master', 'staff', or 'user'.",
                enum=["master", "staff", "user"],
            ),
        ],
    )
)
class UserListView(ListAPIView):
    permission_classes = [IsMasterUser]
    serializer_class = UserListSerializer

    def get_queryset(self):
        qs = User.objects.annotate(
            is_me=Case(
                When(pk=self.request.user.pk, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        ).order_by("is_me", "created_at")

        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search) | Q(username__icontains=search)
            )

        role = self.request.query_params.get("role", "").strip()
        if role == "master":
            qs = qs.filter(is_superuser=True)
        elif role == "staff":
            qs = qs.filter(is_staff=True, is_superuser=False)
        elif role == "user":
            qs = qs.filter(is_staff=False, is_superuser=False)

        return qs


@extend_schema_view(
    get=extend_schema(
        tags=["Admin"],
        summary="List permission audit log for a user",
        description="Return the admin permission change history for a specific user.",
        responses={
            200: AdminPermissionLogSerializer(many=True),
            403: OpenApiResponse(description="Admin access required."),
            404: OpenApiResponse(description="User not found."),
        },
    )
)
class UserPermissionLogsView(APIView):
    permission_classes = [IsMasterUser]

    def get(self, request, user_id, *args, **kwargs):
        try:
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            raise NotFound("User not found.")

        logs = (
            AdminPermissionLog.objects
            .filter(target=user)
            .select_related("actor")
            .order_by("-created_at")[:50]
        )
        serializer = AdminPermissionLogSerializer(logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Admin"],
    summary="Delete user account",
    description=(
        "Permanently delete a user account. "
        "Cannot delete the primary admin account or your own account via this endpoint. "
        "If the user has active tickets, resend with ?confirm=true to proceed."
    ),
    parameters=[
        OpenApiParameter(
            name="confirm",
            location=OpenApiParameter.QUERY,
            description="Set to 'true' to confirm deletion even if the user has tickets.",
            required=False,
        )
    ],
    responses={
        204: None,
        400: OpenApiResponse(description="Cannot delete protected or own account."),
        403: OpenApiResponse(description="Master access required."),
        404: OpenApiResponse(description="User not found."),
        409: OpenApiResponse(response=DeleteConflictResponseSerializer, description="User has active tickets. Resend with ?confirm=true."),
    },
)
class UserDeleteView(APIView):
    permission_classes = [IsMasterUser]

    def delete(self, request, user_id, *args, **kwargs):
        try:
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            raise NotFound("User not found.")

        password = request.data.get("password", "")
        if not password or not request.user.check_password(password):
            raise WrongPassword()

        if user == request.user:
            raise ValidationError("To delete your own account, use your profile settings.")

        if user.is_protected:
            raise ValidationError("Cannot delete the primary admin account.")

        confirm = request.query_params.get("confirm") == "true"
        ticket_count = Ticket.objects.filter(user=user).count()

        if ticket_count > 0 and not confirm:
            raise HasActiveTickets(ticket_count=ticket_count)

        _delete_user_cascade(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    tags=["Admin"],
    responses={
        200: TmdbTokenResponseSerializer,
        403: OpenApiResponse(description="Master access required."),
    },
)
class TmdbTokenView(APIView):
    permission_classes = [IsMasterUser]

    @extend_schema(summary="Get TMDB token status")
    def get(self, request, *args, **kwargs):
        try:
            cfg = SiteConfig.objects.get(key="tmdb_api_read_token")
            plaintext = cfg.get_value()
            configured = bool(plaintext)
            hint = plaintext[-4:] if configured else None
        except SiteConfig.DoesNotExist:
            configured = False
            hint = None
        except InvalidToken:
            return Response(
                {"detail": "Falha ao descriptografar token — possível rotação de chave de criptografia."},
                status=503,
            )
        return Response({"configured": configured, "hint": hint})

    @extend_schema(summary="Set TMDB token", request=TmdbTokenBodySerializer)
    def put(self, request, *args, **kwargs):
        body = TmdbTokenBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        plaintext = body.validated_data["value"]
        cfg, _ = SiteConfig.objects.get_or_create(key="tmdb_api_read_token")
        cfg.set_value(plaintext)
        cfg.save()
        return Response({"configured": True, "hint": plaintext[-4:]})
