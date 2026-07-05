"use client";

import { useCallback, useEffect, useState } from "react";

import { getApiErrorUserMessage } from "@/api/client";
import { walletApi, type WalletResponse } from "@/api/wallet";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { useI18n } from "@/i18n";

type WalletState =
  | { status: "error"; message: string }
  | { status: "loading" }
  | { status: "success"; wallet: WalletResponse };

const REASON_TONES: Record<string, BadgeTone> = {
  adjustment: "info",
  purchase: "neutral",
  refund: "success",
};

export function WalletSection() {
  const { formatCurrency, formatDateTime, locale, t } = useI18n();
  const [state, setState] = useState<WalletState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    setState({ status: "loading" });

    walletApi
      .getWallet({ signal: abortController.signal })
      .then((wallet) => {
        setState({ status: "success", wallet });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          message: getApiErrorUserMessage(error, locale),
          status: "error",
        });
      });

    return () => {
      abortController.abort();
    };
  }, [locale, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
  }, []);

  if (state.status === "loading") {
    return (
      <StateMessage tone="loading" title={t("profile.walletLoadingTitle")}>
        {t("profile.walletLoadingDescription")}
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          <Button onClick={handleRetry} variant="ghost">
            {t("profile.retry")}
          </Button>
        }
        tone="error"
        title={t("profile.walletErrorTitle")}
      >
        {state.message}
      </StateMessage>
    );
  }

  const { balance, transactions } = state.wallet;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <p className="m-0 text-sm font-bold text-muted">
          {t("profile.walletBalanceLabel")}
        </p>
        <p className="m-0 text-3xl font-[850] text-white">
          {formatCurrency(Number(balance))}
        </p>
        <p className="m-0 text-sm text-muted">{t("profile.walletDisclaimer")}</p>
      </div>

      <div className="grid gap-3">
        <h3 className="m-0 text-base font-extrabold text-white">
          {t("profile.walletHistoryTitle")}
        </h3>
        {transactions.length === 0 ? (
          <StateMessage tone="empty" title={t("profile.walletEmptyTitle")}>
            {t("profile.walletEmptyDescription")}
          </StateMessage>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {transactions.map((transaction) => {
              // Sign comes from the decimal string itself; Number() is
              // confined to display formatting to avoid float arithmetic on
              // monetary values.
              const isCredit = !transaction.amount.startsWith("-");

              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-white/10 bg-white/[0.03] px-4 py-3"
                  key={transaction.id}
                >
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        size="sm"
                        tone={REASON_TONES[transaction.reason] ?? "neutral"}
                      >
                        {t(`profile.walletReason.${transaction.reason}`)}
                      </Badge>
                      {transaction.reference ? (
                        <span className="text-xs font-bold text-muted">
                          {transaction.reference}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted">
                      {formatDateTime(transaction.created_at)}
                    </span>
                  </div>
                  <span
                    className={
                      isCredit
                        ? "text-sm font-extrabold text-success"
                        : "text-sm font-extrabold text-error"
                    }
                  >
                    {isCredit ? "+" : ""}
                    {formatCurrency(Number(transaction.amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
