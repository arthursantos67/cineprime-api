import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, setApiAuthController } from "./client";
import { chatbotApi } from "./chatbot";

test("chatbotApi posts the conversation id and message to the authenticated endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/chatbot/message/");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          conversation_id: "conversation-1",
          message: "Quais sessões tem hoje?",
        })
      );

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer access-token");
      assert.equal(headers.get("Content-Type"), "application/json");

      return Response.json({
        conversation_id: "conversation-1",
        reply: "Para qual data?",
      });
    };

    const response = await chatbotApi.sendMessage({
      conversation_id: "conversation-1",
      message: "Quais sessões tem hoje?",
    });

    assert.deepEqual(response, {
      conversation_id: "conversation-1",
      reply: "Para qual data?",
    });
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("chatbotApi returns the structured redirect action when present", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async () =>
      Response.json({
        conversation_id: "conversation-1",
        reply: "Encontrei assentos disponíveis!",
        action: {
          action: "redirect",
          target: "seatmap",
          session_id: "session-123",
        },
      });

    const response = await chatbotApi.sendMessage({
      conversation_id: "conversation-1",
      message: "Quero reservar",
    });

    assert.deepEqual(response.action, {
      action: "redirect",
      target: "seatmap",
      session_id: "session-123",
    });
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("chatbotApi preserves backend error codes", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async () =>
      Response.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            details: {},
            message: "message must not be blank.",
            status: 400,
          },
        },
        { status: 400 }
      );

    await assert.rejects(
      chatbotApi.sendMessage({
        conversation_id: "conversation-1",
        message: "",
      }),
      (error) => error instanceof ApiError && error.code === "VALIDATION_FAILED"
    );
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("chatbotApi rejects unexpected response shapes", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async () => Response.json({ reply: "oi" });

    await assert.rejects(
      chatbotApi.sendMessage({
        conversation_id: "conversation-1",
        message: "oi",
      }),
      /Unexpected chatbot message response/
    );
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});
