"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
};

export function FormSubmitButton({
  children,
  pendingText = "Attendere...",
  className = "btn",
  style,
  disabled = false
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button type="submit" className={className} style={style} disabled={isDisabled} aria-busy={pending}>
      {pending ? (
        <span className="btn__loading">
          <span className="btn__spinner" aria-hidden="true" />
          <span>{pendingText}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

