import path from "path";
import os from "os";
import Automizer, { ISlide, IPptxGenJSSlide } from "pptx-automizer";
import { prisma } from "@/lib/db";

// Nomi di colonna fissi, cosi' come appaiono nell'header del file Excel aziendale
// (foglio "1.1_Progetti Execution" e "1.2_Lista IT Board"). Questo modulo e' scritto
// per quel layout specifico, non per un formato Excel generico.
const COL = {
  demand: "Demand",
  area: "Area",
  titolo: "Titolo progetto",
  commentiPpt: "Commenti per ppt",
  rag: "RAG",
  statusPj: "Status Pj",
  avvioSviluppi: "Avvio Sviluppi Actual",
  avvioTest: "Avvio test Actual",
  glActual: "GL Actual",
} as const;

const COL2 = {
  dominio: "Dominio",
  avvioAnalisi: "Avvio Analisi IT",
} as const;

const FONT = "Arial";
const EMU_PER_INCH = 914400;
const emuToIn = (v: number) => v / EMU_PER_INCH;

const TEMPLATE_DIR = path.join(process.cwd(), "templates");
const TEMPLATE_FILE = "report-template.pptx";

// ---------------------------------------------------------------------------
// Dati: lettura + join tra i due fogli (rowKey coincide tra SourceRow e
// SourceRow2 quando entrambe le colonne chiave puntano alla stessa colonna
// logica, es. "Demand" — vedi il commento in prisma/schema.prisma).
// ---------------------------------------------------------------------------

interface RagRow {
  area: string;
  titolo: string;
  commenti: string;
}

interface TimelineRow {
  demand: string;
  dominio: string;
  area: string;
  titolo: string;
  avvioAnalisi: string;
  avvioSviluppi: string;
  avvioTest: string;
  glActual: string;
  rag: string;
  note: string;
}

async function getSheet1Rows(): Promise<Record<string, string>[]> {
  const rows = await prisma.sourceRow.findMany({ orderBy: { rowIndex: "asc" } });
  return rows.map((r) => r.data as Record<string, string>);
}

async function getSheet1RowsWithKey(): Promise<{ rowKey: string; data: Record<string, string> }[]> {
  const rows = await prisma.sourceRow.findMany({ orderBy: { rowIndex: "asc" } });
  return rows.map((r) => ({ rowKey: r.rowKey, data: r.data as Record<string, string> }));
}

async function getSheet2ByKey(): Promise<Map<string, Record<string, string>>> {
  const rows = await prisma.sourceRow2.findMany();
  return new Map(rows.map((r) => [r.rowKey, r.data as Record<string, string>]));
}

// Slide 3/4: progetti filtrati per RAG, esclusi quelli gia' rilasciati ("Live").
async function getRagRows(rag: "Rosso" | "Giallo"): Promise<RagRow[]> {
  const rows = await getSheet1Rows();
  return rows
    .filter((r) => r[COL.rag] === rag && r[COL.statusPj] !== "Live")
    .map((r) => ({
      area: r[COL.area] ?? "",
      titolo: r[COL.titolo] ?? "",
      commenti: r[COL.commentiPpt] ?? "",
    }));
}

