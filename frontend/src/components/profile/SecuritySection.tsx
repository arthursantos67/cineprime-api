"use client";

import { useState, type FormEvent } from "react";

import { authApi } from "@/api/auth";
import { getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormFeedback, type FeedbackState } from "@/components/ui/FormFeedback";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";

function VerificationStatusCard() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<"error" | "idle" | "sending" | "sent">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  async function handleResend() {
    setStatus("sending");
    setErrorMessage(null);
    try {
      await authApi.resendVerificationEmail();
      setStatus("sent");
    } catch (error) {
      setErrorMessage(getApiErrorUserMessage(error, locale));
      setStatus("error");
    }
  }

  return (
    <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="m-0 text-base font-extrabold text-white">
          {t("profile.verificationTitle")}
        </h3>
        {user.is_verified ? (
          <Badge size="sm" tone="success">
            {t("profile.verified")}
          </Badge>
        ) : (
          <Badge size="sm" tone="danger">
            {t("profile.notVerified")}
          </Badge>
        )}
      </div>

      {!user.is_verified ? (
        <div className="grid gap-3">
          <p className="m-0 text-sm text-muted">{t("auth.emailNotVerified")}</p>
          {status === "sent" ? (
            <p className="m-0 text-sm font-bold text-success" role="status">
              {t("auth.emailVerificationResent")}
            </p>
          ) : (
            <Button
              className="w-fit"
              disabled={status === "sending"}
              onClick={handleResend}
              variant="ghost"
            >
              {t("auth.resendVerification")}
            </Button>
          )}
          {status === "error" && errorMessage ? (
            <p className="m-0 text-sm font-bold text-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SecuritySection() {
  const { adoptTokens } = useAuth();
  const { locale, t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");

    setIsSubmitting(true);
    try {
      const response = await authApi.changePassword({ currentPassword, newPassword });
      // The password change invalidated every previously issued token; swap
      // in the fresh pair so this session stays signed in.
      adoptTokens({ access: response.access, refresh: response.refresh });
      setFeedback({ kind: "success", message: t("profile.passwordChanged") });
      form.reset();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: getApiErrorUserMessage(error, locale),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <VerificationStatusCard />

      <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <div className="grid gap-1">
          <h3 className="m-0 text-base font-extrabold text-white">
            {t("profile.changePasswordTitle")}
          </h3>
          <p className="m-0 text-sm text-muted">
            {t("profile.changePasswordDescription")}
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <PasswordInput
            autoComplete="current-password"
            disabled={isSubmitting}
            id="profile-current-password"
            label={t("profile.currentPasswordLabel")}
            name="currentPassword"
            required
          />
          <PasswordInput
            autoComplete="new-password"
            disabled={isSubmitting}
            id="profile-new-password"
            label={t("profile.newPasswordLabel")}
            name="newPassword"
            required
          />
          <FormFeedback feedback={feedback} />
          <Button className="w-fit" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("profile.changingPassword") : t("profile.changePassword")}
          </Button>
        </form>
      </div>
    </div>
  );
}
