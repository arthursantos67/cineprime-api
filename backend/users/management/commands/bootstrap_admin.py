import os

from django.core.management.base import BaseCommand

from users.models import User


class Command(BaseCommand):
    help = "Create the first administrator from environment variables."

    def handle(self, *args, **options):
        email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip()
        username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip()
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "").strip()

        if not email or not username or not password:
            self.stderr.write(
                "BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_USERNAME and "
                "BOOTSTRAP_ADMIN_PASSWORD must all be set."
            )
            return

        if User.objects.filter(is_staff=True, is_active=True).exists():
            self.stdout.write("An active administrator already exists. Skipping bootstrap.")
            return

        normalized_email = User.objects.normalize_email(email)
        user, created = User.objects.get_or_create(
            email=normalized_email,
            defaults={"username": username},
        )

        user.is_staff = True
        user.is_superuser = True
        user.is_protected_master = True
        user.is_verified = True

        if created:
            user.set_password(password)

        user.save()

        verb = "Created" if created else "Promoted"
        self.stdout.write(f"{verb} initial admin: {normalized_email}")
