"use client";

import { useState, type FormEvent } from "react";

import { authApi } from "@/api/auth";
import { ApiError, getApiErrorUserMessage, isNetworkError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/i18n";

export type ForgotPasswordFormViewProps = {
  errorMessage: string | null;
  isSubmitted: boolean;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ForgotPasswordFormView({
  errorMessage,
  isSubmitted,
  isSubmitting,
  onSubmit,
}: ForgotPasswordFormViewProps) {
  const { t } = useI18n();
  const formErrorId = errorMessage ? "forgot-password-form-error" : undefined;

  if (isSubmitted) {
    return (
      <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <p
          className="w-fit rounded-pill bg-[#e8f5ee] px-3 py-1.5 text-sm font-extrabold leading-none text-success"
          role="status"
        >
          {t("auth.forgotPasswordSuccess")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
      <form aria-describedby={formErrorId} className="grid gap-4" onSubmit={onSubmit}>
        <Input
          autoComplete="email"
          description={t("auth.forgotPasswordDescription")}
          disabled={isSubmitting}
          id="email"
          label={t("auth.email")}
          name="email"
          placeholder={t("auth.emailPlaceholder")}
          required
          type="email"
        />
        {errorMessage ? (
          <p className="m-0 text-sm font-bold text-error" id="forgot-password-form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          {isSubmitting ? t("auth.forgotPasswordSubmitting") : t("auth.forgotPasswordSubmit")}
        </Button>
      </form>
    </div>
  );
}

function isTransportOrServerError(error: unknown) {
  return (
    isNetworkError(error) ||
    (error instanceof ApiError && (error.status >= 500 || error.status === 429))
  );
}

export function ForgotPasswordForm() {
  const { locale } = useI18n();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");

    try {
      await authApi.requestPasswordReset({ email });
      setIsSubmitted(true);
    } catch (error) {
      if (isTransportOrServerError(error)) {
        // Surface transport/server failures (network, 5xx, throttling) so the
        // user knows to retry — but keep the generic success message for any
        // other response, to avoid leaking account existence through the UI.
        setErrorMessage(getApiErrorUserMessage(error, locale));
      } else {
        setIsSubmitted(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ForgotPasswordFormView
      errorMessage={errorMessage}
      isSubmitted={isSubmitted}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
