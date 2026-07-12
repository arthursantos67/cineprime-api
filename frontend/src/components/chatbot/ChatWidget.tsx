"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";

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
  const { isSending, messages, sendMessage } = useChatbot();
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
        className="fixed bottom-6 right-6 z-20 grid size-14 place-items-center rounded-full border border-white/[0.12] bg-brand text-white shadow-xl transition duration-150 hover:bg-brand-strong focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.97]"
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
