"use client";

import { useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/i18n";
import {
  buildRegisteredLoginUrl,
  getRegistrationValidationState,
  type AuthFieldErrors,
} from "./auth-form-utils";

export type RegisterFormViewProps = {
  fieldErrors: AuthFieldErrors;
  formError: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RegisterFormView({
  fieldErrors,
  formError,
  isSubmitting,
  onSubmit,
}: RegisterFormViewProps) {
  const { t } = useI18n();
  const formErrorId = formError ? "register-form-error" : undefined;

  return (
    <div className="grid gap-4 rounded-card border border-white/10 bg-white/[0.03] p-6">
      <form aria-describedby={formErrorId} className="grid gap-4" onSubmit={onSubmit}>
        <Input
          autoComplete="username"
          disabled={isSubmitting}
          error={fieldErrors.username}
          id="username"
          label={t("auth.username")}
          name="username"
          placeholder={t("auth.usernamePlaceholder")}
          required
          type="text"
        />
        <Input
          autoComplete="email"
          disabled={isSubmitting}
          error={fieldErrors.email}
          id="email"
          label={t("auth.email")}
          name="email"
          placeholder={t("auth.emailPlaceholder")}
          required
          type="email"
        />
        <PasswordInput
          autoComplete="new-password"
          disabled={isSubmitting}
          error={fieldErrors.password}
          id="password"
          label={t("auth.password")}
          name="password"
          placeholder={t("auth.createPasswordPlaceholder")}
          required
        />
        {formError ? (
          <p className="m-0 text-sm font-bold text-error" id="register-form-error" role="alert">
            {formError}
          </p>
        ) : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          {isSubmitting ? t("auth.registerSubmitting") : t("auth.createAccount")}
        </Button>
      </form>
    </div>
  );
}

export function RegisterForm() {
  const { locale } = useI18n();
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      await authApi.register({ email, password, username });
      router.replace(buildRegisteredLoginUrl());
    } catch (error) {
      const validationState = getRegistrationValidationState(error, locale);
      setFieldErrors(validationState.fieldErrors);
      setFormError(validationState.formError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <RegisterFormView
      fieldErrors={fieldErrors}
      formError={formError}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
