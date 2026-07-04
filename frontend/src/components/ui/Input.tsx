import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "./classNames";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
  containerClassName?: string;
  description?: string;
  error?: string;
  label: string;
  trailing?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      description,
      error,
      id,
      label,
      trailing,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className={cn("grid gap-1.5", containerClassName)}>
        <label className="text-sm font-extrabold text-white" htmlFor={inputId}>
          {label}
        </label>
        {description ? (
          <p className="m-0 text-sm leading-normal text-muted" id={descriptionId}>
            {description}
          </p>
        ) : null}
        <div className="relative">
          <input
            aria-describedby={cn(descriptionId, errorId) || undefined}
            aria-invalid={error ? "true" : undefined}
            className={cn(
              "min-h-[var(--control-height-lg)] w-full rounded-control border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-white placeholder:text-white/40 shadow-none outline-none transition-colors duration-150 focus:border-brand focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-[0.68]",
              trailing ? "pr-11" : undefined,
              error ? "border-error" : undefined,
              className
            )}
            id={inputId}
            ref={ref}
            {...props}
          />
          {trailing ? (
            <div className="absolute inset-y-0 right-1 flex items-center">
              {trailing}
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="m-0 text-sm font-bold text-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