// Slide 10: solo progetti con un match nel secondo foglio, Dominio IT4BU, non
// live/sospesi (decisioni confermate con l'utente, vedi memoria di progetto).
async function getTimelineRows(): Promise<TimelineRow[]> {
  const [rows1, byKey2] = await Promise.all([getSheet1RowsWithKey(), getSheet2ByKey()]);
  const result: TimelineRow[] = [];
  for (const { rowKey, data } of rows1) {
    const data2 = byKey2.get(rowKey);
    if (!data2) continue;
    const dominio = data2[COL2.dominio] ?? "";
    if (dominio !== "IT4BU") continue;
    const status = data[COL.statusPj] ?? "";
    if (status === "Live" || status === "Sospeso") continue;
    result.push({
      demand: data[COL.demand] ?? "",
      dominio,
      area: data[COL.area] ?? "",
      titolo: data[COL.titolo] ?? "",
      avvioAnalisi: data2[COL2.avvioAnalisi] ?? "",
      avvioSviluppi: data[COL.avvioSviluppi] ?? "",
      avvioTest: data[COL.avvioTest] ?? "",
      glActual: data[COL.glActual] ?? "",
      rag: data[COL.rag] ?? "",
      note: data[COL.commentiPpt] ?? "",
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Slide 3/4 — tabelle RAG Rosso/Giallo
// ---------------------------------------------------------------------------

const RAG_LAYOUT = {
  marginX: emuToIn(571500),
  contentW: emuToIn(17145000),
  firstRowY: emuToIn(2543175),
  rowAreaBottomEmu: 9600000, // spazio prima del numero di pagina in basso
  tableRightEdgeEmu: 571500 + 17145000,
  cols: {
    dominio: { textX: emuToIn(771525), textW: emuToIn(1993999) },
    progetto: { textX: emuToIn(2994124), textW: emuToIn(3921640) },
    pm: { textX: emuToIn(7097464), textW: emuToIn(1823070) },
    issue: { textX: emuToIn(9149135), textW: emuToIn(3393316) },
    owner: { textX: emuToIn(12739539), textW: emuToIn(2864992) },
    due: { textX: emuToIn(15817007), textW: emuToIn(1139130) },
  },
};

const RAG_ACCENT: Record<"Rosso" | "Giallo", string> = { Rosso: "E32118", Giallo: "EDA900" };
const RAG_TITLE: Record<"Rosso" | "Giallo", string> = {
  Rosso: "Overview Progetti — RAG Rosso",
  Giallo: "Overview Progetti — RAG Giallo",
};

// Stima empirica: 1 riga -> 657225 EMU, 2 righe -> 1123950 EMU (calibrata sul template).
function estimateRagRowHeightEmu(issueText: string): number {
  const charsPerLine = 58;
  const lines = Math.max(1, Math.ceil(issueText.length / charsPerLine));
  return 657225 + Math.max(0, lines - 1) * 466725;
}

function paginateRagRows(rows: RagRow[]): RagRow[][] {
  const budget = RAG_LAYOUT.rowAreaBottomEmu - 2543175;
  const pages: RagRow[][] = [];
  let current: RagRow[] = [];
  let currentHeight = 0;
  for (const row of rows) {
    const h = estimateRagRowHeightEmu(row.commenti);
    if (current.length > 0 && currentHeight + h > budget) {
      pages.push(current);
      current = [];
      currentHeight = 0;
    }
    current.push(row);
    currentHeight += h;
  }
  if (current.length) pages.push(current);
  return pages;
}

function renderRagSlide(
  pSlide: IPptxGenJSSlide,
  pageRows: RagRow[],
  rag: "Rosso" | "Giallo",
  opts: { isContinuation: boolean; totalCount: number }
) {
  const accentColor = RAG_ACCENT[rag];
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  pSlide.addText(today, {
    x: emuToIn(16089511), y: emuToIn(535781), w: emuToIn(1789688), h: emuToIn(300038),
    fontFace: FONT, fontSize: 18, bold: true, color: "8E8E8E", align: "left",
  } as never);

  if (opts.isContinuation) {
    pSlide.addText(`${RAG_TITLE[rag]} (segue)`, {
      x: emuToIn(571500), y: emuToIn(1366838), w: emuToIn(8000000), h: emuToIn(428625),
      fontFace: FONT, fontSize: 27, bold: true, color: "2E3033",
    } as never);
  }

  const badgeD = emuToIn(419100);
  const badgeX = emuToIn(RAG_LAYOUT.tableRightEdgeEmu) - badgeD;
  const badgeY = emuToIn(1352550);
  pSlide.addShape("ellipse" as never, {
    x: badgeX, y: badgeY, w: badgeD, h: badgeD, fill: { color: accentColor }, line: { type: "none" },
  } as never);
  pSlide.addText(String(opts.totalCount), {
    x: badgeX - emuToIn(38100), y: badgeY, w: badgeD + emuToIn(76200), h: emuToIn(457200),
    align: "center", valign: "middle", fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF",
  } as never);

  let y = RAG_LAYOUT.firstRowY;
  pageRows.forEach((row, i) => {
    const rowH = emuToIn(estimateRagRowHeightEmu(row.commenti));
    const shaded = i % 2 === 0;

    if (shaded) {
      pSlide.addShape("rect" as never, {
        x: RAG_LAYOUT.marginX, y, w: RAG_LAYOUT.contentW, h: rowH, fill: { color: "F2F2F2" }, line: { type: "none" },
      } as never);
    }
    pSlide.addShape("rect" as never, {
      x: RAG_LAYOUT.marginX, y, w: emuToIn(47625), h: rowH, fill: { color: accentColor }, line: { type: "none" },
    } as never);

    const textY = y + emuToIn(95250);
    const cellCommon = { y: textY, h: rowH - emuToIn(95250) * 2, fontFace: FONT, fontSize: 15, valign: "top" };
    pSlide.addText(row.area, { ...cellCommon, x: RAG_LAYOUT.cols.dominio.textX, w: RAG_LAYOUT.cols.dominio.textW, color: "4F4F4F" } as never);
    pSlide.addText(row.titolo, { ...cellCommon, x: RAG_LAYOUT.cols.progetto.textX, w: RAG_LAYOUT.cols.progetto.textW, color: "2E3033", bold: true } as never);
    pSlide.addText("", { ...cellCommon, x: RAG_LAYOUT.cols.pm.textX, w: RAG_LAYOUT.cols.pm.textW, color: "4F4F4F" } as never);
    pSlide.addText(row.commenti, { ...cellCommon, x: RAG_LAYOUT.cols.issue.textX, w: RAG_LAYOUT.cols.issue.textW, color: "4F4F4F" } as never);
    pSlide.addText("", { ...cellCommon, x: RAG_LAYOUT.cols.owner.textX, w: RAG_LAYOUT.cols.owner.textW, color: "4F4F4F" } as never);
    pSlide.addText("", { ...cellCommon, x: RAG_LAYOUT.cols.due.textX, w: RAG_LAYOUT.cols.due.textW, color: "4F4F4F" } as never);

    y += rowH;
  });
}

// ---------------------------------------------------------------------------
// Slide 10 — timeline annuale per Area (solo Dominio IT4BU)
// ---------------------------------------------------------------------------

const REPORT_YEAR = 2026; // anno mostrato in "Timeline 2026" (testo statico nel template)
const BAR_START = 4000500;
const BAR_WIDTH = 9772650;
const MAX_TIMELINE_ROWS_PER_PAGE = 4; // verificato sui dati reali: 27 progetti / 4 = 7 pagine, come il template originale

const TIMELINE_ROW1 = {
  titleY: 2238375,
  trackY: 2486025,
  dateAboveY: 2305050,
  dateBelowY: 2781300,
  ragDotY: 2514600,
  noteY: 2171700,
};
const TIMELINE_TITLE_X = 571500;
const TIMELINE_TITLE_W = 3531870;
const TIMELINE_RAG_DOT_X = 14268450;
const TIMELINE_RAG_DOT_D = 209550;
const TIMELINE_NOTE_X = 14973300;
const TIMELINE_NOTE_W = 2825496;
const TIMELINE_ROW_PITCH = 1285875;

// Un colore per fase/milestone, nell'ordine Avvio Analisi -> Avvio Sviluppi -> Avvio Test -> Go Live
// (colori identici agli swatch della legenda gia' presenti nel template, incluso l'oro per Go Live).
const PHASE_COLORS = ["65DCE2", "00B7BD", "008085", "FFC627"];
const TIMELINE_RAG_COLORS: Record<string, string> = { Rosso: "E32118", Giallo: "EDA900", Verde: "1F8A5F" };

function isValidIsoDate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function yearOf(s: string): number {
  return parseInt(s.slice(0, 4), 10);
}
function dayOfYear(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.round((d.getTime() - start.getTime()) / 86400000) + 1;
}
function dateX(dateStr: string): number {
  const doy = dayOfYear(dateStr);
  return BAR_START + ((doy - 1) / 365) * BAR_WIDTH;
}
function formatDateLabel(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

// Il box del titolo ospita ~29 caratteri/riga a 17.25pt bold in una colonna di 3.86in;
// TIMELINE_ROW_PITCH e' calibrato su un titolo di riferimento a 2 righe, quindi un
// titolo piu' lungo necessita di altezza extra (altrimenti si sovrappone alla riga
// successiva) — stessa euristica delle slide 3/4.
const TITLE_CHARS_PER_LINE = 29;
const TITLE_LINE_HEIGHT_EMU = 276225;
const TITLE_BASE_LINES = 2;
function computeTimelineRowHeight(displayTitle: string): number {
  const lines = Math.max(1, Math.ceil(displayTitle.length / TITLE_CHARS_PER_LINE));
  const extraLines = Math.max(0, lines - TITLE_BASE_LINES);
  return TIMELINE_ROW_PITCH + extraLines * TITLE_LINE_HEIGHT_EMU;
}

function paginateFixed<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages;
}

function renderTimelineSlide(
  pSlide: IPptxGenJSSlide,
  pageRows: TimelineRow[],
  opts: { area: string; dominio: string; pageIndex: number; totalPages: number }
) {
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const headerText = `${opts.dominio} - ${opts.area} · ${opts.pageIndex + 1}/${opts.totalPages}`;
  pSlide.addText(headerText, {
    x: emuToIn(2248421), y: emuToIn(535781), w: emuToIn(9000000), h: emuToIn(300038),
    fontFace: FONT, fontSize: 18, bold: true, color: "008085",
  } as never);
  pSlide.addText(today, {
    x: emuToIn(16089511), y: emuToIn(535781), w: emuToIn(1789688), h: emuToIn(300038),
    fontFace: FONT, fontSize: 18, bold: true, color: "8E8E8E",
  } as never);

  let y0 = 0;
  pageRows.forEach((row) => {
    const displayTitle = `${row.demand} — ${row.titolo}`;
    const rowHeight = computeTimelineRowHeight(displayTitle);

    // Demand + titolo come un unico blocco di testo (niente riga sottotitolo separata,
    // che altrimenti collide con la successiva quando il titolo va su piu' righe). Il
    // Demand ha uno stile diverso (corsivo, non in grassetto, colore attenuato) per
    // restare distinguibile dal titolo; il PM non viene piu' mostrato.
    pSlide.addText(
      [
        { text: `${row.demand} — `, options: { bold: false, italic: true, color: "8E8E8E" } },
        { text: row.titolo, options: { bold: true, color: "2E3033" } },
      ] as never,
      {
        x: emuToIn(TIMELINE_TITLE_X), y: emuToIn(TIMELINE_ROW1.titleY + y0), w: emuToIn(TIMELINE_TITLE_W),
        h: emuToIn(rowHeight - 133350), fontFace: FONT, fontSize: 17.25, valign: "top",
      } as never
    );

    pSlide.addShape("roundRect" as never, {
      x: emuToIn(BAR_START), y: emuToIn(TIMELINE_ROW1.trackY + y0), w: emuToIn(BAR_WIDTH), h: emuToIn(266700),
      fill: { color: "F2F5F7" }, line: { type: "none" }, rectRadius: 0.5,
    } as never);

    const milestoneDates = [row.avvioAnalisi, row.avvioSviluppi, row.avvioTest, row.glActual];
    // Salta le milestone iniziali di un anno precedente (progetti "Carry Over" con
    // Analisi iniziata nel 2025 - gia' avvenuta prima dell'asse di quest'anno), poi
    // tiene una sequenza di date valide, fermandosi alla prima fase non ancora raggiunta.
    let start = 0;
    while (start < milestoneDates.length && isValidIsoDate(milestoneDates[start]) && yearOf(milestoneDates[start]) < REPORT_YEAR) {
      start++;
    }
    const validDates: { date: string; phaseIndex: number }[] = [];
    for (let k = start; k < milestoneDates.length; k++) {
      const d = milestoneDates[k];
      if (!isValidIsoDate(d) || yearOf(d) < REPORT_YEAR) break;
      validDates.push({ date: d, phaseIndex: k });
    }

    for (let s = 0; s < validDates.length - 1; s++) {
      const x1 = dateX(validDates[s].date);
      const x2 = dateX(validDates[s + 1].date);
      pSlide.addShape("rect" as never, {
        x: emuToIn(x1), y: emuToIn(TIMELINE_ROW1.trackY + y0), w: emuToIn(Math.max(0, x2 - x1)), h: emuToIn(266700),
        fill: { color: PHASE_COLORS[validDates[s].phaseIndex] }, line: { type: "none" },
      } as never);
    }

    // Riquadro largo + wrap disabilitato cosi' "17/06" non va mai a capo (centrato
    // sul punto della milestone). Ogni data ha anche un pallino colorato per fase,
    // cosi' resta chiaro a quale fase appartiene anche quando non segue un segmento.
    const DATE_LABEL_W = 750000;
    const DATE_DOT_D = 114300;
    validDates.forEach(({ date, phaseIndex }, di) => {
      const x = dateX(date);
      const above = di % 2 === 0;
      const phaseColor = PHASE_COLORS[phaseIndex];
      pSlide.addShape("ellipse" as never, {
        x: emuToIn(x - DATE_DOT_D / 2), y: emuToIn(TIMELINE_ROW1.trackY + y0 + (266700 - DATE_DOT_D) / 2),
        w: emuToIn(DATE_DOT_D), h: emuToIn(DATE_DOT_D), fill: { color: phaseColor }, line: { color: "FFFFFF", width: 0.75 },
      } as never);
      pSlide.addText(formatDateLabel(date), {
        x: emuToIn(x - DATE_LABEL_W / 2), y: emuToIn((above ? TIMELINE_ROW1.dateAboveY : TIMELINE_ROW1.dateBelowY) + y0),
        w: emuToIn(DATE_LABEL_W), h: emuToIn(214313), fontFace: FONT, fontSize: 11.25,
        bold: di === validDates.length - 1, color: "8E8E8E", align: "center", wrap: false,
      } as never);
    });

    const ragColor = TIMELINE_RAG_COLORS[row.rag] || "C9C9C9";
    pSlide.addShape("ellipse" as never, {
      x: emuToIn(TIMELINE_RAG_DOT_X), y: emuToIn(TIMELINE_ROW1.ragDotY + y0), w: emuToIn(TIMELINE_RAG_DOT_D), h: emuToIn(TIMELINE_RAG_DOT_D),
      fill: { color: ragColor }, line: { type: "none" },
    } as never);

    pSlide.addText(row.note, {
      x: emuToIn(TIMELINE_NOTE_X), y: emuToIn(TIMELINE_ROW1.noteY + y0), w: emuToIn(TIMELINE_NOTE_W), h: emuToIn(933450),
      fontFace: FONT, fontSize: 14.25, color: "4F4F4F", valign: "top",
    } as never);

    y0 += rowHeight;
  });
}

// ---------------------------------------------------------------------------
// Generazione del file .pptx completo
// ---------------------------------------------------------------------------

// Scopre a runtime i nomi delle shape "dinamiche" da rimuovere da una slide del
// template (righe/esempi gia' presenti), invece di trascriverli a mano: tutto cio'
// che sta tra l'ultima shape statica e la prima shape statica successiva (footer o
// legenda) e' contenuto dinamico da rigenerare.
async function getDynamicShapeNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pres: any,
  slideNumber: number,
  firstDynamicName: string,
  firstNameAfter: string
): Promise<string[]> {
  const info = await pres.getInfo();
  const slide = info.slideByNumber("src", slideNumber);
  const names: string[] = slide.elements.map((e: { name: string }) => e.name);
  const startIdx = names.indexOf(firstDynamicName);
  const endIdx = names.indexOf(firstNameAfter);
  return names.slice(startIdx, endIdx);
}

export async function generateReportPptx(): Promise<Buffer> {
  const automizer = new Automizer({
    templateDir: TEMPLATE_DIR,
    outputDir: os.tmpdir(),
    removeExistingSlides: true,
    verbosity: 0,
  });

  const pres = automizer.loadRoot(TEMPLATE_FILE).load(TEMPLATE_FILE, "src");

  const [ragRosso, ragGiallo, timelineRows] = await Promise.all([
    getRagRows("Rosso"),
    getRagRows("Giallo"),
    getTimelineRows(),
  ]);

  const rossoShapeNames = await getDynamicShapeNames(pres, 3, "Shape 12", "Text 65");
  const gialloShapeNames = await getDynamicShapeNames(pres, 4, "Shape 12", "Text 50");
  const timelineShapeNames = await getDynamicShapeNames(pres, 10, "Shape 21", "Shape 71");

  const rossoPages = paginateRagRows(ragRosso);
  const gialloPages = paginateRagRows(ragGiallo);

  const byArea = new Map<string, TimelineRow[]>();
  for (const row of timelineRows) {
    if (!byArea.has(row.area)) byArea.set(row.area, []);
    byArea.get(row.area)!.push(row);
  }
  const areaPages: { area: string; dominio: string; pageRows: TimelineRow[]; pageIndex: number; totalPages: number }[] = [];
  for (const [area, rows] of byArea) {
    const pages = paginateFixed(rows, MAX_TIMELINE_ROWS_PER_PAGE);
    pages.forEach((pageRows, pageIndex) => {
      areaPages.push({ area, dominio: rows[0]?.dominio ?? "", pageRows, pageIndex, totalPages: pages.length });
    });
  }

  for (let slideNumber = 1; slideNumber <= 10; slideNumber++) {
    if (slideNumber === 3) {
      rossoPages.forEach((pageRows, pageIndex) => {
        pres.addSlide("src", 3, (slide: ISlide) => {
          slide.removeElement("Text 1");
          slide.removeElement("Text 4");
          slide.removeElement("Shape 3");
          if (pageIndex > 0) slide.removeElement("Text 2");
          rossoShapeNames.forEach((name) => slide.removeElement(name));
          slide.generate((pSlide) => renderRagSlide(pSlide, pageRows, "Rosso", { isContinuation: pageIndex > 0, totalCount: ragRosso.length }));
        });
      });
      continue;
    }
    if (slideNumber === 4) {
      gialloPages.forEach((pageRows, pageIndex) => {
        pres.addSlide("src", 4, (slide: ISlide) => {
          slide.removeElement("Text 1");
          slide.removeElement("Text 4");
          slide.removeElement("Shape 3");
          if (pageIndex > 0) slide.removeElement("Text 2");
          gialloShapeNames.forEach((name) => slide.removeElement(name));
          slide.generate((pSlide) => renderRagSlide(pSlide, pageRows, "Giallo", { isContinuation: pageIndex > 0, totalCount: ragGiallo.length }));
        });
      });
      continue;
    }
    if (slideNumber === 10) {
      areaPages.forEach(({ area, dominio, pageRows, pageIndex, totalPages }) => {
        pres.addSlide("src", 10, (slide: ISlide) => {
          slide.removeElement("Text 2");
          slide.removeElement("Text 3");
          timelineShapeNames.forEach((name) => slide.removeElement(name));
          slide.generate((pSlide) => renderTimelineSlide(pSlide, pageRows, { area, dominio, pageIndex, totalPages }));
        });
      });
      continue;
    }
    pres.addSlide("src", slideNumber);
  }

  const zip = await pres.getJSZip();
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer;
}
