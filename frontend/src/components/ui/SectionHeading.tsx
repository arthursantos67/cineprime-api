import type { ElementType, ReactNode } from "react";

import { cn } from "./classNames";

type SectionHeadingProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleAs?: ElementType;
};

export function SectionHeading({
  actions,
  className,
  description,
  eyebrow,
  title,
  titleAs: Heading = "h1",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto]",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="m-0 text-[13px] font-black uppercase text-brand">
            {eyebrow}
          </p>
        ) : null}
        <Heading className="m-0 text-display font-black text-text">{title}</Heading>
        {description ? (
          <p className="mt-3 mb-0 max-w-prose text-body-lg text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
