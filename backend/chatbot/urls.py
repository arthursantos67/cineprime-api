from django.urls import path

from chatbot.views import ChatbotMessageView

urlpatterns = [
    path("message/", ChatbotMessageView.as_view(), name="chatbot-message"),
]
