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
  errorText: string
): ChatMessage[] {
  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: errorText,
      isError: true,
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

// The seatmap CTA button's onClick is built from this so the exact wiring
// (does clicking navigate with the message's own session id?) is directly
// unit-testable without simulating a real DOM click.
export function createSeatmapNavigationHandler(
  sessionId: string,
  onNavigateToSeatmap: (sessionId: string) => void
) {
  return () => onNavigateToSeatmap(sessionId);
}
