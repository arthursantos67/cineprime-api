"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/i18n";

type ChatInputProps = {
  isSending: boolean;
  onSend: (text: string) => void;
};

export function ChatInput({ isSending, onSend }: ChatInputProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const canSend = draft.trim().length > 0 && !isSending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    onSend(draft);
    setDraft("");
  }

  return (
    <form className="flex items-end gap-2 border-t border-white/[0.08] pt-3" onSubmit={handleSubmit}>
      <Input
        containerClassName="flex-1 gap-1"
        disabled={isSending}
        label={t("chatbot.inputLabel")}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("chatbot.inputPlaceholder")}
        value={draft}
      />
      <Button
        disabled={!canSend}
        icon={<Send aria-hidden="true" size={16} />}
        isLoading={isSending}
        type="submit"
        variant="primary"
      >
        {t("chatbot.send")}
      </Button>
    </form>
  );
}
