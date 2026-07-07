import { CheckCircle2 } from "lucide-react";
import type { Presentation, TableRow } from "../../types/copilot";
import { StateNotice } from "../ui/StateNotice";
import { DataTable } from "./DataTable";
import { DetailGrid } from "./DetailGrid";
import { PayloadView } from "./PayloadView";
import { SummaryGrid } from "./SummaryGrid";

type PresentationRendererProps = {
  presentation: Presentation;
  selectedRow: TableRow | null;
  selectedRowId: string;
  hasPendingAction: boolean;
  onSelectRow: (rowId: string) => void;
  onRunPrompt: (prompt: string) => void;
  interpolateTemplate: (template: string, row?: TableRow | null) => string;
};

export function PresentationRenderer({
  presentation,
  selectedRow,
  selectedRowId,
  hasPendingAction,
  onSelectRow,
  onRunPrompt,
  interpolateTemplate
}: PresentationRendererProps) {
  if (!presentation) {
    return (
      <StateNotice icon={<CheckCircle2 size={18} />}>
        Try one of the sample prompts to load maintenances, defects, certificates, requisitions, or PO status.
      </StateNotice>
    );
  }

  if (presentation.type === "table") {
    return (
      <div className="results-layout">
        <SummaryGrid items={presentation.summary} />
        <DataTable
          columns={presentation.columns}
          rows={presentation.rows}
          selectedRow={selectedRow}
          selectedRowId={selectedRowId}
          rowActions={presentation.rowActions}
          onSelectRow={onSelectRow}
          onRunPrompt={onRunPrompt}
          interpolateTemplate={interpolateTemplate}
        />
      </div>
    );
  }

  if (presentation.type === "detail") {
    return <DetailGrid fields={presentation.fields} />;
  }

  return <PayloadView presentation={presentation} hasPendingAction={hasPendingAction} />;
}
