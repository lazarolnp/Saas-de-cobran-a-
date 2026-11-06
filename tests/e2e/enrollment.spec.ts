import { expect, test, type Page } from "@playwright/test";

/**
 * E2E (a) do critério de aceite: cadastro de aluno até a página de adesão,
 * aberta pelo responsável no celular, sem login.
 */
async function signUpAndConnect(page: Page) {
  await page.goto("/cadastrar");
  await page.getByLabel("Seu nome").fill("Beto Silva");
  await page.getByLabel("Nome do seu transporte").fill("Transporte do Beto");
  await page.getByLabel("E-mail").fill(`adesao${Date.now()}@teste.local`);
  await page.getByLabel("Crie uma senha").fill("senha-forte-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/inicio$/);

  await page.goto("/configuracoes/recebimento");
  await page.getByRole("button", { name: "Sim, tenho" }).click();
  await expect(page.getByRole("button", { name: "Sim, tenho" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel(/Simulado/).check();
  await page.getByLabel("Chave de acesso (API)").fill("mock_beto_0001");
  await page.getByRole("button", { name: "Testar e conectar" }).click();
  await expect(page.getByText("Conexão feita!")).toBeVisible();
}

test("cadastro do aluno até a página de adesão do responsável", async ({ page, browser }) => {
  await signUpAndConnect(page);

  await page.goto("/alunos/novo");
  await page.getByLabel("Nome do aluno").fill("Sofia Andrade");
  await page.getByLabel("Escola (opcional)").fill("Colégio Secreto");
  await page.getByText("Manhã", { exact: true }).click();
  await page.getByLabel("Nome do responsável").fill("Helena Andrade");
  await page.getByLabel("CPF do responsável").fill("529.982.247-25");
  await page.getByLabel("WhatsApp").fill("(11) 98765-4321");
  await page.getByLabel("Valor por mês").fill("420,00");
  await page.getByLabel("Dia de vencimento").fill("10");
  await page.getByRole("button", { name: "Salvar aluno" }).click();
  await expect(page.getByRole("heading", { name: "Sofia Andrade" })).toBeVisible();

  await page.getByRole("button", { name: "Gerar link de adesão" }).click();
  await expect(page.getByText("Link de adesão pronto")).toBeVisible();
  const whatsapp = await page.getByRole("link", { name: "Enviar no WhatsApp" }).getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
  const text = decodeURIComponent(whatsapp!.split("text=")[1]);
  expect(text).toContain("Olá, Helena!");
  expect(text).toContain("R$ 420,00");
  const url = text.match(/https?:\/\/\S+\/p\/[A-Za-z0-9_-]+/)![0];
  await expect(page.getByText("Em aberto")).toBeVisible();

  // O responsável abre no celular, sem login.
  const parent = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const p = await parent.newPage();
  await p.goto(new URL(url).pathname);
  await expect(p.getByRole("heading", { name: "Transporte escolar de Sofia" })).toBeVisible();
  await expect(p.getByText("Transporte do Beto", { exact: true }).first()).toBeVisible();
  await expect(p.getByText("R$ 420,00").first()).toBeVisible();
  // Não expõe dados desnecessários do aluno nem do pai.
  const html = await p.content();
  expect(html).not.toContain("Andrade");
  expect(html).not.toContain("Colégio Secreto");
  expect(html).not.toContain("529.982");

  // Aceite (base legal) antes do QR.
  await expect(p.getByText("Antes de pagar")).toBeVisible();
  await p.getByRole("button", { name: "Entendi, quero pagar" }).click();
  await expect(p.getByRole("button", { name: "Copiar código Pix" })).toBeVisible();
  await expect(p.getByLabel(/Pix copia e cola/)).toHaveValue(/^PIX-SIMULADO/);
  await expect(p.getByText("Pagou uma vez, os próximos caem sozinhos")).toBeVisible();
  await expect(p.getByText(/Sugerimos R\$\s463,00/)).toBeVisible(); // 420 + 10%, arredondado para cima
  await expect(p.getByText("cancelar quando quiser")).toBeVisible();
  await p.getByText("Mostrar QR Code").click();
  await expect(p.getByAltText("QR Code do Pix")).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Link inválido: mensagem amigável.
  await p.goto("/p/tokeninvalidotokeninvalidotokeninvalido12");
  await expect(p.getByText("Link não encontrado")).toBeVisible();
  await parent.close();
});

test("rotina diária exige o segredo do cron", async ({ request }) => {
  expect((await request.get("/api/cron/diario")).status()).toBe(401);
  expect((await request.get("/api/cron/diario", { headers: { authorization: "Bearer errado" } })).status()).toBe(401);
});
