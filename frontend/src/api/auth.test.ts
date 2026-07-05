import assert from "node:assert/strict";
import test from "node:test";

import { authApi } from "./auth";

test("register posts visitor data to the canonical auth endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/auth/register/");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          email: "ana@example.com",
          password: "senha-secreta",
          username: "ana",
        })
      );

      return Response.json(
        {
          created_at: "2026-05-21T10:00:00Z",
          email: "ana@example.com",
          id: "user-1",
          username: "ana",
        },
        { status: 201 }
      );
    };

    const response = await authApi.register({
      email: "ana@example.com",
      password: "senha-secreta",
      username: "ana",
    });

    assert.equal(response.email, "ana@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login posts credentials and returns in-memory token data", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/auth/login/");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          email: "ana@example.com",
          password: "senha-secreta",
        })
      );

      return Response.json({
        access: "access-token",
        refresh: "refresh-token",
      });
    };

    const response = await authApi.login({
      email: "ana@example.com",
      password: "senha-secreta",
    });

    assert.deepEqual(response, {
      access: "access-token",
      refresh: "refresh-token",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateProfile patches the current user endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/users/me/");
      assert.equal(init?.method, "PATCH");
      assert.equal(init?.body, JSON.stringify({ username: "novo-nome" }));

      return Response.json({
        created_at: "2026-05-21T10:00:00Z",
        email: "ana@example.com",
        email_change_requested: false,
        id: "user-1",
        is_staff: false,
        is_verified: true,
        role: "user",
        username: "novo-nome",
      });
    };

    const response = await authApi.updateProfile({ username: "novo-nome" });

    assert.equal(response.username, "novo-nome");
    assert.equal(response.email_change_requested, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("changePassword posts snake_case fields to the change-password endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/users/me/change-password/"
      );
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          current_password: "senha-antiga",
          new_password: "senha-nova",
        })
      );

      return Response.json({ detail: "Password changed successfully." });
    };

    const response = await authApi.changePassword({
      currentPassword: "senha-antiga",
      newPassword: "senha-nova",
    });

    assert.equal(response.detail, "Password changed successfully.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirmEmailChange calls the public confirmation endpoint with the token", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/auth/change-email/tok-123/"
      );

      return Response.json({ changed: true, email: "nova@example.com" });
    };

    const response = await authApi.confirmEmailChange("tok-123");

    assert.equal(response.changed, true);
    assert.equal(response.email, "nova@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleteAccount sends the password and confirm flag", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/users/me/?confirm=true"
      );
      assert.equal(init?.method, "DELETE");
      assert.equal(init?.body, JSON.stringify({ password: "senha-secreta" }));

      return new Response(null, { status: 204 });
    };

    await authApi.deleteAccount({ confirm: true, password: "senha-secreta" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
