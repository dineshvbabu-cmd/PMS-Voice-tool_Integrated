import type { PayloadPresentation } from "../../types/copilot";
import { formatContextLabel, formatJson } from "../../lib/formatters";
import { DetailGrid } from "./DetailGrid";

type PayloadViewProps = {
  presentation: PayloadPresentation;
  hasPendingAction: boolean;
};

export function PayloadView({ presentation, hasPendingAction }: PayloadViewProps) {
  return (
    <div className="payload-layout">
      <div className="payload-banner" role="status" aria-live="polite">
        <strong>{presentation.message || "Review the parsed payload."}</strong>
        {presentation.missingFields?.length ? (
          <span>Missing: {presentation.missingFields.map(formatContextLabel).join(", ")}</span>
        ) : (
          <span>Ready for confirmation</span>
        )}
      </div>

      {presentation.detailFields?.length ? (
        <div className="payload-section">
          <div className="payload-section-header">{presentation.detailSectionTitle || "Live job detail"}</div>
          <DetailGrid fields={presentation.detailFields} />
        </div>
      ) : null}

      {presentation.reviewFields?.length ? (
        <div className="payload-section">
          <div className="payload-section-header">
            {presentation.reviewSectionTitle || (hasPendingAction ? "Action ready for confirmation" : "Action details still needed")}
          </div>
          <DetailGrid fields={presentation.reviewFields} />
        </div>
      ) : null}

      {presentation.context ? (
        <div className="payload-section">
          <div className="payload-section-header">{presentation.contextSectionTitle || "Additional context"}</div>
          <DetailGrid
            fields={Object.entries(presentation.context)
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => ({ label: formatContextLabel(key), value }))}
          />
        </div>
      ) : null}

      {presentation.showTechnicalPayload !== false ? (
        <details className="technical-details">
          <summary>{presentation.technicalLabel || "Technical payload"}</summary>
          <pre className="payload-box">{formatJson(presentation.payload)}</pre>
        </details>
      ) : null}
    </div>
  );
}
