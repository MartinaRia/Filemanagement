"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectDateHeaders, findStatusHeader, guessLabelHeader, parseFlexibleDate } from "@/lib/dates";
import type { CustomColumnDef, MergedRow } from "@/lib/types";

interface Props {
  rows: MergedRow[];
  sourceHeaders: string[];
  columnDefs: CustomColumnDef[];
}

interface FilterColumn {
  id: string;
  label: string;
  getValue: (row: MergedRow) => string;
}

// Palette categorica fissa (skill dataviz): l'ordine degli slot e' il
// meccanismo di sicurezza per il daltonismo, non va ciclato ne' riordinato.
const PALETTE = [
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
  "#eda100", // yellow
  "#1baf7a", // aqua
  "#eb6834", // orange
  "#4a3aa7", // violet
  "#e34948", // red
];
const OTHER_COLOR = "#898781";

const LABEL_WIDTH = 220;
const ROW_HEIGHT = 30;
const LINE_WIDTH = 4;
const MARKER_R = 6;
const BASE_PX_PER_DAY = 6;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const WEEKLY_TICK_THRESHOLD = 9; // px/giorno oltre cui passiamo a tacche settimanali
const PADDING_DAYS = 10;
const DAY_MS = 86_400_000;

interface Point {
  header: string;
  date: Date;
  x: number;
}

interface RowEntry {
  rowKey: string;
  label: string;
  points: Point[];
}

