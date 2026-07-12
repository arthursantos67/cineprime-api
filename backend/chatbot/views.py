from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chatbot.serializers import (
    ChatMessageRequestSerializer,
    ChatMessageResponseSerializer,
)
from chatbot.service import handle_message


class ChatbotMessageView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Chatbot"],
        summary="Send a chatbot message",
        description=(
            "Sends a natural-language message to the CinePrime chatbot and returns its reply, "
            "along with an optional structured action (e.g. a seat-map redirect) the frontend "
            "can act on. Conversation state is tracked server-side by conversation_id, scoped "
            "to the authenticated user."
        ),
        request=ChatMessageRequestSerializer,
        responses={
            200: ChatMessageResponseSerializer,
            400: OpenApiResponse(description="Validation error."),
        },
    )
    def post(self, request):
        request_serializer = ChatMessageRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        result = handle_message(
            user=request.user,
            conversation_id=request_serializer.validated_data["conversation_id"],
            message=request_serializer.validated_data["message"],
        )

        response_serializer = ChatMessageResponseSerializer(
            {
                "conversation_id": request_serializer.validated_data["conversation_id"],
                "reply": result["reply"],
                "action": result["action"],
            }
        )
        return Response(response_serializer.data)
