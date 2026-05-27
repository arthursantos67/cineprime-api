import type { ReactNode } from "react";

import { SectionHeading } from "./SectionHeading";

type PageSectionProps = {
  actions?: ReactNode;
  children?: ReactNode;
  description?: string;
  eyebrow: string;
  title: string;
};

export function PageSection({
  actions,
  children,
  description,
  eyebrow,
  title,
}: PageSectionProps) {
  return (
    <section className="grid gap-6">
      <SectionHeading
        actions={actions}
        description={description}
        eyebrow={eyebrow}
        title={title}
      />
      {children}
    </section>
  );
}
