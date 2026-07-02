import { prisma } from "@/lib/db";
import { getColumnDefs } from "@/lib/merge";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [config, columnDefs] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: 1 } }),
    getColumnDefs(),
  ]);

  return (
    <SettingsForm
      initialConfig={{
        worksheetName: config?.worksheetName ?? "",
        keyColumn: config?.keyColumn ?? "",
      }}
      initialColumnDefs={columnDefs}
    />
  );
}
