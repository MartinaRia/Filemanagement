"use client";

import { useMemo, useState } from "react";
import { detectDateHeaders, guessLabelHeader, parseFlexibleDate } from "@/lib/dates";
import type { MergedRow } from "@/lib/types";

interface Props {
  rows: MergedRow[];
  sourceHeaders: string[];
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
const ROW_HEIGHT = 40;
const PX_PER_DAY = 6;
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

export default function GanttChart({ rows, sourceHeaders }: Props) {
  const dateHeaders = useMemo(() => detectDateHeaders(rows, sourceHeaders), [rows, sourceHeaders]);
  const [labelHeader, setLabelHeader] = useState(() => guessLabelHeader(sourceHeaders, dateHeaders));
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const colorFor = (header: string) => {
    const idx = dateHeaders.indexOf(header);
    return idx >= 0 && idx < PALETTE.length ? PALETTE[idx] : OTHER_COLOR;
  };

  const allDates = useMemo(() => {
    const dates: Date[] = [];
    for (const row of rows) {
      for (const header of dateHeaders) {
        const d = parseFlexibleDate(row.source[header] ?? "");
        if (d) dates.push(d);
      }
    }
    return dates;
  }, [rows, dateHeaders]);

  if (dateHeaders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Nessuna colonna data e&apos; stata riconosciuta automaticamente nel file caricato.
      </div>
    );
  }

  const minRaw = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxRaw = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const minDate = new Date(minRaw.getTime() - PADDING_DAYS * DAY_MS);
  const maxDate = new Date(maxRaw.getTime() + PADDING_DAYS * DAY_MS);
  const totalDays = Math.max(1, daysBetween(minDate, maxDate));
  const timelineWidth = Math.max(600, totalDays * PX_PER_DAY);

  const xFor = (d: Date) => daysBetween(minDate, d) * PX_PER_DAY;

  const rowEntries: RowEntry[] = rows
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

  const skippedCount = rows.length - rowEntries.length;

  const monthTicks: { x: number; label: string }[] = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor <= maxDate) {
    const x = xFor(cursor);
    if (x >= 0) {
      monthTicks.push({
        x,
        label: cursor.toLocaleDateString("it-IT", { month: "short", year: "numeric" }),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
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
              {monthTicks.map((tick) => (
                <div
                  key={tick.x}
                  className="absolute top-0 flex h-full items-center border-l border-gray-200 pl-1.5 text-xs whitespace-nowrap text-gray-500"
                  style={{ left: tick.x }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute top-0 bottom-0"
              style={{ left: LABEL_WIDTH, width: timelineWidth }}
            >
              {monthTicks.map((tick) => (
                <div
                  key={tick.x}
                  className="absolute top-0 bottom-0 w-px bg-gray-100"
                  style={{ left: tick.x }}
                />
              ))}
            </div>

            {rowEntries.map((entry) => (
              <div
                key={entry.rowKey}
                className="flex border-b border-gray-100 last:border-0 hover:bg-gray-50"
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
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      );
                    })}
                    {entry.points.map((point) => (
                      <circle
                        key={point.header}
                        cx={point.x}
                        cy={ROW_HEIGHT / 2}
                        r={5}
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
    </div>
  );
}
