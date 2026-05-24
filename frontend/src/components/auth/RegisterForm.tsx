"use client";

import { useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { authApi } from "@/api/auth";
import {
  buildRegisteredLoginUrl,
  getRegistrationValidationState,
  type AuthFieldErrors,
} from "./auth-form-utils";

export function RegisterForm() {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formErrorId = formError ? "register-form-error" : undefined;

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
      const validationState = getRegistrationValidationState(error);
      setFieldErrors(validationState.fieldErrors);
      setFormError(validationState.formError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <form
        aria-describedby={formErrorId}
        className="form-grid"
        onSubmit={handleSubmit}
      >
        <div className="form-field">
          <label htmlFor="username">Nome de usuário</label>
          <input
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
            aria-invalid={fieldErrors.username ? "true" : undefined}
            autoComplete="username"
            disabled={isSubmitting}
            id="username"
            name="username"
            placeholder="seu_nome"
            required
            type="text"
          />
          {fieldErrors.username ? (
            <p className="form-error" id="username-error">
              {fieldErrors.username}
            </p>
          ) : null}
        </div>
        <div className="form-field">
          <label htmlFor="email">E-mail</label>
          <input
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            aria-invalid={fieldErrors.email ? "true" : undefined}
            autoComplete="email"
            disabled={isSubmitting}
            id="email"
            name="email"
            placeholder="voce@email.com"
            required
            type="email"
          />
          {fieldErrors.email ? (
            <p className="form-error" id="email-error">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>
        <div className="form-field">
          <label htmlFor="password">Senha</label>
          <input
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            aria-invalid={fieldErrors.password ? "true" : undefined}
            autoComplete="new-password"
            disabled={isSubmitting}
            id="password"
            name="password"
            placeholder="Crie uma senha"
            required
            type="password"
          />
          {fieldErrors.password ? (
            <p className="form-error" id="password-error">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>
        {formError ? (
          <p className="form-error" id="register-form-error" role="alert">
            {formError}
          </p>
        ) : null}
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Criando conta..." : "Criar conta"}
        </button>
      </form>
    </div>
  );
}
