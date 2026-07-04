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
    await page.getByLabel("Senha", { exact: true }).fill("senha-super-segura");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(
      page.getByText("Cadastro criado com sucesso. Entre para continuar.")
    ).toBeVisible();

    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("Senha", { exact: true }).fill("senha-super-segura");
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

test("tabbed catalog switches to Pré-venda panel on click", async ({ page }) => {
  await setupMockApi(page);
  await page.goto("/");

  const catalogSection = page.getByRole("region", { name: "Programação" });
  const emCartazTab = catalogSection.getByRole("tab", { name: "Em cartaz" });
  const preVendaTab = catalogSection.getByRole("tab", { name: "Pré-venda" });

  await expect(emCartazTab).toHaveAttribute("aria-selected", "true");
  await expect(preVendaTab).toHaveAttribute("aria-selected", "false");

  const nowShowingPanel = catalogSection.getByRole("tabpanel", { name: "Em cartaz" });
  await expect(nowShowingPanel).toBeVisible();
  await expect(
    nowShowingPanel.getByRole("link", { name: /Ver detalhes de A Jornada de Natal/ })
  ).toBeVisible();

  await preVendaTab.click();

  await expect(preVendaTab).toHaveAttribute("aria-selected", "true");
  await expect(emCartazTab).toHaveAttribute("aria-selected", "false");

  const preSalePanel = catalogSection.getByRole("tabpanel", { name: "Pré-venda" });
  await expect(preSalePanel).toBeVisible();
  await expect(
    preSalePanel.getByRole("link", { name: /Ver detalhes de Estreia da Semana/ })
  ).toBeVisible();

  await expect(nowShowingPanel).toBeHidden();
});

test("home schedule section renders Em cartaz and Em breve tabs", async ({ page }) => {
  await setupMockApi(page);
  await page.goto("/");

  const scheduleSection = page.getByRole("region", { name: "Horários" });
  const emCartazTab = scheduleSection.getByRole("tab", { name: "Em cartaz" });
  const emBreveTab = scheduleSection.getByRole("tab", { name: "Em breve" });

  await expect(emCartazTab).toBeVisible();
  await expect(emBreveTab).toBeVisible();
  await expect(emCartazTab).toHaveAttribute("aria-selected", "true");
  await expect(emBreveTab).toHaveAttribute("aria-selected", "false");
});

test("home schedule Em cartaz tab shows session buttons linking to seat selection", async ({
  page,
}) => {
  await setupMockApi(page);
  await page.goto("/");

  const scheduleSection = page.getByRole("region", { name: "Horários" });
  await expect(scheduleSection).toBeVisible();

  await expect(
    scheduleSection.getByRole("link", {
      name: /Selecionar sessão das 15:00, sala Sala 1/,
    })
  ).toBeVisible();
});

test("home schedule Em cartaz session button navigates to seat selection", async ({ page }) => {
  await setupMockApi(page);
  await page.goto("/");

  const scheduleSection = page.getByRole("region", { name: "Horários" });
  await scheduleSection.getByRole("link", { name: /Selecionar sessão das 15:00/ }).click();

  await expect(page).toHaveURL(/\/sessions\/session-morning\/seats/);
});

test("home schedule switches to Em breve tab and shows upcoming movie without session links", async ({
  page,
}) => {
  await setupMockApi(page);
  await page.goto("/");

  const scheduleSection = page.getByRole("region", { name: "Horários" });
  await scheduleSection.getByRole("tab", { name: "Em breve" }).click();

  const emBrevePanel = scheduleSection.getByRole("tabpanel", { name: "Em breve" });
  await expect(emBrevePanel).toBeVisible();
  await expect(
    emBrevePanel.getByRole("link", { name: /Ver detalhes de Em Breve em Natal/ })
  ).toBeVisible();

  await expect(
    emBrevePanel.getByRole("link", { name: /Selecionar sessão/ })
  ).toHaveCount(0);
});

test("movie detail for em_breve movie shows coming-soon notice and hides session selector", async ({
  page,
}) => {
  await setupMockApi(page);
  await page.goto("/movies/movie-upcoming");

  await expect(
    page.getByRole("heading", { level: 1, name: "Em Breve em Natal" })
  ).toBeVisible();
  await expect(page.getByText("Em breve nas telas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sessões" })).toHaveCount(0);
});

