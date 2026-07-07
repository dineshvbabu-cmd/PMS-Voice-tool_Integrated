import type { ReactNode } from "react";

type AssistantOrbProps = {
  isListening: boolean;
  isArmed: boolean;
  disabled?: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

export function AssistantOrb({ isListening, isArmed, disabled, label, icon, onClick }: AssistantOrbProps) {
  return (
    <button
      className={`assistant-orb ${isListening ? "listening" : ""} ${isArmed ? "armed" : ""}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isListening}
      type="button"
    >
      <span className="assistant-orb-core">{icon}</span>
    </button>
  );
}
