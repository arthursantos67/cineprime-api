import pytest
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Movie, MovieReview
from catalog.views import _movie_queryset_with_aggregates
from users.models import User


@pytest.mark.django_db
class TestMovieReviewApi:
    @pytest.fixture
    def released_movie(self):
        return Movie.objects.create(
            title="Já Lançado",
            synopsis="Um filme em cartaz.",
            duration_minutes=100,
            release_date="2025-01-01",
            poster_url="https://example.com/poster.jpg",
            status="em_cartaz",
        )

    @pytest.fixture
    def upcoming_movie(self):
        return Movie.objects.create(
            title="Em Breve: O Filme",
            synopsis="Um filme que está por vir.",
            duration_minutes=110,
            release_date="2027-01-01",
            poster_url="https://example.com/poster.jpg",
            status="em_breve",
        )

    @pytest.fixture
    def presale_movie(self):
        return Movie.objects.create(
            title="Pré-venda: O Filme",
            synopsis="Um filme em pré-venda.",
            duration_minutes=105,
            release_date="2027-01-01",
            poster_url="https://example.com/poster.jpg",
            status="pre_venda",
        )

    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            email="reviewer@example.com",
            username="reviewer",
            password="StrongPass123",
        )

    @pytest.fixture
    def client(self, user):
        api_client = APIClient()
        api_client.force_authenticate(user=user)
        return api_client

    def _url(self, movie):
        return f"/api/v1/catalog/movies/{movie.id}/reviews/"

    def test_post_rejects_review_for_upcoming_movie(self, client, upcoming_movie):
        response = client.post(
            self._url(upcoming_movie), {"rating": 5, "comment": "Mal posso esperar!"}
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "MOVIE_NOT_RELEASED"
        assert not MovieReview.objects.filter(movie=upcoming_movie).exists()

    def test_post_accepts_review_for_released_movie(self, client, released_movie):
        response = client.post(
            self._url(released_movie), {"rating": 4.5, "comment": "Muito bom."}
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert MovieReview.objects.filter(movie=released_movie).count() == 1

    def test_post_accepts_review_for_presale_movie(self, client, presale_movie):
        response = client.post(
            self._url(presale_movie), {"rating": 4, "comment": "Já garanti meu ingresso."}
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert MovieReview.objects.filter(movie=presale_movie).count() == 1

    def test_reviews_hidden_and_excluded_from_aggregates_once_movie_reverts_to_upcoming(
        self, client, released_movie
    ):
        client.post(self._url(released_movie), {"rating": 5, "comment": "Excelente."})

        released_movie.status = "em_breve"
        released_movie.save(update_fields=["status"])

        response = client.get(self._url(released_movie))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 0
        assert response.data["results"] == []
        assert response.data["my_review"] is None

        movie_with_aggregates = _movie_queryset_with_aggregates().get(pk=released_movie.pk)
        assert movie_with_aggregates.review_count == 0
        assert movie_with_aggregates.average_rating is None
