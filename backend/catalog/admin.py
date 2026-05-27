from django.contrib import admin

from catalog.models import Genre, Movie, Room, Session


@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ("title", "duration_minutes", "release_date", "created_at")
    search_fields = ("title",)
    filter_horizontal = ("genres",)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "display_name", "experience_type", "capacity", "created_at")
    list_filter = ("experience_type",)
    search_fields = ("name", "display_name", "description")


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = (
        "movie",
        "room",
        "start_time",
        "end_time",
        "base_price",
        "audio_format",
        "projection_format",
        "session_type",
        "created_at",
    )
    list_filter = (
        "room",
        "audio_format",
        "projection_format",
        "session_type",
        "start_time",
    )
    search_fields = ("movie__title", "room__name")
