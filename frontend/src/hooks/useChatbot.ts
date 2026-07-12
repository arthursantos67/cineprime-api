"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chatbotApi } from "@/api/chatbot";
import { getApiErrorUserMessage } from "@/api/client";
import { AUTH_PROTECTED_STATE_RESET_EVENT } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import type { ChatMessage } from "@/types/chatbot";
import {
  appendAssistantMessage,
  appendErrorMessage,
  appendUserMessage,
  createConversationId,
} from "@/utils/chatbot";

export type UseChatbotResult = {
  isSending: boolean;
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
};

// Conversation id + history live only in component state: they intentionally
// do not survive a full page reload (see issue #263 scope).
export function useChatbot(): UseChatbotResult {
  const { locale } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const isSendingRef = useRef(false);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();

      if (!text || isSendingRef.current) {
        return;
      }

      if (!conversationIdRef.current) {
        conversationIdRef.current = createConversationId();
      }

      setMessages((current) => appendUserMessage(current, text));
      isSendingRef.current = true;
      setIsSending(true);

      try {
        const response = await chatbotApi.sendMessage({
          conversation_id: conversationIdRef.current,
          message: text,
        });
        setMessages((current) => appendAssistantMessage(current, response));
      } catch (error) {
        setMessages((current) =>
          appendErrorMessage(current, getApiErrorUserMessage(error, locale))
        );
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [locale]
  );

  // A logout (including a forced one from a failed token refresh) must wipe
  // the transcript and conversation id: this hook otherwise keeps running in
  // a persistent, layout-mounted widget, so the next user to log in on the
  // same tab would silently inherit the previous user's chat history.
  useEffect(() => {
    function reset() {
      conversationIdRef.current = null;
      isSendingRef.current = false;
      setIsSending(false);
      setMessages([]);
    }

    window.addEventListener(AUTH_PROTECTED_STATE_RESET_EVENT, reset);

    return () => {
      window.removeEventListener(AUTH_PROTECTED_STATE_RESET_EVENT, reset);
    };
  }, []);

  return { isSending, messages, sendMessage };
}
