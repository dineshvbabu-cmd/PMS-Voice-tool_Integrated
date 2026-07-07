import type { ReactNode } from "react";

type StatusChipProps = {
  tone?: "online" | "offline" | "neutral";
  children: ReactNode;
  className?: string;
};

export function StatusChip({ tone = "neutral", children, className = "" }: StatusChipProps) {
  return <div className={`status-chip ${tone} ${className}`.trim()}>{children}</div>;
}

export function LoaderChip({ children }: { children: ReactNode }) {
  return <div className="loader-chip">{children}</div>;
}
