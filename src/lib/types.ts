export interface CustomColumnDef {
  id: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date" | "number" | "checkbox";
  options?: string[] | null;
  order: number;
}

export interface MergedRow {
  rowKey: string;
  source: Record<string, string>;
  custom: Record<string, unknown>;
}
