from rest_framework import serializers


class ChatMessageRequestSerializer(serializers.Serializer):
    conversation_id = serializers.CharField(max_length=100)
    message = serializers.CharField(max_length=2000, trim_whitespace=True)

    def validate_message(self, value):
        if not value.strip():
            raise serializers.ValidationError("Message cannot be blank.")
        return value


class ChatActionSerializer(serializers.Serializer):
    action = serializers.CharField()
    target = serializers.CharField()
    session_id = serializers.CharField(required=False, allow_null=True)


class ChatMessageResponseSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    reply = serializers.CharField()
    action = ChatActionSerializer(required=False, allow_null=True)
