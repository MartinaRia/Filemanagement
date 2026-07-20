import Link from "next/link";
import { getMergedRows } from "@/lib/merge";
import { getCurrentRole } from "@/lib/session";
import GanttChart from "@/components/GanttChart";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  const [{ rows, sourceHeaders, columnDefs }, role] = await Promise.all([getMergedRows(), getCurrentRole()]);
  const isAdmin = role === "admin";

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
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Tabella
          </Link>
          {isAdmin && (
            <Link
              href="/settings"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              Impostazioni
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      <GanttChart rows={rows} sourceHeaders={sourceHeaders} columnDefs={columnDefs} />
    </main>
  );
}
