"use client";

import { useId, type InputHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly error?: string;
  readonly description?: string;
}

export function Input({
  className,
  description,
  error,
  id: providedId,
  label,
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = providedId ?? `input-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId, props["aria-describedby"]]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      <input
        className={cn(
          "min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink shadow-sm",
          "placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30",
          error && "border-danger focus:border-danger focus:ring-danger/30",
          className
        )}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? "true" : props["aria-invalid"]}
        {...props}
      />
      {description ? (
        <p className="text-xs text-ink-muted" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
