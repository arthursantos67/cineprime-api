"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import {
  getLoginConfirmationMessage,
  getLoginFormErrorMessage,
  getSafeRedirectFromSearch,
} from "./auth-form-utils";

export type LoginFormViewProps = {
  confirmationMessage: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LoginFormView({
  confirmationMessage,
  errorMessage,
  isSubmitting,
  onSubmit,
}: LoginFormViewProps) {
  const { t } = useI18n();
  const formErrorId = errorMessage ? "login-form-error" : undefined;

  return (
    <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
      {confirmationMessage ? (
        <p
          className="w-fit rounded-pill bg-[#e8f5ee] px-3 py-1.5 text-sm font-extrabold leading-none text-success"
          role="status"
        >
          {confirmationMessage}
        </p>
      ) : null}
      <form aria-describedby={formErrorId} className="grid gap-4" onSubmit={onSubmit}>
        <Input
          aria-describedby={formErrorId}
          aria-invalid={errorMessage ? "true" : undefined}
          autoComplete="email"
          disabled={isSubmitting}
          id="email"
          label={t("auth.email")}
          name="email"
          placeholder={t("auth.emailPlaceholder")}
          required
          type="email"
        />
        <PasswordInput
          aria-describedby={formErrorId}
          aria-invalid={errorMessage ? "true" : undefined}
          autoComplete="current-password"
          disabled={isSubmitting}
          id="password"
          label={t("auth.password")}
          name="password"
          placeholder={t("auth.passwordPlaceholder")}
          required
        />
        <div className="flex items-center gap-2">
          <input
            className="size-[18px] shrink-0 cursor-pointer accent-brand"
            disabled={isSubmitting}
            id="stayLoggedIn"
            name="stayLoggedIn"
            type="checkbox"
          />
          <label className="cursor-pointer text-sm font-normal text-text" htmlFor="stayLoggedIn">
            {t("auth.stayLoggedIn")}
          </label>
        </div>
        {errorMessage ? (
          <p className="m-0 text-sm font-bold text-error" id="login-form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          {isSubmitting ? t("auth.loginSubmitting") : t("auth.login")}
        </Button>
      </form>
    </div>
  );
}

export function LoginForm() {
  const { locale } = useI18n();
  const router = useRouter();
  const { loading, login } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(
    null
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const stayLoggedIn = formData.get("stayLoggedIn") === "on";

    try {
      await login({ email, password }, { stayLoggedIn });
      const search = typeof window === "undefined" ? "" : window.location.search;
      router.replace(getSafeRedirectFromSearch(search));
    } catch (error) {
      setErrorMessage(getLoginFormErrorMessage(error, locale));
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setConfirmationMessage(getLoginConfirmationMessage(window.location.search, locale));
    }
  }, [locale]);

  return (
    <LoginFormView
      confirmationMessage={confirmationMessage}
      errorMessage={errorMessage}
      isSubmitting={loading}
      onSubmit={handleSubmit}
    />
  );
}
