type DetailGridProps = {
  fields: Array<{ label: string; value: string | number }>;
};

export function DetailGrid({ fields }: DetailGridProps) {
  if (!fields.length) {
    return null;
  }

  return (
    <div className="detail-grid">
      {fields.map((field) => (
        <div key={`${field.label}-${field.value}`} className="detail-card">
          <span>{field.label}</span>
          <strong>{field.value}</strong>
        </div>
      ))}
    </div>
  );
}
