"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { MessageCircle, RotateCcw, X } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { getSessionSeatsHref } from "@/components/movies/session-selection";
import { useAuth } from "@/contexts/AuthContext";
import { useChatbot } from "@/hooks/useChatbot";
import { useI18n } from "@/i18n";

import { ChatInput } from "./ChatInput";
import { ChatMessageList } from "./ChatMessageList";

// "my tickets" / "next session" intents require an authenticated user, so
// the launcher is hidden entirely for visitors (see issue #263 scope).
export function ChatWidget() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const { isSending, messages, resetConversation, sendMessage } = useChatbot();
  const [isOpen, setIsOpen] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  function handleNavigateToSeatmap(sessionId: string) {
    setIsOpen(false);
    router.push(getSessionSeatsHref(sessionId));
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={isOpen ? t("chatbot.closeLauncher") : t("chatbot.openLauncher")}
        className="fixed bottom-6 right-6 z-20 grid size-14 place-items-center rounded-full bg-brand text-white shadow-2xl ring-4 ring-brand/20 transition duration-150 hover:bg-brand-strong hover:ring-brand/30 focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.97]"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {isOpen ? (
          <X aria-hidden="true" size={24} />
        ) : (
          <MessageCircle aria-hidden="true" size={24} />
        )}
      </button>
      <Dialog
        className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-hidden sm:w-[400px]"
        closeLabel={t("chatbot.close")}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t("chatbot.title")}
      >
        {messages.length > 0 ? (
          <button
            aria-label={t("chatbot.newConversation")}
            className="mb-2 inline-flex w-fit items-center gap-1.5 self-end rounded-pill px-2 py-1 text-xs font-bold text-white/50 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/80 focus-visible:outline-none focus-visible:shadow-focus"
            onClick={resetConversation}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            {t("chatbot.newConversation")}
          </button>
        ) : null}
        <ChatMessageList
          isSending={isSending}
          messages={messages}
          onNavigateToSeatmap={handleNavigateToSeatmap}
        />
        <ChatInput isSending={isSending} onSend={sendMessage} />
      </Dialog>
    </>
  );
}
