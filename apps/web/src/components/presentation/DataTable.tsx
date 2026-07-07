import type { RowAction, TableColumn, TableRow } from "../../types/copilot";
import { Button } from "../ui/Button";

type DataTableProps = {
  columns: TableColumn[];
  rows: TableRow[];
  selectedRow: TableRow | null;
  selectedRowId: string;
  rowActions?: RowAction[];
  onSelectRow: (rowId: string) => void;
  onRunPrompt: (prompt: string) => void;
  interpolateTemplate: (template: string, row?: TableRow | null) => string;
};

export function DataTable({
  columns,
  rows,
  selectedRow,
  selectedRowId,
  rowActions = [],
  onSelectRow,
  onRunPrompt,
  interpolateTemplate
}: DataTableProps) {
  if (!rows.length) {
    return (
      <div className="empty-state" role="status">
        <span>No records matched this request. Try broadening the vessel, status, or keyword filter.</span>
      </div>
    );
  }

  return (
    <>
      <div className="table-shell" role="region" aria-label="Result records" tabIndex={0}>
        <div className="table-head" role="row">
          {columns.map((column) => (
            <span key={column.key} role="columnheader">
              {column.label}
            </span>
          ))}
        </div>

        <div className="table-body">
          {rows.map((row) => (
            <button
              key={row.id}
              className={`table-row ${selectedRowId === row.id ? "selected" : ""}`}
              onClick={() => onSelectRow(row.id)}
              aria-pressed={selectedRowId === row.id}
              type="button"
            >
              {columns.map((column) => (
                <span key={column.key}>{String(row[column.key] ?? "-")}</span>
              ))}
            </button>
          ))}
        </div>
      </div>

      {selectedRow ? (
        <div className="selected-panel">
          <div className="selected-head">
            <strong>Selected record</strong>
            <span>ID {selectedRow.id}</span>
          </div>

          <div className="selected-grid">
            {columns.map((column) => (
              <div key={column.key} className="selected-field">
                <span>{column.label}</span>
                <strong>{String(selectedRow[column.key] ?? "-")}</strong>
              </div>
            ))}
          </div>

          {rowActions.length ? (
            <div className="row-action-group">
              {rowActions.map((action) =>
                action.promptTemplate ? (
                  <Button
                    key={action.label}
                    variant="secondary"
                    onClick={() => onRunPrompt(interpolateTemplate(action.promptTemplate || "", selectedRow))}
                  >
                    {action.label}
                  </Button>
                ) : action.urlTemplate ? (
                  <a
                    key={action.label}
                    className="secondary-link"
                    href={interpolateTemplate(action.urlTemplate, selectedRow)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {action.label}
                  </a>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
