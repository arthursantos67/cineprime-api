"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { authApi } from "@/api/auth";
import { StateMessage } from "@/components/ui/StateMessage";
import { useI18n } from "@/i18n";

type VerifyEmailState = "verifying" | "verified" | "error";

export function VerifyEmailStatus() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyEmailState>(token ? "verifying" : "error");

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    authApi
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          setState("verified");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "verifying") {
    return (
      <StateMessage tone="loading" title={t("auth.verifyEmailCheckingTitle")}>
        {t("auth.verifyEmailCheckingDescription")}
      </StateMessage>
    );
  }

  if (state === "error") {
    return (
      <StateMessage tone="error" title={t("auth.verifyEmailErrorTitle")}>
        {t("auth.verifyEmailErrorDescription")}
      </StateMessage>
    );
  }

  return (
    <StateMessage
      action={
        <Link className="text-link" href="/login">
          {t("auth.loginLink")}
        </Link>
      }
      tone="success"
      title={t("auth.verifyEmailSuccessTitle")}
    >
      {t("auth.verifyEmailSuccessDescription")}
    </StateMessage>
  );
}
