"use client";

import { useState, type FormEvent } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";
import { getApiErrorUserMessage } from "@/api/client";
import { buildPasswordResetLoginUrl } from "./auth-form-utils";

export type ResetPasswordFormViewProps = {
  errorMessage: string | null;
  isMissingToken: boolean;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ResetPasswordFormView({
  errorMessage,
  isMissingToken,
  isSubmitting,
  onSubmit,
}: ResetPasswordFormViewProps) {
  const { t } = useI18n();
  const formErrorId = errorMessage ? "reset-password-form-error" : undefined;

  if (isMissingToken) {
    return (
      <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <p className="m-0 text-sm font-bold text-error" role="alert">
          {t("auth.resetPasswordInvalidLink")}
        </p>
        <Link className="text-link" href="/forgot-password">
          {t("auth.forgotPasswordLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
      <form aria-describedby={formErrorId} className="grid gap-4" onSubmit={onSubmit}>
        <PasswordInput
          aria-describedby={formErrorId}
          aria-invalid={errorMessage ? "true" : undefined}
          autoComplete="new-password"
          disabled={isSubmitting}
          id="newPassword"
          label={t("auth.resetPasswordNewPassword")}
          name="newPassword"
          placeholder={t("auth.createPasswordPlaceholder")}
          required
        />
        {errorMessage ? (
          <p className="m-0 text-sm font-bold text-error" id="reset-password-form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          {isSubmitting ? t("auth.resetPasswordSubmitting") : t("auth.resetPasswordSubmit")}
        </Button>
      </form>
    </div>
  );
}

export function ResetPasswordForm() {
  const { locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!uid || !token) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("newPassword") ?? "");

    try {
      await authApi.confirmPasswordReset({ newPassword, token, uid });
      router.replace(buildPasswordResetLoginUrl());
    } catch (error) {
      setErrorMessage(getApiErrorUserMessage(error, locale));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ResetPasswordFormView
      errorMessage={errorMessage}
      isMissingToken={!uid || !token}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
