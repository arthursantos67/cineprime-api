import type { ChatAction, ChatMessage, ChatMessageResponse } from "@/types/chatbot";

export function createConversationId(): string {
  return crypto.randomUUID();
}

export function appendUserMessage(
  messages: ChatMessage[],
  text: string
): ChatMessage[] {
  return [
    ...messages,
    { id: crypto.randomUUID(), role: "user", content: text },
  ];
}

export function appendAssistantMessage(
  messages: ChatMessage[],
  response: ChatMessageResponse
): ChatMessage[] {
  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: response.reply,
      action: response.action ?? null,
    },
  ];
}

export function appendErrorMessage(
  messages: ChatMessage[],
  errorText: string,
  retryText: string
): ChatMessage[] {
  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: errorText,
      isError: true,
      retryText,
    },
  ];
}

// The backend only emits a "redirect"/"seatmap" action today (see #261's
// ChatActionSerializer), but the shape is generic so unrecognized future
// actions are safely ignored instead of rendering a broken CTA.
export function getSeatmapRedirectSessionId(
  action: ChatAction | null | undefined
): string | null {
  if (!action || action.action !== "redirect" || action.target !== "seatmap") {
    return null;
  }

  return action.session_id ?? null;
}

// pt-BR and en-US are this app's actively supported locales (see the
// frontend PRD's NFR-06); the other 6 locale dictionaries in messages.ts
// exist but aren't a target for this heuristic yet.
const NEW_CONVERSATION_TRIGGERS = [
  "nova conversa",
  "iniciar uma nova conversa",
  "iniciar nova conversa",
  "começar uma nova conversa",
  "reiniciar a conversa",
  "reiniciar conversa",
  "limpar a conversa",
  "limpar conversa",
  "apagar a conversa",
  "new conversation",
  "start a new conversation",
  "start over",
  "reset the conversation",
  "reset conversation",
  "clear the conversation",
  "clear conversation",
];

// A trigger only counts at the start or end of the message (with a word
// boundary, not mid-word) — never buried in the middle. A plain substring
// check would also fire on real questions that merely happen to contain the
// phrase, e.g. "Quero começar uma nova conversa sobre o filme Duna" is a
// question about a movie, not a reset command, even though it contains
// "começar uma nova conversa" verbatim.
function matchesConversationTrigger(
  normalized: string,
  strippedOfTrailingPunctuation: string,
  trigger: string
): boolean {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWithTrigger = new RegExp(`^${escaped}(?:\\W|$)`).test(normalized);
  const endsWithTrigger = new RegExp(`(?:^|\\W)${escaped}$`).test(
    strippedOfTrailingPunctuation
  );
  return startsWithTrigger || endsWithTrigger;
}

// A lightweight, deterministic escape hatch: if the LLM agent (backend
// #261) doesn't recognize a "start fresh" intent, the widget can still
// honor it locally without a round trip to the backend.
export function isNewConversationCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const strippedOfTrailingPunctuation = normalized.replace(/[.,!?]+$/, "");
  return NEW_CONVERSATION_TRIGGERS.some((trigger) =>
    matchesConversationTrigger(normalized, strippedOfTrailingPunctuation, trigger)
  );
}

// The seatmap CTA button's onClick is built from this so the exact wiring
// (does clicking navigate with the message's own session id?) is directly
// unit-testable without simulating a real DOM click.
export function createSeatmapNavigationHandler(
  sessionId: string,
  onNavigateToSeatmap: (sessionId: string) => void
) {
  return () => onNavigateToSeatmap(sessionId);
}
