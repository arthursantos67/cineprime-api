import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

import catalog.views as catalog_views
from catalog.models import Genre, Movie, MovieStatus, Room, Session
from users.models import User


class UnavailableCatalogCache:
    def add(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    def get(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    def set(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    def incr(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")


class FailingCatalogCacheRead:
    def __init__(self):
        self.get_calls = 0

    def add(self, *args, **kwargs):
        return False

    def get(self, *args, **kwargs):
        self.get_calls += 1
        if self.get_calls == 1:
            return 1
        raise ConnectionError("Redis unavailable")

    def set(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    def incr(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")


@pytest.mark.django_db
class TestCatalogApi:
    @pytest.fixture(autouse=True)
    def clear_cache_between_tests(self):
        cache.clear()
        yield
        cache.clear()

    @pytest.fixture
    def admin_user(self):
        return User.objects.create_user(
            email="catalog-admin@example.com",
            username="catalog_admin",
            password="StrongPass123",
            is_staff=True,
        )

    @pytest.fixture
    def api_client(self, admin_user):
        client = APIClient()
        client.force_authenticate(user=admin_user)
        return client

    @pytest.fixture
    def anonymous_api_client(self):
        return APIClient()

    @pytest.fixture
    def regular_user(self):
        return User.objects.create_user(
            email="catalog-user@example.com",
            username="catalog_user",
            password="StrongPass123",
        )

    @pytest.fixture
    def regular_api_client(self, regular_user):
        client = APIClient()
        client.force_authenticate(user=regular_user)
        return client

    @pytest.fixture
    def genre(self):
        return Genre.objects.create(name="Drama")

    @pytest.fixture
    def second_genre(self):
        return Genre.objects.create(name="Crime")

    @pytest.fixture
    def movie(self, genre, second_genre):
        movie = Movie.objects.create(
            title="The Godfather",
            synopsis="Crime family drama.",
            duration_minutes=175,
            release_date="1972-07-07",
            poster_url="https://example.com/godfather.jpg",
        )
        movie.genres.set([genre, second_genre])
        return movie

    @pytest.fixture
    def room(self):
        return Room.objects.create(
            name="Room 1",
            capacity=70,
        )

    @pytest.fixture
    def session(self, movie, room):
        return Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.now() + timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=3, minutes=55),
            base_price="30.00",
        )

    def create_movie(
        self,
        *,
        title,
        genre,
        status=MovieStatus.EM_CARTAZ,
        is_featured=False,
    ):
        movie = Movie.objects.create(
            title=title,
            synopsis=f"{title} synopsis.",
            duration_minutes=120,
            release_date="2026-05-13",
            poster_url=f"https://example.com/{title.lower().replace(' ', '-')}.jpg",
            status=status,
            is_featured=is_featured,
        )
        movie.genres.set([genre])
        return movie

    def test_global_default_permission_is_not_allow_any(self):
        default_permissions = settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"]

        assert "rest_framework.permissions.IsAuthenticated" in default_permissions
        assert "rest_framework.permissions.AllowAny" not in default_permissions

    def test_list_genres_returns_200(self, api_client, genre):
        response = api_client.get("/api/v1/catalog/genres/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["name"] == genre.name

    def test_catalog_read_endpoints_remain_public(
        self,
        anonymous_api_client,
        genre,
        movie,
        room,
        session,
    ):
        endpoints = [
            "/api/v1/catalog/genres/",
            f"/api/v1/catalog/genres/{genre.id}/",
            "/api/v1/catalog/movies/",
            f"/api/v1/catalog/movies/{movie.id}/",
            "/api/v1/catalog/rooms/",
            f"/api/v1/catalog/rooms/{room.id}/",
            "/api/v1/catalog/sessions/",
            f"/api/v1/catalog/sessions/{session.id}/",
        ]

        for endpoint in endpoints:
            response = anonymous_api_client.get(endpoint)
            assert response.status_code == status.HTTP_200_OK

    def test_anonymous_users_cannot_mutate_catalog_resources(
        self,
        anonymous_api_client,
        genre,
        movie,
        room,
        session,
    ):
        forbidden_requests = [
            (
                anonymous_api_client.post,
                "/api/v1/catalog/genres/",
                {"name": "Sci-Fi"},
            ),
            (
                anonymous_api_client.patch,
                f"/api/v1/catalog/genres/{genre.id}/",
                {"name": "Updated"},
            ),
            (
                anonymous_api_client.delete,
                f"/api/v1/catalog/genres/{genre.id}/",
                None,
            ),
            (
                anonymous_api_client.post,
                "/api/v1/catalog/movies/",
                {
                    "title": "Interstellar",
                    "genres": [str(genre.id)],
                    "synopsis": "Space exploration.",
                    "duration_minutes": 169,
                    "release_date": "2014-11-07",
                    "poster_url": "https://example.com/interstellar.jpg",
                },
            ),
            (
                anonymous_api_client.patch,
                f"/api/v1/catalog/movies/{movie.id}/",
                {"title": "Updated"},
            ),
            (
                anonymous_api_client.delete,
                f"/api/v1/catalog/movies/{movie.id}/",
                None,
            ),
            (
                anonymous_api_client.post,
                "/api/v1/catalog/rooms/",
                {"name": "Room 2", "capacity": 80},
            ),
            (
                anonymous_api_client.patch,
                f"/api/v1/catalog/rooms/{room.id}/",
                {"name": "Updated"},
            ),
            (
                anonymous_api_client.delete,
                f"/api/v1/catalog/rooms/{room.id}/",
                None,
            ),
            (
                anonymous_api_client.post,
                "/api/v1/catalog/sessions/",
                {
                    "movie": str(movie.id),
                    "room": str(room.id),
                    "start_time": "2026-03-23T18:00:00Z",
                    "end_time": "2026-03-23T20:55:00Z",
                    "base_price": "42.50",
                },
            ),
            (
                anonymous_api_client.patch,
                f"/api/v1/catalog/sessions/{session.id}/",
                {"base_price": "36.75"},
            ),
            (
                anonymous_api_client.delete,
                f"/api/v1/catalog/sessions/{session.id}/",
                None,
            ),
        ]

        for method, endpoint, payload in forbidden_requests:
            if payload is None:
                response = method(endpoint)
            else:
                response = method(endpoint, payload, format="json")

            assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_regular_users_cannot_mutate_catalog_resources(
        self,
        regular_api_client,
        genre,
        movie,
        room,
        session,
    ):
        requests = [
            regular_api_client.post(
                "/api/v1/catalog/genres/",
                {"name": "Sci-Fi"},
                format="json",
            ),
            regular_api_client.patch(
                f"/api/v1/catalog/movies/{movie.id}/",
                {"title": "Updated"},
                format="json",
            ),
            regular_api_client.delete(f"/api/v1/catalog/rooms/{room.id}/"),
            regular_api_client.patch(
                f"/api/v1/catalog/sessions/{session.id}/",
                {"base_price": "36.75"},
                format="json",
            ),
        ]

        for response in requests:
            assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_genre_returns_201(self, api_client):
        response = api_client.post(
            "/api/v1/catalog/genres/",
            {"name": "Sci-Fi"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Sci-Fi"
        assert Genre.objects.filter(name="Sci-Fi").exists()

    def test_list_movies_returns_200_with_nested_genres(self, api_client, movie):
        response = api_client.get("/api/v1/catalog/movies/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["title"] == movie.title
        assert response.data["results"][0]["status"] == MovieStatus.EM_CARTAZ
        assert response.data["results"][0]["is_featured"] is False
        assert len(response.data["results"][0]["genres"]) == 2
        assert "name" in response.data["results"][0]["genres"][0]

    def test_retrieve_movie_returns_status_and_featured_fields(self, api_client, movie):
        response = api_client.get(f"/api/v1/catalog/movies/{movie.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == MovieStatus.EM_CARTAZ
        assert response.data["is_featured"] is False

    def test_create_movie_returns_201(self, api_client, genre, second_genre):
        response = api_client.post(
            "/api/v1/catalog/movies/",
            {
                "title": "Interstellar",
                "genres": [str(genre.id), str(second_genre.id)],
                "synopsis": "Space exploration.",
                "duration_minutes": 169,
                "release_date": "2014-11-07",
                "poster_url": "https://example.com/interstellar.jpg",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == MovieStatus.EM_CARTAZ
        assert response.data["is_featured"] is False
        assert Movie.objects.filter(title="Interstellar").exists()

    def test_create_movie_accepts_status_and_featured_fields(
        self,
        api_client,
        genre,
        second_genre,
    ):
        response = api_client.post(
            "/api/v1/catalog/movies/",
            {
                "title": "Dune Part Two",
                "genres": [str(genre.id), str(second_genre.id)],
                "synopsis": "Desert power struggle.",
                "duration_minutes": 166,
                "release_date": "2024-03-01",
                "poster_url": "https://example.com/dune-two.jpg",
                "status": MovieStatus.PRE_VENDA,
                "is_featured": True,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == MovieStatus.PRE_VENDA
        assert response.data["is_featured"] is True
        movie = Movie.objects.get(title="Dune Part Two")
        assert movie.status == MovieStatus.PRE_VENDA
        assert movie.is_featured is True

    def test_create_movie_accepts_upcoming_status(
        self,
        api_client,
        genre,
        second_genre,
    ):
        response = api_client.post(
            "/api/v1/catalog/movies/",
            {
                "title": "Future Premiere",
                "genres": [str(genre.id), str(second_genre.id)],
                "synopsis": "A movie announced for a future release.",
                "duration_minutes": 118,
                "release_date": "2026-12-18",
                "poster_url": "https://example.com/future-premiere.jpg",
                "status": MovieStatus.EM_BREVE,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == MovieStatus.EM_BREVE
        movie = Movie.objects.get(title="Future Premiere")
        assert movie.status == MovieStatus.EM_BREVE

    def test_list_movies_can_filter_by_em_cartaz_status(self, api_client, genre):
        current_movie = self.create_movie(
            title="Current Movie",
            genre=genre,
            status=MovieStatus.EM_CARTAZ,
        )
        self.create_movie(
            title="Presale Movie",
            genre=genre,
            status=MovieStatus.PRE_VENDA,
        )

        response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.EM_CARTAZ}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(current_movie.id)
        assert response.data["results"][0]["status"] == MovieStatus.EM_CARTAZ

    def test_list_movies_can_filter_by_pre_venda_status(self, api_client, genre):
        self.create_movie(
            title="Current Movie",
            genre=genre,
            status=MovieStatus.EM_CARTAZ,
        )
        presale_movie = self.create_movie(
            title="Presale Movie",
            genre=genre,
            status=MovieStatus.PRE_VENDA,
        )

        response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.PRE_VENDA}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(presale_movie.id)
        assert response.data["results"][0]["status"] == MovieStatus.PRE_VENDA

    def test_list_movies_can_filter_by_em_breve_status(self, api_client, genre):
        self.create_movie(
            title="Current Movie",
            genre=genre,
            status=MovieStatus.EM_CARTAZ,
        )
        self.create_movie(
            title="Presale Movie",
            genre=genre,
            status=MovieStatus.PRE_VENDA,
        )
        upcoming_movie = self.create_movie(
            title="Upcoming Movie",
            genre=genre,
            status=MovieStatus.EM_BREVE,
        )

        response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.EM_BREVE}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(upcoming_movie.id)
        assert response.data["results"][0]["status"] == MovieStatus.EM_BREVE

    def test_list_movies_can_filter_by_is_featured(self, api_client, genre):
        featured_movie = self.create_movie(
            title="Featured Movie",
            genre=genre,
            is_featured=True,
        )
        self.create_movie(
            title="Regular Movie",
            genre=genre,
            is_featured=False,
        )

        response = api_client.get("/api/v1/catalog/movies/?is_featured=true")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(featured_movie.id)
        assert response.data["results"][0]["is_featured"] is True

    def test_list_movies_rejects_invalid_status_filter(self, api_client, genre):
        self.create_movie(title="Current Movie", genre=genre)

        response = api_client.get("/api/v1/catalog/movies/?status=foo")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "status" in response.data["error"]["details"]
        assert MovieStatus.EM_BREVE in str(response.data["error"]["details"])

    def test_list_movies_rejects_invalid_is_featured_filter(self, api_client, genre):
        self.create_movie(title="Featured Movie", genre=genre, is_featured=True)

        response = api_client.get("/api/v1/catalog/movies/?is_featured=yes")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "is_featured" in response.data["error"]["details"]

    def test_invalid_movie_filter_should_not_return_cached_response(self, api_client):
        cache.set(
            "catalog:movies:/api/v1/catalog/movies/?is_featured=yes",
            {"count": 0, "results": []},
        )

        response = api_client.get("/api/v1/catalog/movies/?is_featured=yes")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "is_featured" in response.data["error"]["details"]

    def test_list_rooms_returns_200(self, api_client, room):
        response = api_client.get("/api/v1/catalog/rooms/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["name"] == room.name

    def test_create_room_returns_201(self, api_client):
        response = api_client.post(
            "/api/v1/catalog/rooms/",
            {
                "name": "Room 2",
                "capacity": 80,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Room 2"
        assert Room.objects.filter(name="Room 2").exists()

    def test_list_sessions_returns_200_with_nested_movie_and_room(
        self,
        api_client,
        session,
    ):
        response = api_client.get("/api/v1/catalog/sessions/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["movie"]["title"] == session.movie.title
        assert response.data["results"][0]["movie"]["status"] == MovieStatus.EM_CARTAZ
        assert response.data["results"][0]["movie"]["is_featured"] is False
        assert response.data["results"][0]["room"]["name"] == session.room.name
        assert response.data["results"][0]["base_price"] == "30.00"

    def test_retrieve_session_returns_base_price_and_nested_data(
        self,
        api_client,
        session,
    ):
        response = api_client.get(f"/api/v1/catalog/sessions/{session.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["movie"]["title"] == session.movie.title
        assert response.data["room"]["name"] == session.room.name
        assert response.data["base_price"] == "30.00"

    def test_create_session_returns_201(self, api_client, movie, room):
        response = api_client.post(
            "/api/v1/catalog/sessions/",
            {
                "movie": str(movie.id),
                "room": str(room.id),
                "start_time": "2026-03-23T18:00:00Z",
                "end_time": "2026-03-23T20:55:00Z",
                "base_price": "42.50",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["base_price"] == "42.50"
        assert Session.objects.count() == 1
        assert Session.objects.get().base_price == Decimal("42.50")

    def test_create_session_requires_base_price(self, api_client, movie, room):
        response = api_client.post(
            "/api/v1/catalog/sessions/",
            {
                "movie": str(movie.id),
                "room": str(room.id),
                "start_time": "2026-03-23T18:00:00Z",
                "end_time": "2026-03-23T20:55:00Z",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "base_price" in response.data["error"]["details"]

    @pytest.mark.parametrize("base_price", ["0.00", "-1.00"])
    def test_create_session_rejects_non_positive_base_price(
        self,
        api_client,
        movie,
        room,
        base_price,
    ):
        response = api_client.post(
            "/api/v1/catalog/sessions/",
            {
                "movie": str(movie.id),
                "room": str(room.id),
                "start_time": "2026-03-23T18:00:00Z",
                "end_time": "2026-03-23T20:55:00Z",
                "base_price": base_price,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "base_price" in response.data["error"]["details"]

    def test_update_session_accepts_base_price(self, api_client, session):
        response = api_client.patch(
            f"/api/v1/catalog/sessions/{session.id}/",
            {"base_price": "36.75"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["base_price"] == "36.75"
        session.refresh_from_db()
        assert session.base_price == Decimal("36.75")

    def test_list_sessions_can_filter_by_movie(self, api_client, genre, room, session):
        other_movie = self.create_movie(title="Other Movie", genre=genre)
        other_session = Session.objects.create(
            movie=other_movie,
            room=room,
            start_time=session.end_time + timedelta(hours=1),
            end_time=session.end_time + timedelta(hours=3),
            base_price="31.00",
        )

        response = api_client.get(f"/api/v1/catalog/sessions/?movie={session.movie_id}")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(session.id)
        assert response.data["results"][0]["id"] != str(other_session.id)

    def test_list_sessions_can_filter_by_start_date(self, api_client, movie, room):
        first_session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.make_aware(datetime(2026, 3, 23, 18, 0)),
            end_time=timezone.make_aware(datetime(2026, 3, 23, 20, 0)),
            base_price="30.00",
        )
        Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.make_aware(datetime(2026, 3, 24, 18, 0)),
            end_time=timezone.make_aware(datetime(2026, 3, 24, 20, 0)),
            base_price="35.00",
        )

        response = api_client.get("/api/v1/catalog/sessions/?date=2026-03-23")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(first_session.id)

    def test_invalid_session_filter_should_not_return_cached_response(
        self,
        api_client,
    ):
        cache.set(
            "catalog:sessions:/api/v1/catalog/sessions/?date=not-a-date",
            {"count": 0, "results": []},
        )

        response = api_client.get("/api/v1/catalog/sessions/?date=not-a-date")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "date" in response.data["error"]["details"]

    def test_delete_genre_returns_204(self, api_client, genre):
        response = api_client.delete(f"/api/v1/catalog/genres/{genre.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Genre.objects.filter(id=genre.id).exists()

    def test_update_genre_returns_200(self, api_client, genre, movie):
        response = api_client.patch(
            f"/api/v1/catalog/genres/{genre.id}/",
            {"name": "Drama Updated"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Drama Updated"
        genre.refresh_from_db()
        assert genre.name == "Drama Updated"
        movie.refresh_from_db()
        assert movie.genres.filter(name="Drama Updated").exists()

    def test_update_movie_returns_200(self, api_client, movie):
        response = api_client.patch(
            f"/api/v1/catalog/movies/{movie.id}/",
            {
                "title": "The Godfather Remastered",
                "status": MovieStatus.PRE_VENDA,
                "is_featured": True,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == MovieStatus.PRE_VENDA
        assert response.data["is_featured"] is True
        movie.refresh_from_db()
        assert movie.title == "The Godfather Remastered"
        assert movie.status == MovieStatus.PRE_VENDA
        assert movie.is_featured is True

    def test_update_room_returns_200(self, api_client, room):
        response = api_client.patch(
            f"/api/v1/catalog/rooms/{room.id}/",
            {"name": "Room Prime", "capacity": 90},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Room Prime"
        assert response.data["capacity"] == 90
        room.refresh_from_db()
        assert room.name == "Room Prime"
        assert room.capacity == 90

    def test_update_session_returns_200(self, api_client, session):
        new_end_time = (
            (session.end_time + timedelta(minutes=30))
            .isoformat()
            .replace(
                "+00:00",
                "Z",
            )
        )

        response = api_client.patch(
            f"/api/v1/catalog/sessions/{session.id}/",
            {"end_time": new_end_time},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        session.refresh_from_db()
        assert session.end_time == timezone.datetime.fromisoformat(
            new_end_time.replace("Z", "+00:00")
        )

    def test_update_session_should_reject_room_change(self, api_client, session):
        other_room = Room.objects.create(name="Room 2", capacity=80)

        response = api_client.patch(
            f"/api/v1/catalog/sessions/{session.id}/",
            {"room": str(other_room.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "VALIDATION_FAILED"
        assert "room" in response.data["error"]["details"]

    def test_list_movies_should_use_cache_on_second_request(self, api_client, movie):
        cache.clear()

        with CaptureQueriesContext(connection) as first_request_queries:
            first_response = api_client.get("/api/v1/catalog/movies/")

        with CaptureQueriesContext(connection) as second_request_queries:
            second_response = api_client.get("/api/v1/catalog/movies/")

        assert first_response.status_code == status.HTTP_200_OK
        assert second_response.status_code == status.HTTP_200_OK
        assert first_response.data == second_response.data
        assert len(second_request_queries) < len(first_request_queries)

    def test_list_movies_should_fall_back_to_database_when_cache_read_fails(
        self,
        monkeypatch,
        anonymous_api_client,
        movie,
    ):
        monkeypatch.setattr(catalog_views, "cache", FailingCatalogCacheRead())

        response = anonymous_api_client.get("/api/v1/catalog/movies/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(movie.id)
        assert "error" not in response.data

    def test_movie_list_cache_should_remain_query_aware(self, api_client, genre):
        cache.clear()
        current_movie = self.create_movie(
            title="Current Movie",
            genre=genre,
            status=MovieStatus.EM_CARTAZ,
        )
        presale_movie = self.create_movie(
            title="Presale Movie",
            genre=genre,
            status=MovieStatus.PRE_VENDA,
        )
        upcoming_movie = self.create_movie(
            title="Upcoming Movie",
            genre=genre,
            status=MovieStatus.EM_BREVE,
        )

        current_response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.EM_CARTAZ}"
        )
        presale_response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.PRE_VENDA}"
        )
        upcoming_response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.EM_BREVE}"
        )

        assert current_response.status_code == status.HTTP_200_OK
        assert presale_response.status_code == status.HTTP_200_OK
        assert upcoming_response.status_code == status.HTTP_200_OK
        assert current_response.data["results"][0]["id"] == str(current_movie.id)
        assert presale_response.data["results"][0]["id"] == str(presale_movie.id)
        assert upcoming_response.data["results"][0]["id"] == str(upcoming_movie.id)

    def test_list_sessions_should_use_cache_on_second_request(
        self, api_client, session
    ):
        cache.clear()

        with CaptureQueriesContext(connection) as first_request_queries:
            first_response = api_client.get("/api/v1/catalog/sessions/")

        with CaptureQueriesContext(connection) as second_request_queries:
            second_response = api_client.get("/api/v1/catalog/sessions/")

        assert first_response.status_code == status.HTTP_200_OK
        assert second_response.status_code == status.HTTP_200_OK
        assert first_response.data == second_response.data
        assert len(second_request_queries) < len(first_request_queries)

    def test_list_sessions_should_fall_back_to_database_when_cache_is_unavailable(
        self,
        monkeypatch,
        anonymous_api_client,
        session,
    ):
        monkeypatch.setattr(catalog_views, "cache", UnavailableCatalogCache())

        response = anonymous_api_client.get("/api/v1/catalog/sessions/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == str(session.id)
        assert "error" not in response.data

    def test_movie_list_cache_should_be_invalidated_after_movie_creation(
        self,
        api_client,
        genre,
        second_genre,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/movies/")
        assert first_response.status_code == status.HTTP_200_OK
        initial_count = first_response.data["count"]

        create_response = api_client.post(
            "/api/v1/catalog/movies/",
            {
                "title": "Interstellar",
                "genres": [str(genre.id), str(second_genre.id)],
                "synopsis": "Space exploration.",
                "duration_minutes": 169,
                "release_date": "2014-11-07",
                "poster_url": "https://example.com/interstellar.jpg",
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED

        second_response = api_client.get("/api/v1/catalog/movies/")
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == initial_count + 1

    def test_movie_list_cache_invalidation_uses_namespace_versioning(
        self,
        api_client,
        genre,
        second_genre,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/movies/")
        initial_version = cache.get("catalog:movies:version")
        old_cache_key = f"catalog:movies:v{initial_version}:/api/v1/catalog/movies/"
        assert cache.get(old_cache_key) == first_response.data

        create_response = api_client.post(
            "/api/v1/catalog/movies/",
            {
                "title": "Interstellar",
                "genres": [str(genre.id), str(second_genre.id)],
                "synopsis": "Space exploration.",
                "duration_minutes": 169,
                "release_date": "2014-11-07",
                "poster_url": "https://example.com/interstellar.jpg",
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert cache.get("catalog:movies:version") == initial_version + 1

        second_response = api_client.get("/api/v1/catalog/movies/")

        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == first_response.data["count"] + 1
        assert cache.get(old_cache_key) == first_response.data

    def test_session_list_cache_should_be_invalidated_after_session_creation(
        self,
        api_client,
        movie,
        room,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/sessions/")
        assert first_response.status_code == status.HTTP_200_OK
        initial_count = first_response.data["count"]

        create_response = api_client.post(
            "/api/v1/catalog/sessions/",
            {
                "movie": str(movie.id),
                "room": str(room.id),
                "start_time": "2026-03-23T18:00:00Z",
                "end_time": "2026-03-23T20:55:00Z",
                "base_price": "30.00",
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED

        second_response = api_client.get("/api/v1/catalog/sessions/")
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == initial_count + 1

    def test_session_list_cache_invalidation_uses_namespace_versioning(
        self,
        api_client,
        movie,
        room,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/sessions/")
        initial_version = cache.get("catalog:sessions:version")
        old_cache_key = f"catalog:sessions:v{initial_version}:/api/v1/catalog/sessions/"
        assert cache.get(old_cache_key) == first_response.data

        create_response = api_client.post(
            "/api/v1/catalog/sessions/",
            {
                "movie": str(movie.id),
                "room": str(room.id),
                "start_time": "2026-03-23T18:00:00Z",
                "end_time": "2026-03-23T20:55:00Z",
                "base_price": "30.00",
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert cache.get("catalog:sessions:version") == initial_version + 1

        second_response = api_client.get("/api/v1/catalog/sessions/")

        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == first_response.data["count"] + 1
        assert cache.get(old_cache_key) == first_response.data

    def test_movie_list_cache_should_be_invalidated_after_movie_deletion(
        self,
        api_client,
        movie,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/movies/")
        assert first_response.status_code == status.HTTP_200_OK
        initial_count = first_response.data["count"]

        delete_response = api_client.delete(f"/api/v1/catalog/movies/{movie.id}/")
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        second_response = api_client.get("/api/v1/catalog/movies/")
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == initial_count - 1

    def test_genre_update_should_invalidate_movie_and_session_list_caches(
        self,
        api_client,
        genre,
        session,
    ):
        cache.clear()

        first_movie_response = api_client.get("/api/v1/catalog/movies/")
        first_session_response = api_client.get("/api/v1/catalog/sessions/")

        assert first_movie_response.status_code == status.HTTP_200_OK
        assert first_session_response.status_code == status.HTTP_200_OK
        assert first_movie_response.data["results"][0]["genres"][0]["name"] == "Crime"

        update_response = api_client.patch(
            f"/api/v1/catalog/genres/{genre.id}/",
            {"name": "Drama Updated"},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK

        second_movie_response = api_client.get("/api/v1/catalog/movies/")
        second_session_response = api_client.get("/api/v1/catalog/sessions/")

        assert second_movie_response.status_code == status.HTTP_200_OK
        assert second_session_response.status_code == status.HTTP_200_OK
        movie_genre_names = [
            item["name"] for item in second_movie_response.data["results"][0]["genres"]
        ]
        session_genre_names = [
            item["name"]
            for item in second_session_response.data["results"][0]["movie"]["genres"]
        ]
        assert "Drama Updated" in movie_genre_names
        assert "Drama Updated" in session_genre_names

    def test_movie_update_should_invalidate_movie_and_session_list_caches(
        self,
        api_client,
        movie,
        session,
    ):
        cache.clear()

        first_movie_response = api_client.get("/api/v1/catalog/movies/")
        first_session_response = api_client.get("/api/v1/catalog/sessions/")

        assert first_movie_response.status_code == status.HTTP_200_OK
        assert first_session_response.status_code == status.HTTP_200_OK

        update_response = api_client.patch(
            f"/api/v1/catalog/movies/{movie.id}/",
            {"title": "The Godfather Updated"},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK

        second_movie_response = api_client.get("/api/v1/catalog/movies/")
        second_session_response = api_client.get("/api/v1/catalog/sessions/")

        assert second_movie_response.status_code == status.HTTP_200_OK
        assert second_session_response.status_code == status.HTTP_200_OK
        assert (
            second_movie_response.data["results"][0]["title"] == "The Godfather Updated"
        )
        assert (
            second_session_response.data["results"][0]["movie"]["title"]
            == "The Godfather Updated"
        )

    def test_movie_update_should_invalidate_filtered_movie_list_cache(
        self,
        api_client,
        movie,
    ):
        cache.clear()

        first_response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.PRE_VENDA}"
        )
        assert first_response.status_code == status.HTTP_200_OK
        assert first_response.data["count"] == 0

        update_response = api_client.patch(
            f"/api/v1/catalog/movies/{movie.id}/",
            {"status": MovieStatus.PRE_VENDA},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK

        second_response = api_client.get(
            f"/api/v1/catalog/movies/?status={MovieStatus.PRE_VENDA}"
        )

        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == 1
        assert second_response.data["results"][0]["id"] == str(movie.id)

    def test_upcoming_movie_list_cache_should_be_invalidated_after_movie_mutations(
        self,
        api_client,
        genre,
        second_genre,
    ):
        cache.clear()
        upcoming_url = f"/api/v1/catalog/movies/?status={MovieStatus.EM_BREVE}"

        first_response = api_client.get(upcoming_url)
        assert first_response.status_code == status.HTTP_200_OK
        assert first_response.data["count"] == 0

        create_response = api_client.post(
            "/api/v1/catalog/movies/",
            {
                "title": "Soon in Theaters",
                "genres": [str(genre.id), str(second_genre.id)],
                "synopsis": "A future catalog entry.",
                "duration_minutes": 121,
                "release_date": "2026-12-25",
                "poster_url": "https://example.com/soon-in-theaters.jpg",
                "status": MovieStatus.EM_BREVE,
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        movie_id = create_response.data["id"]

        after_create_response = api_client.get(upcoming_url)
        assert after_create_response.status_code == status.HTTP_200_OK
        assert after_create_response.data["count"] == 1
        assert after_create_response.data["results"][0]["id"] == movie_id

        update_response = api_client.patch(
            f"/api/v1/catalog/movies/{movie_id}/",
            {"status": MovieStatus.EM_CARTAZ},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK

        after_update_response = api_client.get(upcoming_url)
        assert after_update_response.status_code == status.HTTP_200_OK
        assert after_update_response.data["count"] == 0

        restore_response = api_client.patch(
            f"/api/v1/catalog/movies/{movie_id}/",
            {"status": MovieStatus.EM_BREVE},
            format="json",
        )
        assert restore_response.status_code == status.HTTP_200_OK

        after_restore_response = api_client.get(upcoming_url)
        assert after_restore_response.status_code == status.HTTP_200_OK
        assert after_restore_response.data["count"] == 1

        delete_response = api_client.delete(f"/api/v1/catalog/movies/{movie_id}/")
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        after_delete_response = api_client.get(upcoming_url)
        assert after_delete_response.status_code == status.HTTP_200_OK
        assert after_delete_response.data["count"] == 0

    def test_session_list_cache_should_be_invalidated_after_session_deletion(
        self,
        api_client,
        session,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/sessions/")
        assert first_response.status_code == status.HTTP_200_OK
        initial_count = first_response.data["count"]

        delete_response = api_client.delete(f"/api/v1/catalog/sessions/{session.id}/")
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        second_response = api_client.get("/api/v1/catalog/sessions/")
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["count"] == initial_count - 1

    def test_room_update_should_invalidate_session_list_cache(
        self,
        api_client,
        room,
        session,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/sessions/")
        assert first_response.status_code == status.HTTP_200_OK
        assert first_response.data["results"][0]["room"]["name"] == "Room 1"

        update_response = api_client.patch(
            f"/api/v1/catalog/rooms/{room.id}/",
            {"name": "Room Prime", "capacity": 70},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK

        second_response = api_client.get("/api/v1/catalog/sessions/")
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["results"][0]["room"]["name"] == "Room Prime"

    def test_session_update_should_invalidate_session_list_cache(
        self,
        api_client,
        session,
    ):
        cache.clear()

        first_response = api_client.get("/api/v1/catalog/sessions/")
        assert first_response.status_code == status.HTTP_200_OK

        new_end_time = (
            (session.end_time + timedelta(minutes=30))
            .isoformat()
            .replace(
                "+00:00",
                "Z",
            )
        )

        update_response = api_client.patch(
            f"/api/v1/catalog/sessions/{session.id}/",
            {"end_time": new_end_time},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK

        second_response = api_client.get("/api/v1/catalog/sessions/")
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["results"][0]["end_time"] == new_end_time
