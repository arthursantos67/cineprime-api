"use client";

import { useState, type FormEvent } from "react";

import { authApi } from "@/api/auth";
import { getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormFeedback, type FeedbackState } from "@/components/ui/FormFeedback";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";

function VerificationRow() {
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
    <div className="grid gap-1">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
        {t("profile.verificationTitle")}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {user.is_verified ? (
          <Badge size="sm" tone="success">
            {t("profile.verified")}
          </Badge>
        ) : (
          <Badge size="sm" tone="danger">
            {t("profile.notVerified")}
          </Badge>
        )}
      </span>
      {!user.is_verified ? (
        status === "sent" ? (
          <p className="m-0 text-sm font-bold text-success" role="status">
            {t("auth.emailVerificationResent")}
          </p>
        ) : (
          <button
            className="w-fit text-sm font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-[0.68]"
            disabled={status === "sending"}
            onClick={handleResend}
            type="button"
          >
            {t("auth.resendVerification")}
          </button>
        )
      ) : null}
      {status === "error" && errorMessage ? (
        <p className="m-0 text-sm font-bold text-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export function SecuritySection() {
  const { adoptTokens } = useAuth();
  const { locale, t } = useI18n();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogFeedback, setDialogFeedback] = useState<FeedbackState>(null);
  const [cardFeedback, setCardFeedback] = useState<FeedbackState>(null);

  function openDialog() {
    setCardFeedback(null);
    setDialogFeedback(null);
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setDialogFeedback(null);
    setIsDialogOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogFeedback(null);

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");

    setIsSubmitting(true);
    try {
      const response = await authApi.changePassword({ currentPassword, newPassword });
      // The password change invalidated every previously issued token; swap
      // in the fresh pair so this session stays signed in.
      adoptTokens({ access: response.access, refresh: response.refresh });
      setIsDialogOpen(false);
      setCardFeedback({ kind: "success", message: t("profile.passwordChanged") });
    } catch (error) {
      setDialogFeedback({
        kind: "error",
        message: getApiErrorUserMessage(error, locale),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <div className="grid gap-1">
          <h3 className="m-0 text-base font-extrabold text-white">
            {t("profile.securityTitle")}
          </h3>
          <p className="m-0 text-sm text-muted">{t("profile.securityDescription")}</p>
        </div>

        <div className="grid gap-4">
          <VerificationRow />

          <div className="grid gap-1 border-t border-white/[0.06] pt-4">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              {t("profile.passwordLabel")}
            </span>
            <span
              aria-hidden="true"
              className="text-base font-extrabold tracking-[0.2em] text-white"
            >
              ••••••••••
            </span>
            <button
              className="w-fit text-sm font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              onClick={openDialog}
              type="button"
            >
              {t("profile.changePassword")}
            </button>
          </div>
        </div>

        <FormFeedback feedback={cardFeedback} />
      </div>

      <Dialog
        closeLabel={t("common.close")}
        description={t("profile.changePasswordDescription")}
        isOpen={isDialogOpen}
        onClose={closeDialog}
        title={t("profile.changePasswordTitle")}
      >
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
          <FormFeedback feedback={dialogFeedback} />
          <Button className="w-fit" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("profile.changingPassword") : t("profile.changePassword")}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
