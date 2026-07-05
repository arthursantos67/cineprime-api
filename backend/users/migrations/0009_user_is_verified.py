from django.db import migrations, models


def mark_existing_users_verified(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.update(is_verified=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_merge_0007_migrations"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_existing_users_verified, noop),
    ]
