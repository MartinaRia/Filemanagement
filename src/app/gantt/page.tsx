import Link from "next/link";
import { getMergedRows } from "@/lib/merge";
import GanttChart from "@/components/GanttChart";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  const { rows, sourceHeaders } = await getMergedRows();

  return (
    <main className="mx-auto flex h-screen w-full min-w-0 max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gantt</h1>
          <p className="text-xs text-gray-500">
            Ogni riga mostra le colonne data individuate nel file, in ordine cronologico.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Tabella
          </Link>
          <Link
            href="/settings"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Impostazioni
          </Link>
        </div>
      </header>

      <GanttChart rows={rows} sourceHeaders={sourceHeaders} />
    </main>
  );
}
