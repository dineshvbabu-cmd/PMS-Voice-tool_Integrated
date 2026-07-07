import type { SummaryItem } from "../../types/copilot";

type SummaryGridProps = {
  items?: SummaryItem[];
};

export function SummaryGrid({ items = [] }: SummaryGridProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="summary-grid" aria-label="Result summary">
      {items.map((item) => (
        <div key={item.label} className="summary-tile">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
