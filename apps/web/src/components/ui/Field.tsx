import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
};

export function InputField({ label, id, ...props }: InputFieldProps) {
  const inputId = id || `field-${label.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <label className="field" htmlFor={inputId}>
      {label}
      <input id={inputId} {...props} />
    </label>
  );
}

export function TextareaField({ label, id, ...props }: TextareaFieldProps) {
  const textareaId = id || `field-${label.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <label className="field" htmlFor={textareaId}>
      {label}
      <textarea id={textareaId} {...props} />
    </label>
  );
}
