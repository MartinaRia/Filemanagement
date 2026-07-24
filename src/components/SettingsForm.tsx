"use client";

import Link from "next/link";
import { useState } from "react";
import type { CustomColumnDef } from "@/lib/types";

interface AppConfig {
  worksheetName: string;
  keyColumn: string;
  worksheetName2: string;
  keyColumn2: string;
}

interface Props {
  initialConfig: AppConfig;
  initialColumnDefs: CustomColumnDef[];
}

export default function SettingsForm({ initialConfig, initialColumnDefs }: Props) {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [columnDefs, setColumnDefs] = useState<CustomColumnDef[]>(initialColumnDefs);
  const [saving, setSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [columnMessage, setColumnMessage] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState({ key: "", label: "", type: "text", options: "" });

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setConfigMessage(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const body = await res.json();
      if (!res.ok) {
        setConfigMessage(`Errore: ${JSON.stringify(body.error)}`);
        return;
      }
      setConfigMessage("Configurazione salvata.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddColumn(e: React.FormEvent) {
    e.preventDefault();
    setColumnMessage(null);
    const res = await fetch("/api/config/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: newColumn.key,
        label: newColumn.label,
        type: newColumn.type,
        options:
          newColumn.type === "select"
            ? newColumn.options.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setColumnMessage(`Errore: ${JSON.stringify(body.error)}`);
      return;
    }
    setColumnDefs((prev) => [...prev, body.column]);
    setNewColumn({ key: "", label: "", type: "text", options: "" });
  }

  async function handleDeleteColumn(id: string) {
    if (!confirm("Eliminare questa colonna personalizzata? I valori salvati non saranno più mostrati.")) return;
    await fetch(`/api/config/columns/${id}`, { method: "DELETE" });
    setColumnDefs((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Impostazioni</h1>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
          ← Torna ai dati
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold">Lettura del file caricato</h2>
        <p className="mb-4 text-xs text-gray-500">
          Il file Excel si carica dalla pagina principale (pulsante &quot;Carica nuovo file Excel&quot;) ogni volta
          che vuoi aggiornare i dati. Qui puoi indicare quale foglio leggere e quale colonna usare come
          identificatore univoco di riga.
        </p>
        <form onSubmit={handleSaveConfig} className="flex flex-col gap-3">
          <Field
            label="Nome del foglio da leggere (vuoto = primo foglio del file)"
            placeholder="Foglio1"
            value={config.worksheetName}
            onChange={(v) => setConfig({ ...config, worksheetName: v })}
          />
          <Field
            label="Colonna identificativa univoca (opzionale, es. A)"
            placeholder="A"
            value={config.keyColumn}
            onChange={(v) => setConfig({ ...config, keyColumn: v })}
          />
          <Field
            label="Secondo foglio (opzionale, es. per il report PPT)"
            placeholder="Foglio2"
            value={config.worksheetName2}
            onChange={(v) => setConfig({ ...config, worksheetName2: v })}
          />
          <Field
            label="Colonna identificativa del secondo foglio (deve corrispondere alla stessa chiave del primo, es. A)"
            placeholder="A"
            value={config.keyColumn2}
            onChange={(v) => setConfig({ ...config, keyColumn2: v })}
          />

          <button
            type="submit"
            disabled={saving}
            className="mt-2 w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva"}
          </button>
          {configMessage && <p className="text-sm text-gray-600">{configMessage}</p>}
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold">Colonne personalizzate</h2>
        <p className="mb-4 text-xs text-gray-500">
          Colonne aggiuntive editabili (note, priorità, stato, ecc.), non presenti nel file Excel: i valori restano
          salvati anche quando i dati del file vengono aggiornati.
        </p>

        <ul className="mb-4 flex flex-col divide-y divide-gray-100">
          {columnDefs.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <strong>{c.label}</strong>{" "}
                <span className="text-gray-400">
                  ({c.key} · {c.type}
                  {c.options?.length ? `: ${c.options.join(", ")}` : ""})
                </span>
              </span>
              <button onClick={() => handleDeleteColumn(c.id)} className="text-xs text-red-500 hover:text-red-700">
                Elimina
              </button>
            </li>
          ))}
          {columnDefs.length === 0 && <li className="py-2 text-sm text-gray-400">Nessuna colonna aggiunta.</li>}
        </ul>

        <form onSubmit={handleAddColumn} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input
            required
            placeholder="chiave (es. note, senza spazi)"
            value={newColumn.key}
            onChange={(e) => setNewColumn({ ...newColumn, key: e.target.value })}
            className="col-span-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            required
            placeholder="Etichetta"
            value={newColumn.label}
            onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })}
            className="col-span-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <select
            value={newColumn.type}
            onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })}
            className="col-span-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="text">Testo</option>
            <option value="textarea">Testo lungo</option>
            <option value="select">Scelta (select)</option>
            <option value="date">Data</option>
            <option value="number">Numero</option>
            <option value="checkbox">Checkbox</option>
          </select>
          {newColumn.type === "select" && (
            <input
              placeholder="opzioni separate da virgola"
              value={newColumn.options}
              onChange={(e) => setNewColumn({ ...newColumn, options: e.target.value })}
              className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          )}
          <button
            type="submit"
            className="col-span-1 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            Aggiungi
          </button>
        </form>
        {columnMessage && <p className="mt-2 text-sm text-gray-600">{columnMessage}</p>}
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
    </div>
  );
}
