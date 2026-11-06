import { expect, test } from "@playwright/test";

async function signUp(page: import("@playwright/test").Page) {
  await page.goto("/cadastrar");
  await page.getByLabel("Seu nome").fill("João Teste");
  await page.getByLabel("Nome do seu transporte").fill("Van do João");
  await page.getByLabel("E-mail").fill(`prov${Date.now()}@teste.local`);
  await page.getByLabel("Crie uma senha").fill("senha-forte-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("motorista conecta a conta de recebimento e testa a conexão", async ({ page }) => {
  await signUp(page);
  await page.getByRole("link", { name: "Conectar agora" }).click();
  await expect(page.getByRole("heading", { name: "Onde você recebe" })).toBeVisible();

  // D2: sem CNPJ há 6 meses -> modo Pix comum + lembretes, sem bloquear.
  await page.getByRole("button", { name: "Ainda não" }).click();
  await expect(page.getByText("Pix comum + lembretes")).toBeVisible();

  // Chave errada: mensagem clara e nada é salvo.
  await page.getByLabel(/Simulado/).check();
  await page.getByLabel("Chave de acesso (API)").fill("chave-errada");
  await page.getByRole("button", { name: "Testar e conectar" }).click();
  await expect(page.getByText("A chave de acesso não foi aceita")).toBeVisible();
  await expect(page.getByText("Ainda não conectada.")).toBeVisible();

  await page.getByLabel(/Simulado/).check();
  await page.getByLabel("Chave de acesso (API)").fill("mock_chave_do_joao_9876");
  await page.getByRole("button", { name: "Testar e conectar" }).click();
  await expect(page.getByText("Conexão feita!")).toBeVisible();
  await expect(page.getByText("o sistema fica sabendo sozinho")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Conectada", { exact: true })).toBeVisible();
  await expect(page.getByText(/chave final 9876/)).toBeVisible();
  // A chave nunca volta para o navegador.
  expect(await page.content()).not.toContain("mock_chave_do_joao");

  await page.getByRole("button", { name: "Testar conexão" }).click();
  await expect(page.getByText("Conexão feita!")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
