"use client";

import { useEffect, useRef, useState } from "react";
import type { Column } from "@tanstack/react-table";
import type { MergedRow } from "@/lib/types";

interface Props {
  column: Column<MergedRow, unknown>;
}

export default function ColumnFilterMenu({ column }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const terms = (column.getFilterValue() as string[] | undefined) ?? [];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function addTerms(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    column.setFilterValue(Array.from(new Set([...terms, ...parts])));
    setDraft("");
  }

  function removeTerm(term: string) {
    const next = terms.filter((t) => t !== term);
    column.setFilterValue(next.length ? next : undefined);
  }

  function toggleValue(value: string) {
    if (terms.includes(value)) {
      removeTerm(value);
    } else {
      column.setFilterValue([...terms, value]);
    }
  }

  const uniqueValues = Array.from(column.getFacetedUniqueValues().keys())
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 200);

  return (
    <div ref={containerRef} className="relative mt-1">
      <div className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTerms(draft);
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder="Filtra..."
          className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs font-normal normal-case focus:border-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Scegli valori"
          className={`shrink-0 rounded px-1 text-xs ${
            terms.length > 0 ? "text-blue-600" : "text-gray-300 hover:text-gray-500"
          }`}
        >
          ▾
        </button>
      </div>

      {terms.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {terms.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-normal normal-case text-blue-700"
            >
              <span className="max-w-20 truncate">{t}</span>
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

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-56 w-48 overflow-auto rounded-md border border-gray-200 bg-white p-1.5 shadow-lg">
          {uniqueValues.length === 0 && (
            <p className="px-1 py-1 text-xs font-normal normal-case text-gray-400">Nessun valore</p>
          )}
          {uniqueValues.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs font-normal normal-case text-gray-700 hover:bg-gray-50"
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
          {terms.length > 0 && (
            <button
              type="button"
              onClick={() => column.setFilterValue(undefined)}
              className="mt-1 w-full rounded px-1 py-1 text-left text-xs font-normal normal-case text-red-500 hover:bg-red-50"
            >
              Cancella filtro
            </button>
          )}
        </div>
      )}
    </div>
  );
}
