import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "confirm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "primary-button",
  secondary: "secondary-button",
  ghost: "ghost-button",
  confirm: "confirm-button"
};

export function Button({ variant = "secondary", icon, children, className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={`${variantClassName[variant]} ${className}`.trim()} {...props}>
      {icon}
      {children}
    </button>
  );
}
