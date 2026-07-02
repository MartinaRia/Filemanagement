import crypto from "crypto";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import type { CustomColumnDef } from "@/lib/types";

function columnLetterToIndex(letter: string): number {
  let result = 0;
  for (const ch of letter.trim().toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result - 1;
}

// Chiave stabile per la riga: usa la colonna configurata come identificatore
// se disponibile, altrimenti un hash del contenuto della riga. Questa chiave
// e' cio' che collega SourceRow e CustomRow: finche' non cambia, le note e i
// dati custom inseriti dall'utente restano intatti anche dopo un nuovo
// caricamento del file.
function computeRowKey(values: string[], keyColumn?: string | null): string {
  if (keyColumn) {
    const idx = columnLetterToIndex(keyColumn);
    const raw = values[idx];
    if (raw && raw.trim() !== "") {
      return `k:${raw.trim()}`;
    }
  }
  const content = values.join("|");
  return `h:${crypto.createHash("sha1").update(content).digest("hex")}`;
}

export interface ExcelSnapshot {
  headers: string[];
  rows: string[][];
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    // Formule, rich text, hyperlink, ecc: usa il risultato/testo calcolato quando disponibile.
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("text" in value) return String((value as { text: unknown }).text ?? "");
    if ("richText" in value) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
    return "";
  }
  return String(value);
}

export async function parseWorkbookBuffer(
  buffer: Buffer,
  worksheetName?: string | null
): Promise<ExcelSnapshot> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const worksheet = worksheetName ? workbook.getWorksheet(worksheetName) : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(
      worksheetName
        ? `Foglio "${worksheetName}" non trovato nel file caricato`
        : "Il file caricato non contiene fogli"
    );
  }

  const rows: string[][] = [];
  let headers: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellToString);
    if (rowNumber === 1) {
      headers = values.map((h) => h.trim());
      return;
    }
    if (values.every((v) => v.trim() === "")) return;
    rows.push(headers.map((_, i) => values[i] ?? ""));
  });

  return { headers, rows };
}

export interface ApplySnapshotResult {
  rowCount: number;
}

// Sostituisce lo snapshot dei dati sorgente con quello del file appena
// caricato, preservando sempre i dati custom (CustomRow) delle righe
// riconosciute tramite la stessa chiave.
export async function applyUploadedWorkbook(
  buffer: Buffer,
  fileName?: string
): Promise<ApplySnapshotResult> {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const log = await prisma.uploadLog.create({ data: { status: "ok", fileName } });

  try {
    const snapshot = await parseWorkbookBuffer(buffer, config?.worksheetName);

    if (snapshot.headers.length === 0) {
      throw new Error("Impossibile leggere le intestazioni delle colonne dal file caricato");
    }

    const seenKeys: string[] = [];

    await prisma.$transaction(
      snapshot.rows.map((values, rowIndex) => {
        const rowKey = computeRowKey(values, config?.keyColumn);
        seenKeys.push(rowKey);
        const data: Record<string, string> = {};
        snapshot.headers.forEach((h, i) => {
          data[h || `col_${i}`] = values[i] ?? "";
        });
        return prisma.sourceRow.upsert({
          where: { rowKey },
          create: { rowKey, rowIndex, data },
          update: { rowIndex, data },
        });
      })
    );

    // Le righe non piu' presenti nel file caricato vengono rimosse dalla
    // vista, ma i relativi dati custom (CustomRow) restano nel database: se
    // la riga ricompare in un caricamento successivo (stessa chiave)
    // recupera automaticamente le sue note.
    await prisma.sourceRow.deleteMany({
      where: { rowKey: { notIn: seenKeys.length ? seenKeys : ["__none__"] } },
    });

    await prisma.appConfig.upsert({
      where: { id: 1 },
      create: { id: 1, sourceHeaders: snapshot.headers },
      update: { sourceHeaders: snapshot.headers },
    });

    await prisma.uploadLog.update({
      where: { id: log.id },
      data: { status: "ok", rowCount: snapshot.rows.length, finishedAt: new Date() },
    });

    return { rowCount: snapshot.rows.length };
  } catch (err) {
    await prisma.uploadLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}

export async function getColumnDefs(): Promise<CustomColumnDef[]> {
  const columnDefs = await prisma.customColumnDef.findMany({ orderBy: { order: "asc" } });
  return columnDefs.map((c) => ({
    id: c.id,
    key: c.key,
    label: c.label,
    type: c.type as CustomColumnDef["type"],
    options: (c.options as string[] | null) ?? null,
    order: c.order,
  }));
}

export async function getMergedRows() {
  const [sourceRows, customRows, columnDefs, config] = await Promise.all([
    prisma.sourceRow.findMany({ orderBy: { rowIndex: "asc" } }),
    prisma.customRow.findMany(),
    getColumnDefs(),
    prisma.appConfig.findUnique({ where: { id: 1 } }),
  ]);

  const customByKey = new Map(customRows.map((c) => [c.rowKey, c.data as Record<string, unknown>]));

  const rows = sourceRows.map((s) => ({
    rowKey: s.rowKey,
    source: s.data as Record<string, string>,
    custom: customByKey.get(s.rowKey) ?? {},
  }));

  // sourceHeaders conserva l'ordine originale delle colonne del file caricato:
  // le chiavi di un oggetto jsonb (SourceRow.data) non hanno ordine garantito in Postgres.
  const sourceHeaders = config?.sourceHeaders?.length
    ? config.sourceHeaders
    : Array.from(new Set(rows.flatMap((r) => Object.keys(r.source))));

  return { rows, columnDefs, sourceHeaders };
}
