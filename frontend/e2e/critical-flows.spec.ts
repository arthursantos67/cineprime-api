import { expect, test, type Page } from "@playwright/test";

import { fixedNow, setupMockApi } from "./support/api-mocks";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: fixedNow });
});

test("registers, logs in, reserves a seat, and completes a mocked purchase", async ({
  page,
}) => {
  const api = await setupMockApi(page);

  await test.step("register and log in through the forms", async () => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();

    await page.getByLabel("Nome de usuário").fill("ana");
    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("Senha").fill("senha-super-segura");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(
      page.getByText("Cadastro criado com sucesso. Entre para continuar.")
    ).toBeVisible();

    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("Senha").fill("senha-super-segura");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");
  });

  await test.step("browse to a session and reserve a seat", async () => {
    await page
      .getByRole("link", { name: "Ver detalhes de A Jornada de Natal" })
      .first()
      .click();
    await expect(page).toHaveURL("/movies/movie-natal");
    await expect(
      page.getByRole("heading", { level: 1, name: "A Jornada de Natal" })
    ).toBeVisible();

    await page
      .getByRole("link", { name: /Selecionar sessão das 15:00, sala Sala 1/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Mapa de assentos" })
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: /Assento A1, fileira A, número 1, Disponível/,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: /Assento A1, fileira A, número 1, Selecionado/,
      })
    ).toBeVisible();

    await page.getByRole("link", { name: "Continuar" }).click();
  });

  await test.step("choose a ticket type and check out with fake PIX", async () => {
    await expect(
      page.getByRole("heading", { name: "Tipos de ingresso" })
    ).toBeVisible();

    await page.getByLabel(/Meia-entrada/).check();
    await page.getByRole("link", { name: "Continuar para pagamento" }).click();

    await expect(
      page.getByRole("heading", { name: "Finalizar compra" })
    ).toBeVisible();
    await expect(page.getByText("A Jornada de Natal").first()).toBeVisible();

    await page.getByLabel(/PIX/).check();
    await page.getByRole("button", { name: "Confirmar compra" }).click();

    await expect(
      page.getByRole("heading", { name: "Compra confirmada" })
    ).toBeVisible();
    await expect(page.getByText("CN-E2E-A1").first()).toBeVisible();
    expect(api.checkoutPayloads).toEqual([
      {
        payment_method: "pix",
        seats: [
          {
            session_seat_id: "session-seat-a1",
            ticket_type: "meia",
          },
        ],
      },
    ]);
  });
});

test("shows a conflict when another user already reserved the selected seat", async ({
  page,
}) => {
  await setupMockApi(page, { failNextReservation: true });
  await login(page, "/sessions/session-morning/seats");

  await page
    .getByRole("button", {
      name: /Assento A1, fileira A, número 1, Disponível/,
    })
    .click();

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Esse assento acabou de ser reservado por outra pessoa. Escolha outro lugar.",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Assento A1, fileira A, número 1, Disponível/,
    })
  ).toBeVisible();
});

test("redirects unauthenticated visitors away from protected routes", async ({
  page,
}) => {
  await setupMockApi(page);

  await page.goto("/checkout");

  await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("expires a temporary reservation and resets the seat selection state", async ({
  page,
}) => {
  await setupMockApi(page, {
    reservationExpiresAt: new Date(fixedNow.getTime() + 5 * 60_000).toISOString(),
  });
  await login(page, "/sessions/session-morning/seats");

  await page
    .getByRole("button", {
      name: /Assento A1, fileira A, número 1, Disponível/,
    })
    .click();

  await expect(page.getByRole("timer")).toContainText("Expira em");

  await page.clock.fastForward(5 * 60_000 + 1_000);

  await expect(page.getByRole("timer")).toBeHidden();
  await expect(
    page.getByText(
      "Sua reserva temporária expirou. Os assentos foram liberados; escolha seus lugares novamente para continuar a compra."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Assento A1, fileira A, número 1, Disponível/,
    })
  ).toBeVisible();
  await expect(page.getByText("Nenhum assento selecionado")).toBeVisible();
});

async function login(page: Page, redirectPath = "/") {
  const loginPath =
    redirectPath === "/"
      ? "/login"
      : `/login?redirect=${encodeURIComponent(redirectPath)}`;

  await page.goto(loginPath);
  await page.getByLabel("E-mail").fill("ana@example.com");
  await page.getByLabel("Senha").fill("senha-super-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(redirectPath);
}
