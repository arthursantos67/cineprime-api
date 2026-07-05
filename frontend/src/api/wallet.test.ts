import assert from "node:assert/strict";
import test from "node:test";

import { isWalletResponse, walletApi } from "./wallet";

const VALID_WALLET = {
  balance: "19.50",
  transactions: [
    {
      amount: "30.00",
      created_at: "2026-07-01T12:00:00Z",
      id: "tx-1",
      reason: "refund",
      reference: "TICKETCODE",
    },
    {
      amount: "-10.50",
      created_at: "2026-07-02T12:00:00Z",
      id: "tx-2",
      reason: "purchase",
      reference: "",
    },
  ],
};

test("getWallet fetches the authenticated wallet endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/users/me/wallet/");
      assert.equal(init?.method, "GET");

      return Response.json(VALID_WALLET);
    };

    const response = await walletApi.getWallet();

    assert.equal(response.balance, "19.50");
    assert.equal(response.transactions.length, 2);
    assert.equal(response.transactions[0].reason, "refund");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getWallet rejects malformed responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({ balance: 19.5, transactions: "nope" });

    await assert.rejects(
      () => walletApi.getWallet(),
      /Unexpected wallet response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isWalletResponse validates shape strictly", () => {
  assert.equal(isWalletResponse(VALID_WALLET), true);
  assert.equal(isWalletResponse({ balance: "0.00", transactions: [] }), true);
  assert.equal(isWalletResponse({ balance: 0, transactions: [] }), false);
  assert.equal(
    isWalletResponse({
      balance: "0.00",
      transactions: [{ amount: "1.00", created_at: "x", id: "1", reason: "bonus", reference: "" }],
    }),
    false
  );
  assert.equal(isWalletResponse(null), false);
});
