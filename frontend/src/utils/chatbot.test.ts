import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "@/types/chatbot";

import {
  appendAssistantMessage,
  appendErrorMessage,
  appendUserMessage,
  createSeatmapNavigationHandler,
  getSeatmapRedirectSessionId,
  isNewConversationCommand,
} from "./chatbot";

test("appendUserMessage adds a user message preserving prior history", () => {
  const first = appendUserMessage([], "Quais sessões tem hoje?");
  assert.equal(first.length, 1);
  assert.equal(first[0].role, "user");
  assert.equal(first[0].content, "Quais sessões tem hoje?");
  assert.equal(typeof first[0].id, "string");
  assert.ok(first[0].id.length > 0);

  const second = appendUserMessage(first, "Para hoje à noite");
  assert.equal(second.length, 2);
  assert.equal(second[0], first[0]);
  assert.equal(second[1].content, "Para hoje à noite");
});

test("appendAssistantMessage renders the bot reply and carries an optional action", () => {
  const withoutAction = appendAssistantMessage([], {
    conversation_id: "conversation-1",
    reply: "Para qual data?",
  });
  assert.equal(withoutAction[0].role, "assistant");
  assert.equal(withoutAction[0].content, "Para qual data?");
  assert.equal(withoutAction[0].action, null);

  const withAction = appendAssistantMessage(withoutAction, {
    conversation_id: "conversation-1",
    reply: "Encontrei assentos disponíveis!",
    action: { action: "redirect", target: "seatmap", session_id: "session-123" },
  });
  assert.equal(withAction.length, 2);
  assert.deepEqual(withAction[1].action, {
    action: "redirect",
    target: "seatmap",
    session_id: "session-123",
  });
});

test("multi-turn slot-filling keeps every reply in the same conversation history", () => {
  let messages: ChatMessage[] = [];
  messages = appendUserMessage(messages, "Quero ver sessões de Duna hoje");
  messages = appendAssistantMessage(messages, {
    conversation_id: "conversation-1",
    reply: "Para qual data?",
  });
  messages = appendUserMessage(messages, "2026-07-12");
  messages = appendAssistantMessage(messages, {
    conversation_id: "conversation-1",
    reply: "Encontrei 3 sessões para essa data.",
  });

  assert.equal(messages.length, 4);
  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "assistant", "user", "assistant"]
  );
  assert.equal(messages[1].content, "Para qual data?");
  assert.equal(messages[3].content, "Encontrei 3 sessões para essa data.");
});

test("appendErrorMessage records a visible, error-flagged assistant message carrying the failed text to retry", () => {
  const messages = appendErrorMessage(
    [],
    "Sua sessão expirou. Faça login novamente.",
    "Quais sessões tem hoje?"
  );
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[0].isError, true);
  assert.equal(messages[0].content, "Sua sessão expirou. Faça login novamente.");
  assert.equal(messages[0].retryText, "Quais sessões tem hoje?");
});

test("getSeatmapRedirectSessionId extracts the session id from a redirect action", () => {
  assert.equal(
    getSeatmapRedirectSessionId({
      action: "redirect",
      target: "seatmap",
      session_id: "session-123",
    }),
    "session-123"
  );
});

test("getSeatmapRedirectSessionId ignores unrelated or missing actions", () => {
  assert.equal(getSeatmapRedirectSessionId(null), null);
  assert.equal(getSeatmapRedirectSessionId(undefined), null);
  assert.equal(
    getSeatmapRedirectSessionId({ action: "redirect", target: "checkout" }),
    null
  );
  assert.equal(
    getSeatmapRedirectSessionId({ action: "noop", target: "seatmap" }),
    null
  );
  assert.equal(
    getSeatmapRedirectSessionId({
      action: "redirect",
      target: "seatmap",
      session_id: null,
    }),
    null
  );
});

test("createSeatmapNavigationHandler's click handler navigates with the exact session id it was built for", () => {
  // This is the literal function the CTA button's onClick is set to
  // (see ChatMessageBubble in ChatMessageList.tsx) — invoking it here
  // exercises the real click-to-navigate wiring without a DOM.
  let navigatedTo: string | null = null;
  const handleClick = createSeatmapNavigationHandler("session-123", (sessionId) => {
    navigatedTo = sessionId;
  });

  assert.equal(navigatedTo, null);
  handleClick();
  assert.equal(navigatedTo, "session-123");
});

test("createSeatmapNavigationHandler never mixes up session ids across messages", () => {
  const seen: string[] = [];
  const onNavigate = (sessionId: string) => seen.push(sessionId);

  createSeatmapNavigationHandler("session-A", onNavigate)();
  createSeatmapNavigationHandler("session-B", onNavigate)();

  assert.deepEqual(seen, ["session-A", "session-B"]);
});

test("isNewConversationCommand recognizes pt-BR and en-US phrasings", () => {
  assert.equal(isNewConversationCommand("nova conversa"), true);
  assert.equal(isNewConversationCommand("Quero iniciar uma nova conversa"), true);
  assert.equal(isNewConversationCommand("pode limpar a conversa?"), true);
  assert.equal(isNewConversationCommand("Start a new conversation, please"), true);
  assert.equal(isNewConversationCommand("RESET CONVERSATION"), true);
});

test("isNewConversationCommand ignores ordinary questions", () => {
  assert.equal(isNewConversationCommand("Quais sessões tem hoje?"), false);
  assert.equal(isNewConversationCommand("hoje"), false);
  assert.equal(isNewConversationCommand(""), false);
});

test("isNewConversationCommand ignores real questions that merely contain a trigger phrase", () => {
  assert.equal(
    isNewConversationCommand(
      "Quero começar uma nova conversa sobre o filme Duna com meus amigos"
    ),
    false
  );
  assert.equal(
    isNewConversationCommand("I keep wanting to start overthinking this movie choice"),
    false
  );
  assert.equal(
    isNewConversationCommand(
      "Can you clear conversation history from another app? Anyway, quais sessões tem hoje?"
    ),
    false
  );
  assert.equal(isNewConversationCommand("reset conversationalists are weird"), false);
});