interface HoverInfo {
  x: number;
  y: number;
  rowLabel: string;
  header: string;
  dateLabel: string;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function GanttChart({ rows, sourceHeaders, columnDefs }: Props) {
  const dateHeaders = useMemo(() => detectDateHeaders(rows, sourceHeaders), [rows, sourceHeaders]);
  const statusHeader = useMemo(() => findStatusHeader(sourceHeaders), [sourceHeaders]);
  const [labelHeader, setLabelHeader] = useState(() => guessLabelHeader(sourceHeaders, dateHeaders));
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [dateFilterHeader, setDateFilterHeader] = useState("");
  const [dateFilterMonth, setDateFilterMonth] = useState("");
  const [labelSort, setLabelSort] = useState<"none" | "asc" | "desc">("none");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Elenco di tutte le colonne (sorgente + personalizzate) disponibili anche
  // in tabella: si adatta da solo al file caricato, nessun nome hardcoded.
  const allColumns: FilterColumn[] = useMemo(() => {
    const sourceCols: FilterColumn[] = sourceHeaders.map((header) => ({
      id: `src:${header}`,
      label: header,
      getValue: (row) => row.source[header] ?? "",
    }));
    const customCols: FilterColumn[] = columnDefs.map((def) => ({
      id: `custom:${def.key}`,
      label: def.label,
      getValue: (row) => String(row.custom[def.key] ?? ""),
    }));
    return [...sourceCols, ...customCols];
  }, [sourceHeaders, columnDefs]);

  const columnUniqueValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const col of allColumns) {
      const values = new Set<string>();
      for (const row of rows) {
        const v = col.getValue(row).trim();
        if (v) values.add(v);
      }
      result[col.id] = Array.from(values).sort((a, b) => a.localeCompare(b)).slice(0, 200);
    }
    return result;
  }, [rows, allColumns]);

  const activeColumnFilterCount = Object.values(columnFilters).filter((v) => v.length > 0).length;

  function setColumnFilterTerms(columnId: string, terms: string[]) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (terms.length === 0) delete next[columnId];
      else next[columnId] = terms;
      return next;
    });
  }

  useEffect(() => {
    if (!statusMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusMenuOpen]);

  const colorFor = (header: string) => {
    const idx = dateHeaders.indexOf(header);
    return idx >= 0 && idx < PALETTE.length ? PALETTE[idx] : OTHER_COLOR;
  };

  const statusValues = useMemo(() => {
    if (!statusHeader) return [];
    const values = new Set<string>();
    for (const row of rows) {
      const v = row.source[statusHeader]?.trim();
      if (v) values.add(v);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows, statusHeader]);

  const visibleRows = useMemo(() => {
    if (!statusHeader || statusFilter.length === 0) return rows;
    return rows.filter((row) => statusFilter.includes(row.source[statusHeader]?.trim() ?? ""));
  }, [rows, statusHeader, statusFilter]);

  // Filtra ulteriormente per una colonna data che cade in un dato mese
  // (es. "Avvio Sviluppi Actual" nel mese di settembre '26).
  const filteredRows = useMemo(() => {
    if (!dateFilterHeader || !dateFilterMonth) return visibleRows;
    const [yearStr, monthStr] = dateFilterMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    return visibleRows.filter((row) => {
      const d = parseFlexibleDate(row.source[dateFilterHeader] ?? "");
      return d ? d.getFullYear() === year && d.getMonth() + 1 === month : false;
    });
  }, [visibleRows, dateFilterHeader, dateFilterMonth]);

  // Filtri generici per colonna (stesso comportamento multi-termine/OR della
  // tabella): combinati in AND tra loro e con i filtri stato/mese sopra.
  const columnFilteredRows = useMemo(() => {
    const active = Object.entries(columnFilters).filter(([, terms]) => terms.length > 0);
    if (active.length === 0) return filteredRows;
    const cols = new Map(allColumns.map((c) => [c.id, c]));
    return filteredRows.filter((row) =>
      active.every(([columnId, terms]) => {
        const col = cols.get(columnId);
        if (!col) return true;
        const cell = col.getValue(row).toLowerCase();
        return terms.some((term) => cell.includes(term.toLowerCase()));
      })
    );
  }, [filteredRows, columnFilters, allColumns]);

  const allDates = useMemo(() => {
    const dates: Date[] = [];
    for (const row of columnFilteredRows) {
      for (const header of dateHeaders) {
        const d = parseFlexibleDate(row.source[header] ?? "");
        if (d) dates.push(d);
      }
    }
    return dates;
  }, [columnFilteredRows, dateHeaders]);

  if (dateHeaders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Nessuna colonna data e&apos; stata riconosciuta automaticamente nel file caricato.
      </div>
    );
  }

  function toggleStatus(value: string) {
    setStatusFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  if (allDates.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <StatusFilter
            statusHeader={statusHeader}
            statusValues={statusValues}
            statusFilter={statusFilter}
            open={statusMenuOpen}
            setOpen={setStatusMenuOpen}
            toggle={toggleStatus}
            clear={() => setStatusFilter([])}
            menuRef={statusMenuRef}
          />
          <DateFilter
            dateHeaders={dateHeaders}
            dateFilterHeader={dateFilterHeader}
            setDateFilterHeader={setDateFilterHeader}
            dateFilterMonth={dateFilterMonth}
            setDateFilterMonth={setDateFilterMonth}
          />
          <FilterDrawerButton
            activeCount={activeColumnFilterCount}
            onClick={() => setFiltersOpen(true)}
          />
        </div>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Nessuna riga con date valide per i filtri selezionati.
        </div>
        <ColumnFiltersDrawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          columns={allColumns}
          uniqueValues={columnUniqueValues}
          filters={columnFilters}
          setTerms={setColumnFilterTerms}
          clearAll={() => setColumnFilters({})}
        />
      </div>
    );
  }

  const pxPerDay = BASE_PX_PER_DAY * zoom;

  const minRaw = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxRaw = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const minDate = new Date(minRaw.getTime() - PADDING_DAYS * DAY_MS);
  const maxDate = new Date(maxRaw.getTime() + PADDING_DAYS * DAY_MS);
  const totalDays = Math.max(1, daysBetween(minDate, maxDate));
  const timelineWidth = Math.max(600, totalDays * pxPerDay);

  const xFor = (d: Date) => daysBetween(minDate, d) * pxPerDay;

  const rowEntries: RowEntry[] = columnFilteredRows
    .map((row) => {
      const points = dateHeaders
        .map((header) => {
          const d = parseFlexibleDate(row.source[header] ?? "");
          return d ? { header, date: d, x: xFor(d) } : null;
        })
        .filter((p): p is Point => p !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      return {
        rowKey: row.rowKey,
        label: row.source[labelHeader]?.trim() || row.rowKey,
        points,
      };
    })
    .filter((entry) => entry.points.length > 0)
    .sort((a, b) => a.points[0].date.getTime() - b.points[0].date.getTime());

  // Ordinamento per etichetta di riga (colonna scelta in "Etichetta riga:"):
  // quando attivo sostituisce l'ordinamento cronologico di default.
  if (labelSort !== "none") {
    rowEntries.sort((a, b) => {
      const cmp = a.label.localeCompare(b.label, "it", { numeric: true, sensitivity: "base" });
      return labelSort === "asc" ? cmp : -cmp;
    });
  }

  const skippedCount = columnFilteredRows.length - rowEntries.length;

  const ticks: { x: number; label: string }[] = [];
  if (pxPerDay >= WEEKLY_TICK_THRESHOLD) {
    const cursor = new Date(minDate);
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() + (day === 0 ? -6 : 1 - day)); // torna al lunedi'
    while (cursor <= maxDate) {
      const x = xFor(cursor);
      if (x >= 0) {
        ticks.push({ x, label: cursor.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      const x = xFor(cursor);
      if (x >= 0) {
        ticks.push({ x, label: cursor.toLocaleDateString("it-IT", { month: "short", year: "numeric" }) });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Bande alternate per mese (gennaio/marzo/... vs febbraio/aprile/...), a
  // prescindere dal livello di zoom: solo i mesi "pari" (Feb, Apr, ...)
  // ricevono una tinta, i mesi "dispari" restano sullo sfondo bianco.
  const monthBands: { key: string; x: number; width: number }[] = [];
  {
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      if (cursor.getMonth() % 2 === 1) {
        const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const xStart = Math.max(0, xFor(cursor));
        const xEnd = Math.min(timelineWidth, xFor(nextMonth));
        const width = xEnd - xStart;
        if (width > 0) {
          monthBands.push({ key: `${cursor.getFullYear()}-${cursor.getMonth()}`, x: xStart, width });
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Etichetta riga:</span>
          <select
            value={labelHeader}
            onChange={(e) => setLabelHeader(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {sourceHeaders.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              setLabelSort((s) => (s === "none" ? "asc" : s === "asc" ? "desc" : "none"))
            }
            title="Ordina per l'etichetta di riga"
            className={`rounded-md border px-2 py-1 text-sm ${
              labelSort !== "none"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {labelSort === "asc" && "A → Z ▲"}
            {labelSort === "desc" && "Z → A ▼"}
            {labelSort === "none" && "Ordina ↕"}
          </button>
        </div>

        <StatusFilter
          statusHeader={statusHeader}
          statusValues={statusValues}
          statusFilter={statusFilter}
          open={statusMenuOpen}
          setOpen={setStatusMenuOpen}
          toggle={toggleStatus}
          clear={() => setStatusFilter([])}
          menuRef={statusMenuRef}
        />

        <DateFilter
          dateHeaders={dateHeaders}
          dateFilterHeader={dateFilterHeader}
          setDateFilterHeader={setDateFilterHeader}
          dateFilterMonth={dateFilterMonth}
          setDateFilterMonth={setDateFilterMonth}
        />

        <FilterDrawerButton
          activeCount={activeColumnFilterCount}
          onClick={() => setFiltersOpen(true)}
        />

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Zoom:</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.3).toFixed(2)))}
            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            −
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-28"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.3).toFixed(2)))}
            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            +
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {dateHeaders.map((header) => (
            <span key={header} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: colorFor(header) }}
              />
              {header}
            </span>
          ))}
        </div>

        <span className="ml-auto text-sm text-gray-400">
          {rowEntries.length} {rowEntries.length === 1 ? "riga" : "righe"}
          {skippedCount > 0 && ` (${skippedCount} senza date valide)`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 bg-white">
        <div style={{ width: LABEL_WIDTH + timelineWidth }}>
          <div className="sticky top-0 z-20 flex border-b border-gray-200 bg-gray-50">
            <div className="sticky left-0 z-20 flex h-8 w-[220px] shrink-0 items-center border-r border-gray-200 bg-gray-50 px-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              {labelHeader}
            </div>
            <div className="relative h-8" style={{ width: timelineWidth }}>
              {monthBands.map((band) => (
                <div
                  key={band.key}
                  className="absolute top-0 z-0 h-full bg-gray-100"
                  style={{ left: band.x, width: band.width }}
                />
              ))}
              {ticks.map((tick) => (
                <div
                  key={tick.x}
                  className="absolute top-0 z-10 flex h-full items-center border-l border-gray-200 pl-1.5 text-xs whitespace-nowrap text-gray-500"
                  style={{ left: tick.x }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-0"
              style={{ left: LABEL_WIDTH, width: timelineWidth }}
            >
              {monthBands.map((band) => (
                <div
                  key={band.key}
                  className="absolute top-0 bottom-0 bg-gray-50"
                  style={{ left: band.x, width: band.width }}
                />
              ))}
              {ticks.map((tick) => (
                <div
                  key={tick.x}
                  className="absolute top-0 bottom-0 w-px bg-gray-100"
                  style={{ left: tick.x }}
                />
              ))}
            </div>

            <div className="relative z-10">
              {rowEntries.map((entry) => (
                <div
                  key={entry.rowKey}
                  className="flex border-b border-gray-100 last:border-0 hover:bg-gray-50/70"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="sticky left-0 z-10 flex w-[220px] shrink-0 items-center truncate border-r border-gray-100 bg-white px-3 text-sm text-gray-700"
                    title={entry.label}
                  >
                    {entry.label}
                  </div>
                  <div style={{ width: timelineWidth, height: ROW_HEIGHT }}>
                    <svg width={timelineWidth} height={ROW_HEIGHT}>
                      {entry.points.slice(1).map((point, i) => {
                        const prev = entry.points[i];
                        return (
                          <line
                            key={`${point.header}-seg`}
                            x1={prev.x}
                            y1={ROW_HEIGHT / 2}
                            x2={point.x}
                            y2={ROW_HEIGHT / 2}
                            stroke={colorFor(point.header)}
                            strokeWidth={LINE_WIDTH}
                            strokeLinecap="round"
                          />
                        );
                      })}
                      {entry.points.map((point) => (
                        <circle
                          key={point.header}
                          cx={point.x}
                          cy={ROW_HEIGHT / 2}
                          r={MARKER_R}
                          fill={colorFor(point.header)}
                          stroke="#ffffff"
                          strokeWidth={2}
                          onMouseEnter={(e) =>
                            setHover({
                              x: e.clientX,
                              y: e.clientY,
                              rowLabel: entry.label,
                              header: point.header,
                              dateLabel: formatDate(point.date),
                            })
                          }
                          onMouseMove={(e) =>
                            setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                          }
                          onMouseLeave={() => setHover(null)}
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-30 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium text-gray-900">{hover.rowLabel}</div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: colorFor(hover.header) }}
            />
            {hover.header}: {hover.dateLabel}
          </div>
        </div>
      )}

      <ColumnFiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        columns={allColumns}
        uniqueValues={columnUniqueValues}
        filters={columnFilters}
        setTerms={setColumnFilterTerms}
        clearAll={() => setColumnFilters({})}
      />
    </div>
  );
}

interface StatusFilterProps {
  statusHeader: string | null;
  statusValues: string[];
  statusFilter: string[];
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: (value: string) => void;
  clear: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

function StatusFilter({
  statusHeader,
  statusValues,
  statusFilter,
  open,
  setOpen,
  toggle,
  clear,
  menuRef,
}: StatusFilterProps) {
  if (!statusHeader) return null;

  return (
    <div ref={menuRef} className="relative flex items-center gap-2 text-sm text-gray-600">
      <span>{statusHeader}:</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`rounded-md border px-2 py-1 text-sm ${
          statusFilter.length > 0
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {statusFilter.length > 0 ? `${statusFilter.length} selezionati` : "Tutti"} ▾
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-gray-200 bg-white p-1.5 shadow-lg">
          {statusValues.length === 0 && (
            <p className="px-1 py-1 text-xs text-gray-400">Nessun valore</p>
          )}
          {statusValues.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={statusFilter.includes(value)}
                onChange={() => toggle(value)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
          {statusFilter.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="mt-1 w-full rounded px-1 py-1 text-left text-xs text-red-500 hover:bg-red-50"
            >
              Cancella filtro
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DateFilterProps {
  dateHeaders: string[];
  dateFilterHeader: string;
  setDateFilterHeader: (v: string) => void;
  dateFilterMonth: string;
  setDateFilterMonth: (v: string) => void;
}

function DateFilter({
  dateHeaders,
  dateFilterHeader,
  setDateFilterHeader,
  dateFilterMonth,
  setDateFilterMonth,
}: DateFilterProps) {
  const active = dateFilterHeader && dateFilterMonth;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>Filtra per data:</span>
      <select
        value={dateFilterHeader}
        onChange={(e) => setDateFilterHeader(e.target.value)}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="">Nessun filtro</option>
        {dateHeaders.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      {dateFilterHeader && (
        <input
          type="month"
          value={dateFilterMonth}
          onChange={(e) => setDateFilterMonth(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      )}
      {active && (
        <button
          type="button"
          onClick={() => {
            setDateFilterHeader("");
            setDateFilterMonth("");
          }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancella
        </button>
      )}
    </div>
  );
}

function FilterDrawerButton({
  activeCount,
  onClick,
}: {
  activeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-sm ${
        activeCount > 0
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      Filtri colonne{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}

interface ColumnFiltersDrawerProps {
  open: boolean;
  onClose: () => void;
  columns: FilterColumn[];
  uniqueValues: Record<string, string[]>;
  filters: Record<string, string[]>;
  setTerms: (columnId: string, terms: string[]) => void;
  clearAll: () => void;
}

// Pannello laterale con un filtro multi-termine per ogni colonna presente in
// tabella (sorgente + personalizzate): si adatta al file caricato, non ha
// colonne cablate nel codice.
function ColumnFiltersDrawer({
  open,
  onClose,
  columns,
  uniqueValues,
  filters,
  setTerms,
  clearAll,
}: ColumnFiltersDrawerProps) {
  if (!open) return null;

  const activeCount = Object.values(filters).filter((v) => v.length > 0).length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative z-10 flex h-full w-80 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Filtri colonne</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="self-start text-xs text-red-500 hover:text-red-700"
          >
            Cancella tutti i filtri colonna ({activeCount})
          </button>
        )}

        {columns.length === 0 && (
          <p className="text-xs text-gray-400">Nessuna colonna disponibile.</p>
        )}

        {columns.map((col) => (
          <ColumnFilterRow
            key={col.id}
            label={col.label}
            values={uniqueValues[col.id] ?? []}
            terms={filters[col.id] ?? []}
            setTerms={(terms) => setTerms(col.id, terms)}
          />
        ))}
      </div>
    </div>
  );
}

interface ColumnFilterRowProps {
  label: string;
  values: string[];
  terms: string[];
  setTerms: (terms: string[]) => void;
}

function ColumnFilterRow({ label, values, terms, setTerms }: ColumnFilterRowProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);

  function addTerms(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTerms(Array.from(new Set([...terms, ...parts])));
    setDraft("");
  }

  function removeTerm(term: string) {
    setTerms(terms.filter((t) => t !== term));
  }

  function toggleValue(value: string) {
    if (terms.includes(value)) removeTerm(value);
    else setTerms([...terms, value]);
  }

  return (
    <div className="border-b border-gray-100 pb-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-gray-600" title={label}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          title="Scegli valori"
          className={`shrink-0 text-xs ${
            terms.length > 0 ? "text-blue-600" : "text-gray-300 hover:text-gray-500"
          }`}
        >
          ▾
        </button>
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTerms(draft);
          }
        }}
        placeholder="Filtra..."
        className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />

      {terms.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {terms.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700"
            >
              <span className="max-w-24 truncate">{t}</span>
              <button
                type="button"
                onClick={() => removeTerm(t)}
                className="text-blue-500 hover:text-blue-800"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-1 max-h-40 overflow-auto rounded border border-gray-100 p-1">
          {values.length === 0 && <p className="px-1 py-1 text-xs text-gray-400">Nessun valore</p>}
          {values.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={terms.includes(value)}
                onChange={() => toggleValue(value)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