test("tabbed catalog switches to Pré-venda panel with ArrowRight key", async ({ page }) => {
  await setupMockApi(page);
  await page.goto("/");

  const catalogSection = page.getByRole("region", { name: "Programação" });
  await catalogSection.getByRole("tab", { name: "Em cartaz" }).focus();
  await page.keyboard.press("ArrowRight");

  const preVendaTab = catalogSection.getByRole("tab", { name: "Pré-venda" });
  await expect(preVendaTab).toHaveAttribute("aria-selected", "true");

  const preSalePanel = catalogSection.getByRole("tabpanel", { name: "Pré-venda" });
  await expect(preSalePanel).toBeVisible();
  await expect(
    preSalePanel.getByRole("link", { name: /Ver detalhes de Estreia da Semana/ })
  ).toBeVisible();
});

test("blocks non-admin users from the admin area", async ({ page }) => {
  await setupMockApi(page, { isAdmin: false });

  await login(page, "/admin");

  await expect(
    page.getByText("Você não tem permissão para acessar esta página.")
  ).toBeVisible();
});

test("shows admin dashboard to authenticated admin users", async ({ page }) => {
  await setupMockApi(page, { isAdmin: true });

  await login(page, "/admin");

  await expect(
    page.getByRole("heading", { name: "Dashboard" })
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegação administrativa" }).first()
  ).toBeVisible();
});

test("admin nav links are reachable from the dashboard", async ({ page }) => {
  await setupMockApi(page, { isAdmin: true });

  await login(page, "/admin");

  await page.getByRole("link", { name: "Filmes" }).first().click();
  await expect(page).toHaveURL("/admin/movies");
  await expect(page.getByRole("heading", { name: "Filmes" })).toBeVisible();
});

test("admin can create a room and navigate to its layout editor", async ({
  page,
}) => {
  await setupMockApi(page, { isAdmin: true });
  await login(page, "/admin");

  await page.getByRole("link", { name: "Salas" }).first().click();
  await expect(page).toHaveURL("/admin/rooms");
  await expect(page.getByRole("heading", { name: "Salas" })).toBeVisible();

  await page.getByRole("link", { name: "Nova sala" }).click();
  await expect(page).toHaveURL("/admin/rooms/new");
  await expect(page.getByRole("heading", { name: "Nova sala" })).toBeVisible();

  await page.getByLabel("Nome da sala").fill("Sala Teste");
  await page.getByLabel("Capacidade").fill("50");
  await page.getByRole("button", { name: "Criar sala" }).click();

  await expect(page).toHaveURL("/admin/rooms");
});

test("admin can open room layout editor and add a seat row", async ({
  page,
}) => {
  await setupMockApi(page, { isAdmin: true });
  await login(page, "/admin/rooms/room-1/layout");

  await expect(
    page.getByRole("heading", { name: /Layout/ })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Fileiras/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Adicionar fileira" }).click();
  await page.getByPlaceholder("Ex.: A").fill("B");
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(
    page.getByRole("group", { name: "Fileira B" }).or(
      page.locator("text=B").first()
    )
  ).toBeVisible();
});

test("admin sees seat map preview in layout editor", async ({ page }) => {
  await setupMockApi(page, { isAdmin: true });
  await login(page, "/admin/rooms/room-1/layout");

  await page.getByRole("button", { name: "Prévia do mapa" }).click();
  await expect(page.getByRole("img", { name: "Prévia do mapa de assentos" })).toBeVisible();
  await expect(page.getByText("TELA")).toBeVisible();
});

test("admin sees blocked-layout warning when future sessions exist", async ({
  page,
}) => {
  await setupMockApi(page, { isAdmin: true, roomLayoutBlocked: true });
  await login(page, "/admin/rooms/room-1/layout");

  await page.getByRole("button", { name: "+ Adicionar fileira" }).click();
  await page.getByPlaceholder("Ex.: A").fill("C");
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(
    page.getByText(/sessões futuras/)
  ).toBeVisible();
});

async function login(page: Page, redirectPath = "/") {
  const loginPath =
    redirectPath === "/"
      ? "/login"
      : `/login?redirect=${encodeURIComponent(redirectPath)}`;

  await page.goto(loginPath);
  await page.getByLabel("E-mail").fill("ana@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-super-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(redirectPath);
}
