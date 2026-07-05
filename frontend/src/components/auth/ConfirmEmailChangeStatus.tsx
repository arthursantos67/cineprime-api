"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { authApi } from "@/api/auth";
import { StateMessage } from "@/components/ui/StateMessage";
import { useI18n } from "@/i18n";

type ConfirmEmailChangeState = "confirming" | "confirmed" | "error";

export function ConfirmEmailChangeStatus() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<ConfirmEmailChangeState>(
    token ? "confirming" : "error"
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    authApi
      .confirmEmailChange(token)
      .then(() => {
        if (!cancelled) {
          setState("confirmed");
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

  if (state === "confirming") {
    return (
      <StateMessage tone="loading" title={t("profile.emailChangeCheckingTitle")}>
        {t("profile.emailChangeCheckingDescription")}
      </StateMessage>
    );
  }

  if (state === "error") {
    return (
      <StateMessage tone="error" title={t("profile.emailChangeErrorTitle")}>
        {t("profile.emailChangeErrorDescription")}
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
      title={t("profile.emailChangeSuccessTitle")}
    >
      {t("profile.emailChangeSuccessDescription")}
    </StateMessage>
  );
}
