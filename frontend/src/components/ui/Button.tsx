"use client";

import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  MouseEvent,
  ReactNode,
} from "react";

import { cn } from "./classNames";

export type ButtonVariant = "danger" | "ghost" | "primary" | "secondary";
export type ButtonSize = "lg" | "md" | "sm";

type ButtonVisualProps = {
  className?: string;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconTrailing?: ReactNode;
  isLoading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVisualProps;

type ButtonLinkProps = ComponentProps<typeof Link> & ButtonVisualProps;

const baseButtonClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border font-extrabold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-[0.68]";

const sizeClasses: Record<ButtonSize, string> = {
  lg: "min-h-[var(--control-height-lg)] px-5 py-3 text-base",
  md: "min-h-[var(--control-height)] px-control-x py-control-y text-sm",
  sm: "min-h-9 px-3 py-2 text-xs",
};

const variantClasses: Record<ButtonVariant, string> = {
  danger: "border-error bg-error text-white hover:bg-cinema-danger",
  ghost: "border-border bg-transparent text-text hover:bg-surface-muted",
  primary: "border-brand bg-brand text-white hover:bg-brand-strong",
  secondary:
    "border-cinema-gold bg-cinema-gold-soft text-[#3a2b00] hover:bg-accent",
};

export function buttonClassName({
  className,
  fullWidth,
  size = "md",
  variant = "primary",
}: Pick<ButtonVisualProps, "className" | "fullWidth" | "size" | "variant"> = {}) {
  return cn(
    baseButtonClasses,
    sizeClasses[size],
    variantClasses[variant],
    fullWidth ? "w-full" : undefined,
    className
  );
}

export function Button({
  children,
  className,
  disabled,
  fullWidth,
  icon,
  iconTrailing,
  isLoading,
  size,
  type = "button",
  variant,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      aria-busy={isLoading || undefined}
      className={buttonClassName({ className, fullWidth, size, variant })}
      disabled={isDisabled}
      type={type}
      {...props}
    >
      {isLoading ? <LoadingMark /> : icon}
      <span>{children}</span>
      {iconTrailing}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  fullWidth,
  icon,
  iconTrailing,
  isLoading,
  onClick,
  size,
  variant,
  ...props
}: ButtonLinkProps) {
  const ariaDisabled = isLoading ? true : props["aria-disabled"];

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isLoading) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onClick?.(event);
  }

  return (
    <Link
      {...props}
      aria-busy={isLoading || undefined}
      aria-disabled={ariaDisabled}
      className={buttonClassName({
        className: cn(
          isLoading ? "pointer-events-none opacity-[0.68]" : undefined,
          className
        ),
        fullWidth,
        size,
        variant,
      })}
      onClick={handleClick}
      tabIndex={isLoading ? -1 : props.tabIndex}
    >
      {isLoading ? <LoadingMark /> : icon}
      <span>{children}</span>
      {iconTrailing}
    </Link>
  );
}

function LoadingMark() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-pill border-2 border-current border-r-transparent"
    />
  );
}
