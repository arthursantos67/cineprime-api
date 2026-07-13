"use client";

import { useEffect, useRef } from "react";

import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/classNames";
import { useI18n } from "@/i18n";
import type { ChatMessage } from "@/types/chatbot";
import {
  createSeatmapNavigationHandler,
  getSeatmapRedirectSessionId,
} from "@/utils/chatbot";

type ChatMessageListProps = {
  isSending: boolean;
  messages: ChatMessage[];
  onNavigateToSeatmap: (sessionId: string) => void;
};

export function ChatMessageList({
  isSending,
  messages,
  onNavigateToSeatmap,
}: ChatMessageListProps) {
  const { t } = useI18n();
  const endOfListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfListRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, isSending]);

  return (
    <div
      aria-label={t("chatbot.messagesLabel")}
      aria-live="polite"
      className="flex min-h-[160px] flex-1 flex-col gap-3 overflow-y-auto py-1"
      role="log"
    >
      {messages.length === 0 ? (
        <p className="m-0 text-sm text-white/60">{t("chatbot.emptyState")}</p>
      ) : (
        messages.map((message) => (
          <ChatMessageBubble
            key={message.id}
            message={message}
            onNavigateToSeatmap={onNavigateToSeatmap}
          />
        ))
      )}
      {isSending ? <ChatTypingIndicator /> : null}
      <div ref={endOfListRef} />
    </div>
  );
}

export function ChatMessageBubble({
  message,
  onNavigateToSeatmap,
}: {
  message: ChatMessage;
  onNavigateToSeatmap: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const isUser = message.role === "user";
  const seatmapSessionId = getSeatmapRedirectSessionId(message.action);

  return (
    <div className={cn("flex items-start gap-2", isUser ? "justify-end" : "justify-start")}>
      {isUser ? null : (
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/20 text-brand"
        >
          <MessageCircle size={14} />
        </span>
      )}
      <div
        className={cn(
          "max-w-[80%] px-3.5 py-2.5 text-sm leading-6 shadow-sm",
          isUser
            ? "rounded-2xl rounded-br-md bg-brand text-white"
            : message.isError
              ? "rounded-2xl rounded-bl-md border border-error/40 bg-error/15 text-white"
              : "rounded-2xl rounded-bl-md bg-white/[0.06] text-white/90"
        )}
      >
        <p className="m-0 whitespace-pre-wrap">{message.content}</p>
        {seatmapSessionId ? (
          <Button
            className="mt-2"
            data-session-id={seatmapSessionId}
            onClick={createSeatmapNavigationHandler(
              seatmapSessionId,
              onNavigateToSeatmap
            )}
            size="sm"
            variant="secondary"
          >
            {t("chatbot.goToSeatmap")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ChatTypingIndicator() {
  const { t } = useI18n();

  return (
    <div className="flex items-start justify-start gap-2">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/20 text-brand"
      >
        <MessageCircle size={14} />
      </span>
      <div
        aria-label={t("chatbot.typing")}
        className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-3 shadow-sm"
        role="status"
      >
        <span className="size-1.5 animate-bounce rounded-pill bg-white/60 motion-reduce:animate-none [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-pill bg-white/60 motion-reduce:animate-none [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-pill bg-white/60 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
