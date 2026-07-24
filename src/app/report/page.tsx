import Link from "next/link";
import GenerateReportButton from "@/components/GenerateReportButton";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default function ReportPage() {
  return (
    <main className="mx-auto flex h-screen w-full min-w-0 max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Report PPT</h1>
          <p className="text-xs text-gray-500">
            Genera il PowerPoint compilando il template con i dati attuali (slide RAG Rosso/Giallo e timeline
            progetti IT4BU).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Tabella
          </Link>
          <Link
            href="/gantt"
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Gantt
          </Link>
          <Link
            href="/settings"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Impostazioni
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <GenerateReportButton />
      </div>
    </main>
  );
}
