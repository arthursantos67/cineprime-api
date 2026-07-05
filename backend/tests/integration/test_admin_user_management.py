import uuid

import pytest
from rest_framework import status
from rest_framework.test import APIClient
from users.jwt import issue_tokens_for_user

from users.models import AdminPermissionLog, User


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        email="admin@cineprime.local",
        username="admin",
        password="AdminPass123!",
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        email="user@cineprime.local",
        username="regular",
        password="UserPass123!",
    )


@pytest.fixture
def second_admin(db):
    return User.objects.create_superuser(
        email="admin2@cineprime.local",
        username="admin2",
        password="AdminPass123!",
    )


def auth_client(user):
    client = APIClient()
    refresh = issue_tokens_for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


USERS_LIST_URL = "/api/v1/users/"


def logs_url(user):
    return f"/api/v1/users/{user.id}/admin/logs/"


# ─── User list ────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_admin_can_list_users(admin_user, regular_user):
    client = auth_client(admin_user)

    response = client.get(USERS_LIST_URL)

    assert response.status_code == status.HTTP_200_OK
    ids = [u["id"] for u in response.data["results"]]
    assert str(admin_user.id) in ids
    assert str(regular_user.id) in ids


@pytest.mark.django_db
def test_user_list_returns_expected_fields(admin_user):
    client = auth_client(admin_user)

    response = client.get(USERS_LIST_URL)

    assert response.status_code == status.HTTP_200_OK
    first = response.data["results"][0]
    assert "id" in first
    assert "email" in first
    assert "username" in first
    assert "is_staff" in first
    assert "role" in first
    assert "created_at" in first


@pytest.mark.django_db
def test_user_list_search_by_email(admin_user, regular_user):
    client = auth_client(admin_user)

    response = client.get(USERS_LIST_URL, {"search": "user@"})

    assert response.status_code == status.HTTP_200_OK
    ids = [u["id"] for u in response.data["results"]]
    assert str(regular_user.id) in ids
    assert str(admin_user.id) not in ids


@pytest.mark.django_db
def test_user_list_search_by_username(admin_user, regular_user):
    client = auth_client(admin_user)

    response = client.get(USERS_LIST_URL, {"search": "regular"})

    assert response.status_code == status.HTTP_200_OK
    ids = [u["id"] for u in response.data["results"]]
    assert str(regular_user.id) in ids
    assert str(admin_user.id) not in ids


@pytest.mark.django_db
def test_user_list_empty_search_returns_all(admin_user, regular_user):
    client = auth_client(admin_user)

    response = client.get(USERS_LIST_URL, {"search": ""})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] >= 2


@pytest.mark.django_db
def test_regular_user_cannot_list_users(regular_user, admin_user):
    client = auth_client(regular_user)

    response = client.get(USERS_LIST_URL)

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_staff_user_cannot_list_users(db):
    staff = User.objects.create_user(
        email="staff@cineprime.local",
        username="staff",
        password="StaffPass123!",
        is_staff=True,
    )
    client = auth_client(staff)

    response = client.get(USERS_LIST_URL)

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_unauthenticated_cannot_list_users(api_client):
    response = api_client.get(USERS_LIST_URL)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ─── Permission audit logs ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_admin_can_retrieve_permission_logs(admin_user, regular_user):
    AdminPermissionLog.objects.create(
        actor=admin_user,
        target=regular_user,
        action=AdminPermissionLog.Action.GRANTED,
    )
    client = auth_client(admin_user)

    response = client.get(logs_url(regular_user))

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["action"] == "granted"
    assert response.data[0]["actor"] == admin_user.email
    assert response.data[0]["target"] == regular_user.email


@pytest.mark.django_db
def test_permission_logs_empty_for_untouched_user(admin_user, regular_user):
    client = auth_client(admin_user)

    response = client.get(logs_url(regular_user))

    assert response.status_code == status.HTTP_200_OK
    assert response.data == []


@pytest.mark.django_db
def test_permission_logs_returns_404_for_nonexistent_user(admin_user):
    client = auth_client(admin_user)

    response = client.get(f"/api/v1/users/{uuid.uuid4()}/admin/logs/")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_regular_user_cannot_retrieve_permission_logs(regular_user, admin_user):
    client = auth_client(regular_user)

    response = client.get(logs_url(admin_user))

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_unauthenticated_cannot_retrieve_permission_logs(api_client, regular_user):
    response = api_client.get(logs_url(regular_user))

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_permission_logs_ordered_newest_first(admin_user, regular_user, second_admin):
    client_admin = auth_client(admin_user)
    client_admin.post(f"/api/v1/users/{regular_user.id}/admin/", {"role": "staff"}, format="json")
    client_admin.delete(f"/api/v1/users/{regular_user.id}/admin/")

    response = client_admin.get(logs_url(regular_user))

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 2
    assert response.data[0]["action"] == "revoked"
    assert response.data[1]["action"] == "granted"
