import type { ReactNode } from "react";

type StateNoticeProps = {
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
};

export function StateNotice({ icon, title, children }: StateNoticeProps) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      {icon}
      <span>
        {title ? <strong>{title}</strong> : null}
        {children}
      </span>
    </div>
  );
}
