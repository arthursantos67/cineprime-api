import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../../api/client";
import {
  buildPasswordResetLoginUrl,
  buildRegisteredLoginUrl,
  getLoginConfirmationMessage,
  getLoginFormErrorMessage,
  getRegistrationValidationState,
  getSafeRedirectFromSearch,
} from "./auth-form-utils";

test("successful registration redirects to login with a confirmation marker", () => {
  assert.equal(buildRegisteredLoginUrl(), "/login?cadastro=ok");
  assert.equal(
    getLoginConfirmationMessage("?cadastro=ok"),
    "Cadastro criado com sucesso. Enviamos um e-mail de confirmação — verifique sua caixa de entrada. Entre para continuar."
  );
});

test("successful password reset redirects to login with a confirmation marker", () => {
  assert.equal(buildPasswordResetLoginUrl(), "/login?senha-redefinida=ok");
  assert.equal(
    getLoginConfirmationMessage("?senha-redefinida=ok"),
    "Senha redefinida com sucesso. Entre com sua nova senha."
  );
});

test("registration validation errors are shown inline with pt-BR field messages", () => {
  const error = new ApiError("Validation failed.", 400, {
    code: "VALIDATION_FAILED",
    details: {
      email: ["Enter a valid email address."],
      password: ["This password is too common."],
      username: ["A user with that username already exists."],
    },
  });

  const validationState = getRegistrationValidationState(error);

  assert.deepEqual(validationState.fieldErrors, {
    email: "Informe um e-mail válido.",
    password: "Informe uma senha válida.",
    username: "Informe um nome de usuário válido.",
  });
  assert.equal(validationState.formError, null);
});

test("registration validation does not expose raw backend messages", () => {
  const error = new ApiError("Validation failed.", 400, {
    code: "VALIDATION_FAILED",
    details: {
      email: ["Raw backend detail."],
    },
  });

  const validationState = getRegistrationValidationState(error);

  assert.equal(validationState.fieldErrors.email, "Informe um e-mail válido.");
  assert.notEqual(validationState.fieldErrors.email, "Raw backend detail.");
});

test("invalid credentials use the friendly form-level login message", () => {
  const error = new ApiError("Invalid credentials.", 401, {
    code: "INVALID_CREDENTIALS",
    details: {},
  });

  assert.equal(getLoginFormErrorMessage(error), "E-mail ou senha incorretos.");
});

test("login redirect accepts safe internal paths and rejects unsafe external URLs", () => {
  assert.equal(
    getSafeRedirectFromSearch("?redirect=%2Fcheckout%3Freservation%3D123"),
    "/checkout?reservation=123"
  );
  assert.equal(
    getSafeRedirectFromSearch("?redirect=https%3A%2F%2Fevil.example%2Fcheckout"),
    "/"
  );
  assert.equal(getSafeRedirectFromSearch(""), "/");
});
