import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LoginFormView } from "./LoginForm";
import { RegisterFormView } from "./RegisterForm";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const noop = () => undefined;

test("login form view renders accessible email and password fields with labels", () => {
  const html = renderToStaticMarkup(
    createElement(LoginFormView, {
      confirmationMessage: null,
      errorMessage: null,
      isSubmitting: false,
      onSubmit: noop,
    })
  );

  assert.match(html, /<label[^>]*for="email"/);
  assert.match(html, /E-mail/);
  assert.match(html, /<input[^>]*id="email"/);
  assert.match(html, /type="email"/);
  assert.match(html, /<label[^>]*for="password"/);
  assert.match(html, /Senha/);
  assert.match(html, /<input[^>]*id="password"/);
  assert.match(html, /type="password"/);
  assert.match(html, /Entrar/);
  assert.match(html, /Continuar conectado/);
  assert.match(html, /<input[^>]*id="stayLoggedIn"/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.doesNotMatch(html, /aria-invalid/);
});

test("login form view renders error message with accessible alert markup when login fails", () => {
  const html = renderToStaticMarkup(
    createElement(LoginFormView, {
      confirmationMessage: null,
      errorMessage: "E-mail ou senha incorretos.",
      isSubmitting: false,
      onSubmit: noop,
    })
  );

  assert.match(html, /E-mail ou senha incorretos\./);
  assert.match(html, /role="alert"/);
  assert.match(html, /id="login-form-error"/);
  assert.match(html, /aria-describedby="login-form-error"/);
  assert.match(html, /aria-invalid="true"/);
});

test("login form view renders confirmation message after successful registration", () => {
  const html = renderToStaticMarkup(
    createElement(LoginFormView, {
      confirmationMessage: "Cadastro criado com sucesso. Entre para continuar.",
      errorMessage: null,
      isSubmitting: false,
      onSubmit: noop,
    })
  );

  assert.match(html, /Cadastro criado com sucesso\. Entre para continuar\./);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("login form view disables inputs and submit button while the request is in progress", () => {
  const html = renderToStaticMarkup(
    createElement(LoginFormView, {
      confirmationMessage: null,
      errorMessage: null,
      isSubmitting: true,
      onSubmit: noop,
    })
  );

  assert.match(html, /Entrando\.\.\./);
  assert.match(html, /disabled=""/);
});

test("register form view renders accessible username, email, and password fields", () => {
  const html = renderToStaticMarkup(
    createElement(RegisterFormView, {
      fieldErrors: {},
      formError: null,
      isSubmitting: false,
      onSubmit: noop,
    })
  );

  assert.match(html, /<label[^>]*for="username"/);
  assert.match(html, /Nome de usuário/);
  assert.match(html, /<input[^>]*id="username"/);
  assert.match(html, /<label[^>]*for="email"/);
  assert.match(html, /E-mail/);
  assert.match(html, /<input[^>]*id="email"/);
  assert.match(html, /<label[^>]*for="password"/);
  assert.match(html, /Senha/);
  assert.match(html, /<input[^>]*id="password"/);
  assert.match(html, /Criar conta/);
  assert.doesNotMatch(html, /aria-invalid/);
  assert.doesNotMatch(html, /form-error/);
});

test("register form view renders field-level errors linked by id and aria attributes", () => {
  const html = renderToStaticMarkup(
    createElement(RegisterFormView, {
      fieldErrors: {
        email: "Informe um e-mail válido.",
        username: "Informe um nome de usuário válido.",
      },
      formError: null,
      isSubmitting: false,
      onSubmit: noop,
    })
  );

  assert.match(html, /Informe um nome de usuário válido\./);
  assert.match(html, /id="username-error"/);
  assert.match(html, /aria-describedby="username-error"/);
  assert.match(html, /aria-invalid="true"[^>]*id="username"/);

  assert.match(html, /Informe um e-mail válido\./);
  assert.match(html, /id="email-error"/);
  assert.match(html, /aria-describedby="email-error"/);
  assert.match(html, /aria-invalid="true"[^>]*id="email"/);

  assert.doesNotMatch(html, /id="password-error"/);
});

test("register form view renders a form-level error when no field errors are present", () => {
  const html = renderToStaticMarkup(
    createElement(RegisterFormView, {
      fieldErrors: {},
      formError: "Confira os dados informados e tente novamente.",
      isSubmitting: false,
      onSubmit: noop,
    })
  );

  assert.match(html, /Confira os dados informados e tente novamente\./);
  assert.match(html, /role="alert"/);
  assert.match(html, /id="register-form-error"/);
  assert.match(html, /aria-describedby="register-form-error"/);
  assert.doesNotMatch(html, /id="username-error"/);
  assert.doesNotMatch(html, /id="email-error"/);
  assert.doesNotMatch(html, /id="password-error"/);
});

test("register form view disables all inputs and the submit button while creating the account", () => {
  const html = renderToStaticMarkup(
    createElement(RegisterFormView, {
      fieldErrors: {},
      formError: null,
      isSubmitting: true,
      onSubmit: noop,
    })
  );

  assert.match(html, /Criando conta\.\.\./);
  assert.match(html, /disabled=""/);
});
