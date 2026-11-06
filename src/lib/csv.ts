/**
 * Leitor de CSV simples e tolerante, pensado para planilhas salvas pelo Excel
 * ou Google Planilhas no Brasil:
 *  - detecta o separador (";" do Excel brasileiro ou ",");
 *  - aceita BOM, aspas, aspas duplicadas e quebras de linha dentro de aspas;
 *  - ignora linhas totalmente vazias.
 */

export interface CsvResult {
  headers: string[];
  /** Cada linha com o número dela na planilha (o cabeçalho é a linha 1). */
  rows: { line: number; cells: string[] }[];
}

export function detectDelimiter(firstLine: string): ";" | "," {
  const count = (ch: string) => firstLine.split(ch).length - 1;
  return count(";") >= count(",") ? ";" : ",";
}

export function parseCsv(input: string): CsvResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLineEnd = text.indexOf("\n");
  const delimiter = detectDelimiter(firstLineEnd === -1 ? text : text.slice(0, firstLineEnd));

  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const pushField = () => {
    cells.push(field.trim());
    field = "";
  };
  const pushRecord = () => {
    pushField();
    if (cells.some((c) => c !== "")) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === "\n") {
      pushRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== "" || cells.length) pushRecord();

  const [header, ...rows] = records;
  return { headers: header?.cells ?? [], rows };
}

/** Gera CSV com ";" (abre direto no Excel brasileiro). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Evita "injeção de fórmula" quando o arquivo é aberto no Excel.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}
