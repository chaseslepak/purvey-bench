"use client";

/** A submit button that asks first. For destructive actions in server-rendered forms. */
export function ConfirmSubmit({ message, children, className = "bench-link-btn", ...rest }: { message: string; children: React.ReactNode; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick">) {
  return (
    <button type="submit" className={className} {...rest} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
