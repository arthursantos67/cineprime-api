import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "./classNames";

export type BadgeTone =
  | "accent"
  | "brand"
  | "danger"
  | "info"
  | "neutral"
  | "success";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  size?: "md" | "sm";
  tone?: BadgeTone;
};

const toneClasses: Record<BadgeTone, string> = {
  accent: "border-cinema-gold bg-cinema-gold-soft text-[#3a2b00]",
  brand: "border-brand bg-brand text-white",
  danger: "border-error bg-[#feeceb] text-error",
  info: "border-info bg-[#eaf2ff] text-[#0b57b7]",
  neutral: "border-border bg-surface-muted text-muted",
  success: "border-success bg-[#e8f5ee] text-success",
};

const sizeClasses = {
  md: "px-3 py-1.5 text-sm",
  sm: "px-2.5 py-1 text-xs",
};

export function Badge({
  children,
  className,
  size = "md",
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-pill border font-extrabold leading-none",
        sizeClasses[size],
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
