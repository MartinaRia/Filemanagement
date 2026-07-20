import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMergedRows } from "@/lib/merge";
import { getCurrentRole } from "@/lib/session";
import DataTable from "@/components/DataTable";
import UploadForm from "@/components/UploadForm";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [lastUpload, role] = await Promise.all([
    prisma.uploadLog.findFirst({
      where: { status: "ok" },
      orderBy: { startedAt: "desc" },
    }),
    getCurrentRole(),
  ]);
  const isAdmin = role === "admin";

  const { rows, columnDefs, sourceHeaders } = await getMergedRows();

  if (!lastUpload) {
    if (!isAdmin) {
      return (
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Nessun dato ancora caricato</h1>
          <p className="text-sm text-gray-500">
            Il caricamento del file non e&apos; ancora stato effettuato. Contatta un amministratore.
          </p>
          <LogoutButton />
        </main>
      );
    }
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Nessun dato ancora caricato</h1>
        <p className="text-sm text-gray-500">
          Scarica il file Excel da SharePoint e caricalo qui per iniziare. Puoi anche definire delle colonne
          personalizzate dalle Impostazioni prima di caricare il file.
        </p>
        <UploadForm />
        <Link href="/settings" className="text-sm text-gray-500 underline hover:text-gray-800">
          Vai alle Impostazioni
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen w-full min-w-0 max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">File Progetti</h1>
          <p className="text-xs text-gray-500">
            Dati caricati manualmente dal file Excel.
            {lastUpload.finishedAt && (
              <> Ultimo caricamento: {new Date(lastUpload.finishedAt).toLocaleString("it-IT")}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <UploadForm />}
          <Link
            href="/gantt"
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Gantt
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

      <DataTable rows={rows} columnDefs={columnDefs} sourceHeaders={sourceHeaders} />
    </main>
  );
}
