"use client";

import { useRef, useState } from "react";
import type { CustomColumnDef } from "@/lib/types";

interface Props {
  rowKey: string;
  column: CustomColumnDef;
  value: unknown;
  onSaved: (rowKey: string, key: string, value: unknown) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function fallbackFor(type: CustomColumnDef["type"]) {
  return type === "checkbox" ? false : "";
}

export default function EditableCell({ rowKey, column, value, onSaved }: Props) {
  // Pattern "adjust state during render" (vedi react.dev): evita un useEffect
  // che farebbe scattare un render aggiuntivo ogni volta che il valore
  // esterno cambia (es. dopo il salvataggio o un refresh dei dati).
  const [prevValue, setPrevValue] = useState(value);
  const [localValue, setLocalValue] = useState<unknown>(value ?? fallbackFor(column.type));
  if (value !== prevValue) {
    setPrevValue(value);
    setLocalValue(value ?? fallbackFor(column.type));
  }
  const [state, setState] = useState<SaveState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(next: unknown) {
    setState("saving");
    try {
      const res = await fetch(`/api/rows/${encodeURIComponent(rowKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [column.key]: next }),
      });
      if (!res.ok) throw new Error("save failed");
      setState("saved");
      onSaved(rowKey, column.key, next);
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch {
      setState("error");
    }
  }

  function handleChange(next: unknown, immediate = false) {
    setLocalValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) {
      persist(next);
    } else {
      debounceRef.current = setTimeout(() => persist(next), 600);
    }
  }

  const baseInputClasses =
    "w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-gray-300 focus:border-gray-400 focus:bg-white focus:outline-none";

  let field: React.ReactNode;
  switch (column.type) {
    case "checkbox":
      field = (
        <input
          type="checkbox"
          checked={Boolean(localValue)}
          onChange={(e) => handleChange(e.target.checked, true)}
          className="h-4 w-4"
        />
      );
      break;
    case "select":
      field = (
        <select
          value={String(localValue ?? "")}
          onChange={(e) => handleChange(e.target.value, true)}
          className={baseInputClasses}
        >
          <option value="" />
          {(column.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    case "date":
      field = (
        <input
          type="date"
          value={String(localValue ?? "")}
          onChange={(e) => handleChange(e.target.value, true)}
          className={baseInputClasses}
        />
      );
      break;
    case "number":
      field = (
        <input
          type="number"
          value={String(localValue ?? "")}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => handleChange(e.target.value, true)}
          className={baseInputClasses}
        />
      );
      break;
    case "textarea":
      field = (
        <textarea
          value={String(localValue ?? "")}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => handleChange(e.target.value, true)}
          rows={1}
          className={`${baseInputClasses} resize-y`}
        />
      );
      break;
    default:
      field = (
        <input
          type="text"
          value={String(localValue ?? "")}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => handleChange(e.target.value, true)}
          className={baseInputClasses}
        />
      );
  }

  return (
    <div className="relative">
      {field}
      {state === "saving" && (
        <span className="absolute -top-1 right-1 text-[10px] text-gray-400">...</span>
      )}
      {state === "error" && (
        <span className="absolute -top-1 right-1 text-[10px] text-red-500">!</span>
      )}
    </div>
  );
}
