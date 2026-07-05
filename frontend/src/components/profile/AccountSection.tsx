"use client";

import { useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { authApi } from "@/api/auth";
import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";

export function AccountSection() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { locale, t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requiresTicketConfirmation, setRequiresTicketConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");

    setIsSubmitting(true);
    try {
      await authApi.deleteAccount({
        confirm: requiresTicketConfirmation,
        password,
      });
      signOut();
      router.replace("/");
    } catch (error) {
      if (error instanceof ApiError && error.code === "HAS_ACTIVE_TICKETS") {
        setRequiresTicketConfirmation(true);
        setErrorMessage(t("profile.deleteHasTickets"));
      } else if (error instanceof ApiError && error.code === "WRONG_PASSWORD") {
        setErrorMessage(t("profile.wrongPassword"));
      } else {
        setErrorMessage(getApiErrorUserMessage(error, locale));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-card border border-error/40 bg-[rgb(180_35_24/0.08)] p-6">
      <div className="grid gap-1">
        <h3 className="m-0 text-base font-extrabold text-white">
          {t("profile.deleteAccountTitle")}
        </h3>
        <p className="m-0 text-sm text-muted">{t("profile.deleteAccountDescription")}</p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <PasswordInput
          autoComplete="current-password"
          disabled={isSubmitting}
          id="profile-delete-password"
          label={t("profile.deletePasswordLabel")}
          name="password"
          required
        />
        {errorMessage ? (
          <p className="m-0 text-sm font-bold text-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <Button
          className="w-fit border-error text-error hover:bg-[rgb(180_35_24/0.16)]"
          disabled={isSubmitting}
          type="submit"
          variant="ghost"
        >
          {isSubmitting
            ? t("profile.deletingAccount")
            : requiresTicketConfirmation
              ? t("profile.confirmDeleteAccount")
              : t("profile.deleteAccount")}
        </Button>
      </form>
    </div>
  );
}
