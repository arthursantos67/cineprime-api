import {
  ApiError,
  getApiErrorUserMessage,
  sanitizeRedirectPath,
} from "../../api/client";
import { DEFAULT_LOCALE, type Locale, resolveLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";

export type AuthFieldName = "email" | "password" | "username";

export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

export type RegistrationValidationState = {
  fieldErrors: AuthFieldErrors;
  formError: string | null;
};

export const REGISTRATION_SUCCESS_PARAM = "cadastro";
export const PASSWORD_RESET_SUCCESS_PARAM = "senha-redefinida";

export function getSafeRedirectFromSearch(search: string) {
  const redirect = new URLSearchParams(search).get("redirect");
  return redirect ? sanitizeRedirectPath(redirect) : "/";
}

export function buildRegisteredLoginUrl() {
  return `/login?${REGISTRATION_SUCCESS_PARAM}=ok`;
}

export function buildPasswordResetLoginUrl() {
  return `/login?${PASSWORD_RESET_SUCCESS_PARAM}=ok`;
}

export function getLoginConfirmationMessage(
  search: string,
  locale: Locale | string = DEFAULT_LOCALE
) {
  const params = new URLSearchParams(search);

  if (params.get(REGISTRATION_SUCCESS_PARAM) === "ok") {
    return t(locale, "auth.registrationSuccess");
  }

  if (params.get(PASSWORD_RESET_SUCCESS_PARAM) === "ok") {
    return t(locale, "auth.resetPasswordSuccess");
  }

  return null;
}

export function getLoginFormErrorMessage(
  error: unknown,
  locale: Locale | string = DEFAULT_LOCALE
) {
  return getApiErrorUserMessage(error, locale);
}

export function getRegistrationValidationState(
  error: unknown,
  locale: Locale | string = DEFAULT_LOCALE
): RegistrationValidationState {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") {
    return {
      fieldErrors: {},
      formError: getApiErrorUserMessage(error, locale),
    };
  }

  const fieldErrors = mapValidationFieldErrors(error.details, locale);

  return {
    fieldErrors,
    formError:
      Object.keys(fieldErrors).length > 0
        ? null
        : t(locale, "auth.validationFallback"),
  };
}

function mapValidationFieldErrors(details: unknown, locale: Locale | string) {
  const fieldErrors: AuthFieldErrors = {};

  if (!isRecord(details)) {
    return fieldErrors;
  }

  for (const field of ["email", "password", "username"] as AuthFieldName[]) {
    if (Object.hasOwn(details, field)) {
      fieldErrors[field] = t(locale, `auth.fieldError.${field}`);
    }
  }

  return fieldErrors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function t(locale: Locale | string, key: string) {
  const resolvedLocale = resolveLocale(locale);
  return messages[resolvedLocale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
}
