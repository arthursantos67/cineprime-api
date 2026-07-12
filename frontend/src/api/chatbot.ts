import type { ChatAction, ChatMessageResponse } from "@/types/chatbot";

import { apiRequest } from "./client";

const CHATBOT_MESSAGE_PATH = "/api/v1/chatbot/message/";

export type SendChatMessagePayload = {
  conversation_id: string;
  message: string;
};

export const chatbotApi = {
  sendMessage(payload: SendChatMessagePayload) {
    return sendMessage(payload);
  },
};

async function sendMessage(payload: SendChatMessagePayload) {
  const response = await apiRequest<unknown>(CHATBOT_MESSAGE_PATH, {
    auth: "required",
    json: payload,
    method: "POST",
  });

  if (!isChatMessageResponse(response)) {
    throw new Error("Unexpected chatbot message response.");
  }

  return response satisfies ChatMessageResponse;
}

function isChatMessageResponse(value: unknown): value is ChatMessageResponse {
  return (
    isRecord(value) &&
    typeof value.conversation_id === "string" &&
    typeof value.reply === "string" &&
    (value.action === undefined ||
      value.action === null ||
      isChatAction(value.action))
  );
}

function isChatAction(value: unknown): value is ChatAction {
  return (
    isRecord(value) &&
    typeof value.action === "string" &&
    typeof value.target === "string" &&
    (value.session_id === undefined ||
      value.session_id === null ||
      typeof value.session_id === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
