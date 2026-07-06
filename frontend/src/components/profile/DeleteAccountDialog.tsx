"use client";

import { useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { authApi } from "@/api/auth";
import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";

type DeleteAccountDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DeleteAccountDialog({ isOpen, onClose }: DeleteAccountDialogProps) {
  const router = useRouter();
  const { signOut } = useAuth();
  const { locale, t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requiresTicketConfirmation, setRequiresTicketConfirmation] = useState(false);

  function handleClose() {
    setErrorMessage(null);
    setRequiresTicketConfirmation(false);
    onClose();
  }

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
    <Dialog
      closeLabel={t("common.close")}
      description={t("profile.deleteAccountDescription")}
      isOpen={isOpen}
      onClose={handleClose}
      title={t("profile.deleteAccountTitle")}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <PasswordInput
          autoComplete="current-password"
          disabled={isSubmitting}
          id="profile-delete-password"
          label={t("profile.deletePasswordLabel")}
          name="password"
          required
        />
        <FormFeedback
          feedback={errorMessage ? { kind: "error", message: errorMessage } : null}
        />
        <Button
          className="w-fit"
          disabled={isSubmitting}
          type="submit"
          variant="danger"
        >
          {isSubmitting
            ? t("profile.deletingAccount")
            : requiresTicketConfirmation
              ? t("profile.confirmDeleteAccount")
              : t("profile.deleteAccount")}
        </Button>
      </form>
    </Dialog>
  );
}
