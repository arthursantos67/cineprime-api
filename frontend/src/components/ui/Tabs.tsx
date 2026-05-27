"use client";

import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "./classNames";

export type TabItem = {
  content: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

type TabsProps = {
  ariaLabel: string;
  className?: string;
  defaultValue?: string;
  items: TabItem[];
  onValueChange?: (value: string) => void;
  panelClassName?: string;
  value?: string;
};

export function Tabs({
  ariaLabel,
  className,
  defaultValue,
  items,
  onValueChange,
  panelClassName,
  value,
}: TabsProps) {
  const uid = useId();
  const [internalValue, setInternalValue] = useState(() =>
    resolveTabValue(items, defaultValue)
  );
  const selectedValue = resolveTabValue(items, value ?? internalValue);

  useEffect(() => {
    if (value !== undefined) {
      return;
    }

    setInternalValue((currentValue) => resolveTabValue(items, currentValue));
  }, [items, value]);

  function selectTab(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  }

  return (
    <div className={cn("grid gap-4", className)}>
      <div
        aria-label={ariaLabel}
        className="inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-panel border border-border bg-surface-muted p-1"
        role="tablist"
      >
        {items.map((item) => {
          const isSelected = item.value === selectedValue;
          const tabId = `${uid}-${item.value}-tab`;
          const panelId = `${uid}-${item.value}-panel`;

          return (
            <button
              aria-controls={panelId}
              aria-selected={isSelected}
              className={cn(
                "min-h-9 whitespace-nowrap rounded-control px-3 py-2 text-sm font-extrabold text-muted transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-[0.68]",
                isSelected
                  ? "bg-surface text-text shadow-soft"
                  : "hover:bg-surface hover:text-text"
              )}
              disabled={item.disabled}
              id={tabId}
              key={item.value}
              onClick={() => selectTab(item.value)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => {
        const isSelected = item.value === selectedValue;

        return (
          <div
            aria-labelledby={`${uid}-${item.value}-tab`}
            className={panelClassName}
            hidden={!isSelected}
            id={`${uid}-${item.value}-panel`}
            key={item.value}
            role="tabpanel"
            tabIndex={0}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
}

function resolveTabValue(items: TabItem[], preferredValue?: string) {
  const preferredItem = items.find(
    (item) => item.value === preferredValue && !item.disabled
  );

  return preferredItem?.value ?? items.find((item) => !item.disabled)?.value;
}
