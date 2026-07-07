import type { TableRow } from "../types/copilot";

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

export function formatContextLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function interpolateTemplate(template: string, row?: TableRow | null) {
  const today = new Date();
  const plus30 = new Date(today);
  plus30.setDate(plus30.getDate() + 30);

  const source = {
    ...(row || {}),
    ...(row?.raw || {}),
    today: today.toISOString().slice(0, 10),
    plus30: plus30.toISOString().slice(0, 10)
  } as Record<string, unknown>;

  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => String(source[key.trim()] ?? ""));
}
