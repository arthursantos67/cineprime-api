import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PAYMENT_METHODS, PaymentMethodSelector } from "./CheckoutReview";
import { paymentMethodLabels } from "./order-summary";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const noop = () => undefined;

test("payment method selector covers all supported payment methods", () => {
  assert.deepEqual(PAYMENT_METHODS, ["cartao_credito", "pix"]);
  assert.equal(paymentMethodLabels.cartao_credito, "Cartão de crédito");
  assert.equal(paymentMethodLabels.pix, "PIX");
});

test("payment method selector renders cartao_credito and pix options with pt-BR labels", () => {
  const html = renderToStaticMarkup(
    createElement(PaymentMethodSelector, {
      onChange: noop,
      selectedMethod: null,
    })
  );

  assert.match(html, /Cartão de crédito/);
  assert.match(html, /Finalize com cartão de crédito\./);
  assert.match(html, /PIX/);
  assert.match(html, /Finalize com pagamento via PIX\./);
  assert.match(html, /name="payment_method"/);
  assert.match(html, /type="radio"/);
  assert.match(html, /value="cartao_credito"/);
  assert.match(html, /value="pix"/);
});

test("payment method selector marks the selected method as checked", () => {
  const pixHtml = renderToStaticMarkup(
    createElement(PaymentMethodSelector, {
      onChange: noop,
      selectedMethod: "pix",
    })
  );

  assert.match(pixHtml, /checked=""[^/]*value="pix"|value="pix"[^/]*checked=""/);
  assert.doesNotMatch(pixHtml, /checked=""[^/]*value="cartao_credito"|value="cartao_credito"[^/]*checked=""/);

  const creditHtml = renderToStaticMarkup(
    createElement(PaymentMethodSelector, {
      onChange: noop,
      selectedMethod: "cartao_credito",
    })
  );

  assert.match(creditHtml, /checked=""[^/]*value="cartao_credito"|value="cartao_credito"[^/]*checked=""/);
  assert.doesNotMatch(creditHtml, /checked=""[^/]*value="pix"|value="pix"[^/]*checked=""/);
});

test("payment method selector does not mark any option as checked when no method is selected", () => {
  const html = renderToStaticMarkup(
    createElement(PaymentMethodSelector, {
      onChange: noop,
      selectedMethod: null,
    })
  );

  assert.doesNotMatch(html, /checked=""/);
});

test("payment method selector disables all radio inputs while the checkout is submitting", () => {
  const html = renderToStaticMarkup(
    createElement(PaymentMethodSelector, {
      disabled: true,
      onChange: noop,
      selectedMethod: "pix",
    })
  );

  const disabledCount = (html.match(/disabled=""/g) ?? []).length;
  assert.equal(disabledCount, PAYMENT_METHODS.length);
});
