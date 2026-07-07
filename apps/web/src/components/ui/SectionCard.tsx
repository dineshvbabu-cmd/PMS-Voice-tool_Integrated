import type { ReactNode } from "react";

type SectionCardProps = {
  className?: string;
  children: ReactNode;
};

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  titleAs?: "h1" | "h2";
};

export function SectionCard({ className = "", children }: SectionCardProps) {
  return <section className={`section-card ${className}`.trim()}>{children}</section>;
}

export function SectionHeader({ eyebrow, title, description, actions, titleAs = "h2" }: SectionHeaderProps) {
  const Heading = titleAs;

  return (
    <div className="section-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading>{title}</Heading>
        {description ? <p className="subcopy">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
