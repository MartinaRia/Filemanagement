"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type GroupingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import EditableCell from "@/components/EditableCell";
import type { CustomColumnDef, MergedRow } from "@/lib/types";

const columnHelper = createColumnHelper<MergedRow>();

interface Props {
  rows: MergedRow[];
  columnDefs: CustomColumnDef[];
  sourceHeaders: string[];
}

export default function DataTable({ rows, columnDefs, sourceHeaders }: Props) {
  const [data, setData] = useState(rows);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => setData(rows), [rows]);

  function handleCellSaved(rowKey: string, key: string, value: unknown) {
    setData((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, custom: { ...r.custom, [key]: value } } : r))
    );
  }

  const columns = useMemo(() => {
    const sourceCols = sourceHeaders.map((header) =>
      columnHelper.accessor((row) => row.source[header] ?? "", {
        id: `src:${header}`,
        header,
        enableGrouping: true,
        cell: (info) => <span className="text-gray-700">{info.getValue()}</span>,
      })
    );

    const customCols = columnDefs.map((def) =>
      columnHelper.accessor((row) => row.custom[def.key], {
        id: `custom:${def.key}`,
        header: def.label,
        enableGrouping: def.type === "select" || def.type === "checkbox",
        enableSorting: true,
        cell: (info) => (
          <EditableCell
            rowKey={info.row.original.rowKey}
            column={def}
            value={info.getValue()}
            onSaved={handleCellSaved}
          />
        ),
      })
    );

    return [...sourceCols, ...customCols];
  }, [sourceHeaders, columnDefs]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, grouping, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onGroupingChange: setGrouping,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
  });

  const groupableColumns = table.getAllLeafColumns().filter((c) => c.getCanGroup());

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Cerca in tutte le colonne..."
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
        />

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Raggruppa per:</span>
          <select
            value={grouping[0] ?? ""}
            onChange={(e) => setGrouping(e.target.value ? [e.target.value] : [])}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Nessuno</option>
            {groupableColumns.map((c) => (
              <option key={c.id} value={c.id}>
                {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
              </option>
            ))}
          </select>
        </div>

        <span className="ml-auto text-sm text-gray-400">{data.length} righe</span>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600 select-none"
                  >
                    <div className="flex items-center gap-1">
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-gray-900"
                        disabled={!header.column.getCanSort()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                      </button>
                      {header.column.getCanGroup() && (
                        <button
                          onClick={header.column.getToggleGroupingHandler()}
                          title="Raggruppa per questa colonna"
                          className={`text-xs ${
                            header.column.getIsGrouped() ? "text-blue-600" : "text-gray-300 hover:text-gray-500"
                          }`}
                        >
                          ⊞
                        </button>
                      )}
                    </div>
                    {header.column.getCanFilter() && (
                      <input
                        value={(header.column.getFilterValue() as string) ?? ""}
                        onChange={(e) => header.column.setFilterValue(e.target.value)}
                        placeholder="Filtra..."
                        className="mt-1 w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs font-normal focus:border-gray-400 focus:outline-none"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => {
                  if (cell.getIsGrouped()) {
                    return (
                      <td key={cell.id} className="px-3 py-2 font-medium">
                        <button
                          onClick={row.getToggleExpandedHandler()}
                          className="flex items-center gap-1 text-gray-800"
                        >
                          {row.getIsExpanded() ? "▾" : "▸"}
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          <span className="text-xs text-gray-400">({row.subRows.length})</span>
                        </button>
                      </td>
                    );
                  }
                  if (cell.getIsAggregated() || cell.getIsPlaceholder()) {
                    return <td key={cell.id} className="px-3 py-2" />;
                  }
                  return (
                    <td key={cell.id} className="px-3 py-1.5 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400">
                  Nessun dato da mostrare
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
