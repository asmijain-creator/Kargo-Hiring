"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText,
  className = "btn",
  formAction,
  confirm,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  confirm?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      disabled={pending || disabled}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}
