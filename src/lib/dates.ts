import type { MergedRow } from "@/lib/types";

const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

function isPlausibleYear(year: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

// Riconosce i formati data piu' comuni nei file Excel caricati: ISO (le celle
// che erano gia' un vero valore Date vengono normalizzate a yyyy-mm-dd in
// fase di parsing, vedi cellToString in merge.ts) e i formati testuali
// italiani/europei piu' diffusi (gg/mm/aaaa, gg-mm-aaaa, gg.mm.aaaa).
export function parseFlexibleDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const year = Number(y);
    const date = new Date(year, Number(m) - 1, Number(d));
    if (!isPlausibleYear(year) || Number.isNaN(date.getTime())) return null;
    return date;
  }

  const eu = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (eu) {
    const day = Number(eu[1]);
    const month = Number(eu[2]);
    const year = Number(eu[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || !isPlausibleYear(year)) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime()) || date.getDate() !== day) return null;
    return date;
  }

  return null;
}

// Individua le colonne "data" tra le sourceHeaders senza affidarsi a un
// elenco fisso: una colonna e' considerata data se la maggior parte dei suoi
// valori non vuoti sono interpretabili come data.
export function detectDateHeaders(
  rows: MergedRow[],
  sourceHeaders: string[],
  threshold = 0.6
): string[] {
  return sourceHeaders.filter((header) => {
    const values = rows.map((r) => r.source[header] ?? "").filter((v) => v.trim() !== "");
    if (values.length === 0) return false;
    const parsed = values.filter((v) => parseFlexibleDate(v) !== null).length;
    return parsed / values.length >= threshold;
  });
}

const LABEL_KEYWORDS = ["nome", "titolo", "progetto", "project", "cliente", "descrizione", "commessa", "oggetto"];

// Sceglie una colonna sorgente plausibile da usare come etichetta di riga
// (asse verticale del Gantt), preferendo nomi colonna riconoscibili.
export function guessLabelHeader(sourceHeaders: string[], dateHeaders: string[]): string {
  const candidates = sourceHeaders.filter((h) => !dateHeaders.includes(h));
  const byKeyword = candidates.find((h) =>
    LABEL_KEYWORDS.some((kw) => h.toLowerCase().includes(kw))
  );
  return byKeyword ?? candidates[0] ?? sourceHeaders[0] ?? "";
}

// Individua la colonna "Stato" (es. "Stato Pj") tra le sourceHeaders, per
// popolare il filtro di stato nel Gantt. Ritorna null se non c'e' nulla che
// somigli a una colonna di stato.
export function findStatusHeader(sourceHeaders: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const exact = sourceHeaders.find((h) => norm(h) === "statopj");
  if (exact) return exact;
  return (
    sourceHeaders.find((h) => h.toLowerCase().includes("stato")) ??
    sourceHeaders.find((h) => h.toLowerCase().includes("status")) ??
    null
  );
}
