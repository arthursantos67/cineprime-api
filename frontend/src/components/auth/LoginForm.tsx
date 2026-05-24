"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import {
  getLoginConfirmationMessage,
  getLoginFormErrorMessage,
  getSafeRedirectFromSearch,
} from "./auth-form-utils";

export function LoginForm() {
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

    try {
      await login({ email, password });
      const search = typeof window === "undefined" ? "" : window.location.search;
      router.replace(getSafeRedirectFromSearch(search));
    } catch (error) {
      setErrorMessage(getLoginFormErrorMessage(error));
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setConfirmationMessage(getLoginConfirmationMessage(window.location.search));
    }
  }, []);

  const isSubmitting = loading;
  const formErrorId = errorMessage ? "login-form-error" : undefined;

  return (
    <div className="panel">
      {confirmationMessage ? (
        <p className="inline-status inline-status-success" role="status">
          {confirmationMessage}
        </p>
      ) : null}
      <form
        aria-describedby={formErrorId}
        className="form-grid"
        onSubmit={handleSubmit}
      >
        <div className="form-field">
          <label htmlFor="email">E-mail</label>
          <input
            aria-describedby={formErrorId}
            aria-invalid={errorMessage ? "true" : undefined}
            autoComplete="email"
            disabled={isSubmitting}
            id="email"
            name="email"
            placeholder="voce@email.com"
            required
            type="email"
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">Senha</label>
          <input
            aria-describedby={formErrorId}
            aria-invalid={errorMessage ? "true" : undefined}
            autoComplete="current-password"
            disabled={isSubmitting}
            id="password"
            name="password"
            placeholder="Sua senha"
            required
            type="password"
          />
        </div>
        {errorMessage ? (
          <p className="form-error" id="login-form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
