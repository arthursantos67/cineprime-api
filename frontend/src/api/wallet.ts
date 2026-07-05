import { apiRequest } from "./client";

export type WalletTransactionReason = "adjustment" | "purchase" | "refund";

export type WalletTransaction = {
  amount: string;
  created_at: string;
  id: string;
  reason: WalletTransactionReason;
  reference: string;
};

export type WalletResponse = {
  balance: string;
  count: number;
  has_more: boolean;
  transactions: WalletTransaction[];
};

const WALLET_PATH = "/api/v1/users/me/wallet/";

export const walletApi = {
  async getWallet(options: RequestInit = {}) {
    const response = await apiRequest<unknown>(WALLET_PATH, {
      ...options,
      auth: "required",
      method: "GET",
    });

    if (!isWalletResponse(response)) {
      throw new Error("Unexpected wallet response.");
    }

    return response;
  },
};

export function isWalletResponse(value: unknown): value is WalletResponse {
  return (
    isRecord(value) &&
    typeof value.balance === "string" &&
    typeof value.count === "number" &&
    typeof value.has_more === "boolean" &&
    Array.isArray(value.transactions) &&
    value.transactions.every(isWalletTransaction)
  );
}

function isWalletTransaction(value: unknown): value is WalletTransaction {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.amount === "string" &&
    isWalletTransactionReason(value.reason) &&
    typeof value.reference === "string" &&
    typeof value.created_at === "string"
  );
}

function isWalletTransactionReason(
  value: unknown
): value is WalletTransactionReason {
  return value === "refund" || value === "purchase" || value === "adjustment";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
