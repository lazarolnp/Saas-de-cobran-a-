import { expect, test } from "@playwright/test";

test("cadastro cria a conta e abre o início com o teste grátis", async ({ page }) => {
  await page.goto("/cadastrar");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByText("Para continuar, aceite")).toBeVisible();

  await page.getByLabel("Seu nome").fill("Maria Teste");
  await page.getByLabel("Nome do seu transporte").fill("Van da Maria");
  await page.getByLabel("E-mail").fill(`novo${Date.now()}@teste.local`);
  await page.getByLabel("Crie uma senha").fill("senha-forte-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();

  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole("heading", { name: "Olá, Maria!" })).toBeVisible();
  await expect(page.getByText("Van da Maria")).toBeVisible();
  await expect(page.getByText("Seu teste grátis termina em 14 dias.")).toBeVisible();
  // Conta nova não enxerga os 15 alunos do tenant de exemplo.
  await expect(page.getByText("Vamos começar?")).toBeVisible();
});

test("login do tenant de exemplo, erro amigável e logout", async ({ page }) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/entrar$/); // área logada exige login

  await page.getByLabel("E-mail").fill("demo@exemplo.com.br");
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha não conferem")).toBeVisible();
  await expect(page.getByLabel("E-mail")).toHaveValue("demo@exemplo.com.br"); // não apaga o que foi digitado

  await page.getByLabel("Senha").fill("demo-senha-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByText("Transporte Escolar Tio Beto (DEMO)")).toBeVisible();
  await expect(page.locator("text=Alunos ativos").locator("..")).toContainText("15");

  // Sem rolagem horizontal em 360 px e alvos de toque >= 44 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a, input")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.height < 44;
    }).length,
  );
  expect(small).toBe(0);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});
