import uuid

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.exceptions import ImproperlyConfigured
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, username, password=None, **extra_fields):
        if not email:
            raise ValueError("The email field is required.")

        if not username:
            raise ValueError("The username field is required.")

        email = email.strip().lower()
        user = self.model(email=email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, username, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")

        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        if password is None:
            raise ValueError("Superuser must have a password.")

        return self.create_user(
            email=email,
            username=username,
            password=password,
            **extra_fields,
        )


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_protected_master = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]

    @property
    def role(self):
        if self.is_superuser:
            return "master"
        if self.is_staff:
            return "staff"
        return "user"

    @property
    def is_protected(self):
        protected = getattr(settings, "PROTECTED_SUPERUSER_USERNAME", None)
        return bool(protected and self.username == protected) or self.is_protected_master

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class SiteConfig(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "site_config"

    def __str__(self):
        return self.key

    def _cipher(self) -> Fernet:
        key = getattr(settings, "SITE_CONFIG_ENCRYPTION_KEY", None)
        if not key:
            raise ImproperlyConfigured(
                "SITE_CONFIG_ENCRYPTION_KEY must be set to read or write encrypted site config values."
            )
        return Fernet(key)

    def set_value(self, plaintext: str) -> None:
        self.value = self._cipher().encrypt(plaintext.encode()).decode()

    def get_value(self) -> str | None:
        if not self.value:
            return None
        return self._cipher().decrypt(self.value.encode()).decode()


class AdminPermissionLog(models.Model):
    class Action(models.TextChoices):
        GRANTED = "granted", "Granted"
        REVOKED = "revoked", "Revoked"

    class Role(models.TextChoices):
        STAFF = "staff", "Staff"
        MASTER = "master", "Master"

    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="admin_actions_performed",
    )
    target = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="admin_permission_logs",
    )
    action = models.CharField(max_length=10, choices=Action.choices)
    role = models.CharField(max_length=10, choices=Role.choices, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "admin_permission_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.actor} {self.action} admin to {self.target}"


class WalletTransaction(models.Model):
    """Internal store-credit ledger entry.

    This is NOT a real-money wallet: there is no payment gateway integration,
    custody of funds, or regulatory scope here. Amounts represent CinePrime
    store credit only (e.g. credit granted when staff cancels/refunds a
    purchase), to be referenced or spent at a future checkout. Positive
    amounts are credits; negative amounts are debits. The user's balance is
    the sum of their transaction amounts.
    """

    class Reason(models.TextChoices):
        REFUND = "refund", "Refund"
        PURCHASE = "purchase", "Purchase"
        ADJUSTMENT = "adjustment", "Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="wallet_transactions",
    )
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    reference = models.CharField(
        max_length=64,
        blank=True,
        help_text="Optional reference to the originating record (e.g. ticket code).",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wallet_transactions"
        ordering = ["-created_at"]
        indexes = [
            # Covers the wallet endpoint's "filter by user, newest first" query.
            models.Index(
                fields=["user", "-created_at"], name="wallet_tx_user_created_idx"
            ),
        ]

    def __str__(self):
        return f"{self.user} | {self.reason} | {self.amount}"
