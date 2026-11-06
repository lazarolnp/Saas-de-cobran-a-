/**
 * Importação de alunos por planilha: mapeia colunas, valida linha a linha e
 * monta o relatório antes de qualquer gravação. Função pura.
 */
import { parseCsv, toCsv } from "@/lib/csv";
import { FIELD_LABELS, validateRegistration, type FieldErrors, type RawRegistration, type Registration } from "./registration";

export const MAX_IMPORT_ROWS = 500;

/** Colunas do modelo, na ordem, com nomes alternativos aceitos. */
export const TEMPLATE_COLUMNS: { field: keyof typeof FIELD_LABELS; header: string; aliases: string[]; example: string }[] = [
  { field: "studentName", header: "aluno", aliases: ["nome do aluno", "nome aluno", "estudante", "crianca"], example: "Ana Souza" },
  { field: "school", header: "escola", aliases: ["colegio"], example: "EE Prof. Carlos Gomes" },
  { field: "grade", header: "serie", aliases: ["ano", "turma"], example: "3º ano" },
  { field: "route", header: "rota", aliases: ["linha", "itinerario"], example: "Rota Manhã" },
  { field: "shift", header: "turno", aliases: ["periodo"], example: "manhã" },
  { field: "guardianName", header: "responsavel", aliases: ["nome do responsavel", "pagador", "pai", "mae"], example: "Marcos Souza" },
  { field: "cpf", header: "cpf", aliases: ["cpf do responsavel", "cpf responsavel"], example: "529.982.247-25" },
  { field: "whatsapp", header: "whatsapp", aliases: ["telefone", "celular", "fone", "zap"], example: "(11) 98765-4321" },
  { field: "email", header: "email", aliases: ["e-mail"], example: "" },
  { field: "monthlyAmount", header: "valor", aliases: ["mensalidade", "valor mensal"], example: "350,00" },
  { field: "dueDay", header: "vencimento", aliases: ["dia", "dia de vencimento", "dia vencimento"], example: "10" },
  { field: "startDate", header: "inicio", aliases: ["data de inicio", "comeco"], example: "01/03/2026" },
  { field: "months", header: "meses", aliases: ["parcelas", "meses com cobranca"], example: "10" },
  { field: "discount", header: "desconto", aliases: [], example: "" },
  { field: "prorata", header: "proporcional", aliases: ["pro rata", "primeiro mes proporcional"], example: "não" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

export function templateCsv(): string {
  return toCsv([TEMPLATE_COLUMNS.map((c) => c.header), TEMPLATE_COLUMNS.map((c) => c.example)]);
}

export interface ImportRow {
  line: number;
  /** Só o necessário para a pré-visualização (sem CPF completo). */
  preview: { studentName: string; guardianName: string; amount: string; route: string };
  /** Dados validados (contém CPF em claro): NUNCA enviar ao navegador; use publicReport(). */
  data: Registration | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportReport {
  ok: boolean;
  /** Erro que impede ler a planilha inteira. */
  fatal: string | null;
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
}

export interface ExistingContext {
  /** Hash de CPF -> nomes normalizados de alunos com contrato aberto. */
  studentsByPayer: Map<string, Set<string>>;
  hashCpf: (cpf: string) => string;
}

const normalizeName = (s: string) => norm(s);

export function buildImportReport(csvText: string, today: string, ctx: ExistingContext): ImportReport {
  const empty = (fatal: string): ImportReport => ({ ok: false, fatal, rows: [], validCount: 0, errorCount: 0 });
  const { headers, rows } = parseCsv(csvText);
  if (!headers.length) return empty("A planilha está vazia.");

  // Mapeia cabeçalhos para campos.
  const index = new Map<keyof typeof FIELD_LABELS, number>();
  headers.forEach((h, i) => {
    const n = norm(h);
    const col = TEMPLATE_COLUMNS.find((c) => c.header === n || c.aliases.includes(n));
    if (col && !index.has(col.field)) index.set(col.field, i);
  });
  const required: (keyof typeof FIELD_LABELS)[] = ["studentName", "shift", "guardianName", "cpf", "whatsapp", "monthlyAmount", "dueDay"];
  const missing = required.filter((f) => !index.has(f));
  if (missing.length) {
    return empty(`Faltam colunas obrigatórias: ${missing.map((f) => TEMPLATE_COLUMNS.find((c) => c.field === f)!.header).join(", ")}. Baixe o modelo e use os mesmos nomes.`);
  }
  if (!rows.length) return empty("A planilha só tem o cabeçalho. Preencha uma linha por aluno.");
  if (rows.length > MAX_IMPORT_ROWS) return empty(`A planilha tem ${rows.length} linhas. O máximo por vez é ${MAX_IMPORT_ROWS}.`);

  const seenInFile = new Map<string, number>(); // cpfHash|nome -> linha
  const payerNameByHash = new Map<string, { name: string; line: number }>();
  const result: ImportRow[] = rows.map(({ line, cells }) => {
    const raw: RawRegistration = {};
    for (const [field, i] of index) raw[field] = cells[i] ?? "";
    const preview = {
      studentName: raw.studentName ?? "",
      guardianName: raw.guardianName ?? "",
      amount: raw.monthlyAmount ?? "",
      route: raw.route ?? "",
    };
    const v = validateRegistration(raw, today);
    if (!v.ok) {
      return { line, preview, data: null, valid: false, errors: describeErrors(v.errors), warnings: [] };
    }
    const errors: string[] = [];
    const warnings: string[] = [];
    const hash = ctx.hashCpf(v.data.cpf);
    const key = `${hash}|${normalizeName(v.data.studentName)}`;
    if (ctx.studentsByPayer.get(hash)?.has(normalizeName(v.data.studentName))) {
      errors.push("Este aluno já está cadastrado com este responsável.");
    } else if (seenInFile.has(key)) {
      errors.push(`Linha repetida (igual à linha ${seenInFile.get(key)}).`);
    } else {
      seenInFile.set(key, line);
    }
    const payer = payerNameByHash.get(hash);
    if (payer && normalizeName(payer.name) !== normalizeName(v.data.guardianName)) {
      warnings.push(`Este CPF já aparece na linha ${payer.line} com o nome “${payer.name}”. Vamos usar o mesmo responsável.`);
    } else if (!payer) payerNameByHash.set(hash, { name: v.data.guardianName, line });
    if (!index.has("route") || !v.data.routeName) warnings.push("Sem rota: você pode escolher depois.");
    return { line, preview, data: errors.length ? null : v.data, valid: !errors.length, errors, warnings };
  });

  const validCount = result.filter((r) => r.data).length;
  return { ok: true, fatal: null, rows: result, validCount, errorCount: result.length - validCount };
}

/** Versão segura para a tela: sem os dados validados (CPF etc.). */
export function publicReport(report: ImportReport): ImportReport {
  return { ...report, rows: report.rows.map((r) => ({ ...r, data: null })) };
}

function describeErrors(errors: FieldErrors): string[] {
  return Object.entries(errors).map(([field, msg]) => `${FIELD_LABELS[field as keyof typeof FIELD_LABELS]}: ${msg}`);
}

/** Relatório de erros para baixar (só linhas com problema). */
export function errorReportCsv(report: ImportReport): string {
  return toCsv([
    ["linha", "aluno", "responsavel", "problemas"],
    ...report.rows.filter((r) => r.errors.length).map((r) => [r.line, r.preview.studentName, r.preview.guardianName, r.errors.join(" | ")]),
  ]);
}
