"use client";

import { useState, type FormEvent } from "react";

import { authApi } from "@/api/auth";
import { getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { FormFeedback, type FeedbackState } from "@/components/ui/FormFeedback";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";

export function ProfileDetailsSection() {
  const { reloadCurrentUser, user } = useAuth();
  const { formatDate, locale, t } = useI18n();
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState<FeedbackState>(null);
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState>(null);

  if (!user) {
    return null;
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
      setUsernameFeedback({ kind: "success", message: t("profile.usernameSaved") });
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

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const currentPassword = String(formData.get("currentPassword") ?? "");

    if (!email || !currentPassword) {
      return;
    }

    setIsRequestingEmailChange(true);
    try {
      const response = await authApi.updateProfile({ currentPassword, email });
      if (response.email_change_requested) {
        setEmailFeedback({
          kind: "success",
          message: t("profile.emailChangeRequested"),
        });
        form.reset();
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
      <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
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
      </div>

      <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
        <div className="grid gap-1">
          <h3 className="m-0 text-base font-extrabold text-white">
            {t("profile.emailTitle")}
          </h3>
          <p className="m-0 text-sm text-muted">
            {t("profile.currentEmail", { email: user.email })}
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleEmailSubmit}>
          <Input
            autoComplete="email"
            description={t("profile.emailChangeDescription")}
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
          <Button
            className="w-fit"
            disabled={isRequestingEmailChange}
            type="submit"
            variant="ghost"
          >
            {isRequestingEmailChange
              ? t("profile.requestingEmailChange")
              : t("profile.requestEmailChange")}
          </Button>
        </form>
      </div>
    </div>
  );
}
