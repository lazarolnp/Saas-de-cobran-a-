import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page, name: string) {
  await page.goto("/cadastrar");
  await page.getByLabel("Seu nome").fill(name);
  await page.getByLabel("Nome do seu transporte").fill(`Van de ${name}`);
  await page.getByLabel("E-mail").fill(`alunos${Date.now()}@teste.local`);
  await page.getByLabel("Crie uma senha").fill("senha-forte-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("motorista novo importa 10 alunos pela planilha (critério 1)", async ({ page }) => {
  const started = Date.now();
  await signUp(page, "Rita");

  // Desconto de irmão configurado antes da importação.
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByLabel("Tipo de desconto para irmãos").selectOption("percentual");
  await page.getByLabel("Quantos %?").fill("10");
  await page.getByRole("button", { name: "Salvar desconto" }).click();
  await expect(page.getByText("Desconto salvo")).toBeVisible();

  await page.getByRole("link", { name: "Alunos" }).click();
  await page.getByRole("link", { name: "Importar" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar modelo da planilha" }).click();
  expect((await download).suggestedFilename()).toBe("modelo-alunos.csv");

  await page.getByLabel("Arquivo CSV").setInputFiles(path.join(__dirname, "fixtures/alunos-10.csv"));
  await page.getByRole("button", { name: "Conferir planilha" }).click();
  await expect(page.getByText("10 prontas")).toBeVisible();
  await expect(page.getByText("1 com problema")).toBeVisible();
  await expect(page.getByText(/Linha 12: Linha Com Erro/)).toBeVisible();
  await expect(page.getByText(/CPF do responsável: CPF inválido/)).toBeVisible();
  // A tela não recebe CPF completo.
  expect(await page.content()).not.toMatch(/"cpf":"\d{11}"/);

  await page.getByRole("button", { name: "Importar 10 alunos" }).click();
  await expect(page.getByText("10 alunos importados!")).toBeVisible();
  await expect(page.getByText("2 rotas novas criadas")).toBeVisible();
  await expect(page.getByText("Desconto de irmão aplicado em 1")).toBeVisible();

  await page.getByRole("link", { name: "Ver alunos" }).click();
  await expect(page.getByText("10 no total")).toBeVisible();
  await page.getByLabel("Turno").selectOption("tarde");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("5 no total")).toBeVisible();

  // Irmão: Júlio Campos com 10% de desconto sobre R$ 425,00.
  await page.goto("/alunos?q=J%C3%BAlio");
  await page.getByRole("link", { name: /Júlio Campos/ }).click();
  await expect(page.getByText("R$ 382,50 (de R$ 425,00)")).toBeVisible();
  await expect(page.getByText(/\*\*\*\.533\.459-\*\*/)).toBeVisible();

  expect(Date.now() - started).toBeLessThan(10 * 60 * 1000);
});

test("cadastro manual em um único formulário", async ({ page }) => {
  await signUp(page, "Paulo");
  await page.goto("/rotas");
  await page.getByLabel("Nome da rota").fill("Manhã Centro");
  await page.getByText("Manhã", { exact: true }).click();
  await page.getByRole("button", { name: "Criar rota" }).click();
  await expect(page.getByText("Rota salva!")).toBeVisible();

  await page.goto("/alunos/novo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Salvar aluno" }).click();
  await expect(page.getByText("Confira os campos marcados em vermelho.")).toBeVisible();
  await expect(page.getByText("Escreva o nome do aluno.")).toBeVisible();

  await page.getByLabel("Nome do aluno").fill("Laura Mendes");
  await page.getByLabel("Rota").selectOption({ label: "Manhã Centro" });
  await page.getByText("Manhã", { exact: true }).click();
  await page.getByLabel("Nome do responsável").fill("Carla Mendes");
  await page.getByLabel("CPF do responsável").fill("529.982.247-25");
  await page.getByLabel("WhatsApp").fill("(11) 98765-4321");
  await page.getByLabel("Valor por mês").fill("400");
  await page.getByLabel("Dia de vencimento").fill("5");
  await page.getByText("Mais opções (início, meses e desconto)").click();
  await page.getByText("10 meses (sem janeiro e julho)").click();
  await page.getByRole("button", { name: "Salvar aluno" }).click();

  await expect(page).toHaveURL(/\/alunos\/[0-9a-f-]{36}\?novo=1$/);
  await expect(page.getByRole("heading", { name: "Laura Mendes" })).toBeVisible();
  await expect(page.getByText("10 meses (sem janeiro e julho)")).toBeVisible();
  await expect(page.getByText("(11) 9****-4321")).toBeVisible();
  await expect(page.getByText("Aguardando o pai autorizar")).toBeVisible();

  // Editar contato.
  await page.getByRole("button", { name: "Editar dados do aluno e contato" }).click();
  await page.getByLabel("WhatsApp").fill("(11) 91234-0000");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Dados atualizados.")).toBeVisible();
  await expect(page.getByText("(11) 9****-0000")).toBeVisible();

  // Mesmo aluno + mesmo CPF: duplicado é barrado.
  await page.goto("/alunos/novo");
  await page.getByLabel("Nome do aluno").fill("laura  mendes");
  await page.getByText("Manhã", { exact: true }).click();
  await page.getByLabel("Nome do responsável").fill("Carla Mendes");
  await page.getByLabel("CPF do responsável").fill("52998224725");
  await page.getByLabel("WhatsApp").fill("11987654321");
  await page.getByLabel("Valor por mês").fill("400");
  await page.getByLabel("Dia de vencimento").fill("5");
  await page.getByRole("button", { name: "Salvar aluno" }).click();
  await expect(page.getByText("Este aluno já está cadastrado com este responsável.")).toBeVisible();
});
