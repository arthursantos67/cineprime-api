import pytest
from rest_framework import status
from rest_framework.test import APIClient
from users.jwt import issue_tokens_for_user

from users.models import AdminPermissionLog, User


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def master_user(db):
    return User.objects.create_superuser(
        email="master@cineprime.local",
        username="master",
        password="MasterPass123!",
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        email="staff@cineprime.local",
        username="staff",
        password="StaffPass123!",
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        email="user@cineprime.local",
        username="regular",
        password="UserPass123!",
    )


@pytest.fixture
def second_master(db):
    return User.objects.create_superuser(
        email="master2@cineprime.local",
        username="master2",
        password="MasterPass123!",
    )


@pytest.fixture
def protected_master(db):
    return User.objects.create_superuser(
        email="santos008@cineprime.local",
        username="santos008",
        password="MasterPass123!",
    )


def auth_client(user):
    client = APIClient()
    refresh = issue_tokens_for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def grant_url(user):
    return f"/api/v1/users/{user.id}/admin/"


# --- Grant staff (POST with role=staff) ---

@pytest.mark.django_db
def test_master_can_grant_staff_to_user(master_user, regular_user):
    client = auth_client(master_user)

    response = client.post(grant_url(regular_user), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    regular_user.refresh_from_db()
    assert regular_user.is_staff is True
    assert regular_user.is_superuser is False
    assert response.data["role"] == "staff"


@pytest.mark.django_db
def test_master_can_grant_master_to_user(master_user, regular_user):
    client = auth_client(master_user)

    response = client.post(grant_url(regular_user), {"role": "master"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    regular_user.refresh_from_db()
    assert regular_user.is_staff is True
    assert regular_user.is_superuser is True
    assert response.data["role"] == "master"


@pytest.mark.django_db
def test_master_can_promote_staff_to_master(master_user, staff_user):
    client = auth_client(master_user)

    response = client.post(grant_url(staff_user), {"role": "master"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    staff_user.refresh_from_db()
    assert staff_user.is_superuser is True


@pytest.mark.django_db
def test_master_can_downgrade_master_to_staff(master_user, second_master):
    client = auth_client(master_user)

    response = client.post(grant_url(second_master), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    second_master.refresh_from_db()
    assert second_master.is_staff is True
    assert second_master.is_superuser is False
    assert response.data["role"] == "staff"

    log = AdminPermissionLog.objects.get(target=second_master)
    assert log.action == AdminPermissionLog.Action.REVOKED
    assert log.role == AdminPermissionLog.Role.MASTER


@pytest.mark.django_db
def test_cannot_downgrade_protected_master(master_user, protected_master, settings):
    settings.PROTECTED_SUPERUSER_USERNAME = "santos008"
    client = auth_client(master_user)

    response = client.post(grant_url(protected_master), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    protected_master.refresh_from_db()
    assert protected_master.is_superuser is True


@pytest.mark.django_db
def test_grant_creates_audit_log(master_user, regular_user):
    client = auth_client(master_user)
    client.post(grant_url(regular_user), {"role": "staff"}, format="json")

    log = AdminPermissionLog.objects.get(target=regular_user)
    assert log.action == AdminPermissionLog.Action.GRANTED
    assert log.actor == master_user


@pytest.mark.django_db
def test_grant_staff_is_idempotent(master_user, regular_user):
    client = auth_client(master_user)

    client.post(grant_url(regular_user), {"role": "staff"}, format="json")
    response = client.post(grant_url(regular_user), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert AdminPermissionLog.objects.filter(target=regular_user).count() == 1


@pytest.mark.django_db
def test_grant_master_is_idempotent(master_user, second_master):
    client = auth_client(master_user)

    response = client.post(grant_url(second_master), {"role": "master"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert AdminPermissionLog.objects.filter(target=second_master).count() == 0


@pytest.mark.django_db
def test_staff_user_cannot_grant(staff_user, regular_user):
    client = auth_client(staff_user)

    response = client.post(grant_url(regular_user), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_regular_user_cannot_grant(regular_user, second_master):
    client = auth_client(regular_user)

    response = client.post(grant_url(second_master), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_unauthenticated_cannot_grant(api_client, regular_user):
    response = api_client.post(grant_url(regular_user), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_grant_returns_404_for_nonexistent_user(master_user):
    import uuid
    client = auth_client(master_user)

    response = client.post(f"/api/v1/users/{uuid.uuid4()}/admin/", {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_grant_response_includes_created_at(master_user, regular_user):
    client = auth_client(master_user)

    response = client.post(grant_url(regular_user), {"role": "staff"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert "created_at" in response.data
    assert response.data["created_at"] is not None


# --- Revoke staff (DELETE) ---

@pytest.mark.django_db
def test_master_can_revoke_staff(master_user, staff_user):
    client = auth_client(master_user)

    response = client.delete(grant_url(staff_user))

    assert response.status_code == status.HTTP_200_OK
    staff_user.refresh_from_db()
    assert staff_user.is_staff is False
    assert staff_user.is_superuser is False


@pytest.mark.django_db
def test_master_can_revoke_other_master(master_user, second_master):
    client = auth_client(master_user)

    response = client.delete(grant_url(second_master))

    assert response.status_code == status.HTTP_200_OK
    second_master.refresh_from_db()
    assert second_master.is_staff is False
    assert second_master.is_superuser is False
    assert response.data["role"] == "user"

    log = AdminPermissionLog.objects.get(target=second_master)
    assert log.action == AdminPermissionLog.Action.REVOKED
    assert log.role == AdminPermissionLog.Role.MASTER


@pytest.mark.django_db
def test_cannot_revoke_protected_master(master_user, protected_master, settings):
    settings.PROTECTED_SUPERUSER_USERNAME = "santos008"
    client = auth_client(master_user)

    response = client.delete(grant_url(protected_master))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    protected_master.refresh_from_db()
    assert protected_master.is_staff is True
    assert protected_master.is_superuser is True


@pytest.mark.django_db
def test_master_cannot_revoke_self(master_user):
    client = auth_client(master_user)

    response = client.delete(grant_url(master_user))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    master_user.refresh_from_db()
    assert master_user.is_superuser is True


@pytest.mark.django_db
def test_revoke_creates_audit_log(master_user, staff_user):
    client = auth_client(master_user)
    client.delete(grant_url(staff_user))

    log = AdminPermissionLog.objects.get(target=staff_user)
    assert log.action == AdminPermissionLog.Action.REVOKED
    assert log.actor == master_user


@pytest.mark.django_db
def test_revoke_is_idempotent(master_user, staff_user):
    client = auth_client(master_user)

    client.delete(grant_url(staff_user))
    response = client.delete(grant_url(staff_user))

    assert response.status_code == status.HTTP_200_OK
    assert AdminPermissionLog.objects.filter(target=staff_user).count() == 1


@pytest.mark.django_db
def test_staff_user_cannot_revoke(staff_user, second_master):
    client = auth_client(staff_user)

    response = client.delete(grant_url(second_master))

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_regular_user_cannot_revoke(regular_user, second_master):
    client = auth_client(regular_user)

    response = client.delete(grant_url(second_master))

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_unauthenticated_cannot_revoke(api_client, second_master):
    response = api_client.delete(grant_url(second_master))

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
