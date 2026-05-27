import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "./classNames";

export type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  description?: string;
  error?: string;
  label: string;
  options: SelectOption[];
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      description,
      error,
      id,
      label,
      options,
      placeholder,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const descriptionId = description ? `${selectId}-description` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className="grid gap-1.5">
        <label className="text-sm font-extrabold text-text" htmlFor={selectId}>
          {label}
        </label>
        {description ? (
          <p className="m-0 text-sm leading-normal text-muted" id={descriptionId}>
            {description}
          </p>
        ) : null}
        <select
          aria-describedby={cn(descriptionId, errorId) || undefined}
          aria-invalid={error ? "true" : undefined}
          className={cn(
            "min-h-[var(--control-height-lg)] w-full rounded-control border border-border bg-surface px-3 py-2 text-text shadow-none transition-colors duration-150 focus-visible:border-info focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-[0.68]",
            error ? "border-error" : undefined,
            className
          )}
          id={selectId}
          ref={ref}
          {...props}
        >
          {placeholder ? (
            <option disabled value="">
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className="m-0 text-sm font-bold text-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";
