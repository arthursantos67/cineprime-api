"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { authApi } from "@/api/auth";
import { getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormFeedback, type FeedbackState } from "@/components/ui/FormFeedback";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";

import { DeleteAccountDialog } from "./DeleteAccountDialog";

type ProfileDialog = "delete" | "email" | "username" | null;

function InfoRow({
  actionLabel,
  label,
  onAction,
  value,
}: {
  actionLabel: string;
  label: string;
  onAction: () => void;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <span className="break-all text-base font-extrabold text-white">{value}</span>
      <button
        className="w-fit text-sm font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
        onClick={onAction}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function ProfileDetailsSection() {
  const { reloadCurrentUser, user } = useAuth();
  const { formatDate, locale, t } = useI18n();
  const [openDialog, setOpenDialog] = useState<ProfileDialog>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState<FeedbackState>(null);
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState>(null);
  const [cardFeedback, setCardFeedback] = useState<FeedbackState>(null);

  if (!user) {
    return null;
  }

  function closeDialog() {
    setOpenDialog(null);
    setUsernameFeedback(null);
    setEmailFeedback(null);
  }

  function openProfileDialog(dialog: Exclude<ProfileDialog, null>) {
    setCardFeedback(null);
    setUsernameFeedback(null);
    setEmailFeedback(null);
    setOpenDialog(dialog);
  }

  async function handleUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUsernameFeedback(null);

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim();

    if (!username) {
      setUsernameFeedback({ kind: "error", message: t("profile.usernameRequired") });
      return;
    }

    setIsSavingUsername(true);
    try {
      await authApi.updateProfile({ username });
      await reloadCurrentUser();
      setOpenDialog(null);
      setCardFeedback({ kind: "success", message: t("profile.usernameSaved") });
    } catch (error) {
      setUsernameFeedback({
        kind: "error",
        message: getApiErrorUserMessage(error, locale),
      });
    } finally {
      setIsSavingUsername(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailFeedback(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const currentPassword = String(formData.get("currentPassword") ?? "");

    if (!email || !currentPassword) {
      return;
    }

    setIsRequestingEmailChange(true);
    try {
      const response = await authApi.updateProfile({ currentPassword, email });
      if (response.email_change_requested) {
        setOpenDialog(null);
        setCardFeedback({
          kind: "success",
          message: t("profile.emailChangeRequested"),
        });
      } else {
        setEmailFeedback({ kind: "error", message: t("profile.emailUnchanged") });
      }
    } catch (error) {
      setEmailFeedback({
        kind: "error",
        message: getApiErrorUserMessage(error, locale),
      });
    } finally {
      setIsRequestingEmailChange(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <div className="grid gap-1">
          <h3 className="m-0 text-base font-extrabold text-white">
            {t("profile.detailsTitle")}
          </h3>
          {user.created_at ? (
            <p className="m-0 text-sm text-muted">
              {t("profile.memberSince", {
                date: formatDate(user.created_at, {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
              })}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4">
          <InfoRow
            actionLabel={t("profile.changeUsernameLink")}
            label={t("profile.usernameLabel")}
            onAction={() => openProfileDialog("username")}
            value={user.username}
          />
          <InfoRow
            actionLabel={t("profile.changeEmailLink")}
            label={t("profile.emailTitle")}
            onAction={() => openProfileDialog("email")}
            value={user.email}
          />
        </div>

        <FormFeedback feedback={cardFeedback} />
      </div>

      <div className="grid gap-2 rounded-card border border-error/40 bg-[rgb(180_35_24/0.08)] p-6">
        <h3 className="m-0 text-base font-extrabold text-white">
          {t("profile.deleteAccountTitle")}
        </h3>
        <p className="m-0 text-sm text-muted">{t("profile.deleteAccountDescription")}</p>
        <button
          className="w-fit text-sm font-bold text-error underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => openProfileDialog("delete")}
          type="button"
        >
          {t("profile.deleteAccount")}
        </button>
      </div>

      <Dialog
        closeLabel={t("common.close")}
        isOpen={openDialog === "username"}
        onClose={closeDialog}
        title={t("profile.changeUsernameTitle")}
      >
        <form className="grid gap-4" onSubmit={handleUsernameSubmit}>
          <Input
            autoComplete="username"
            defaultValue={user.username}
            disabled={isSavingUsername}
            id="profile-username"
            label={t("profile.usernameLabel")}
            name="username"
            required
          />
          <FormFeedback feedback={usernameFeedback} />
          <Button className="w-fit" disabled={isSavingUsername} type="submit">
            {isSavingUsername ? t("profile.saving") : t("profile.saveUsername")}
          </Button>
        </form>
      </Dialog>

      <Dialog
        closeLabel={t("common.close")}
        description={t("profile.emailChangeDescription")}
        isOpen={openDialog === "email"}
        onClose={closeDialog}
        title={t("profile.changeEmailTitle")}
      >
        <form className="grid gap-4" onSubmit={handleEmailSubmit}>
          <Input
            autoComplete="email"
            disabled={isRequestingEmailChange}
            id="profile-new-email"
            label={t("profile.newEmailLabel")}
            name="email"
            placeholder={t("auth.emailPlaceholder")}
            required
            type="email"
          />
          <PasswordInput
            autoComplete="current-password"
            disabled={isRequestingEmailChange}
            id="profile-email-current-password"
            label={t("profile.currentPasswordLabel")}
            name="currentPassword"
            required
          />
          <FormFeedback feedback={emailFeedback} />
          <Button className="w-fit" disabled={isRequestingEmailChange} type="submit">
            {isRequestingEmailChange
              ? t("profile.requestingEmailChange")
              : t("profile.requestEmailChange")}
          </Button>
        </form>
      </Dialog>

      <DeleteAccountDialog isOpen={openDialog === "delete"} onClose={closeDialog} />
    </div>
  );
}
