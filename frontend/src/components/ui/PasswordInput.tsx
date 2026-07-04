"use client";

import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "./Input";
import { useI18n } from "@/i18n";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  className?: string;
  containerClassName?: string;
  description?: string;
  error?: string;
  hidePasswordLabel?: string;
  label: string;
  showPasswordLabel?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    { hidePasswordLabel, showPasswordLabel, ...props },
    ref
  ) => {
    const { t } = useI18n();
    const [isVisible, setIsVisible] = useState(false);
    const resolvedShowLabel = showPasswordLabel ?? t("common.showPassword");
    const resolvedHideLabel = hidePasswordLabel ?? t("common.hidePassword");
    const toggleLabel = isVisible ? resolvedHideLabel : resolvedShowLabel;

    return (
      <Input
        {...props}
        ref={ref}
        trailing={
          <button
            aria-label={toggleLabel}
            aria-pressed={isVisible}
            className="inline-flex size-8 items-center justify-center rounded-control text-white/50 transition duration-150 hover:text-white/80 focus-visible:outline-none focus-visible:shadow-focus"
            onClick={() => setIsVisible((visible) => !visible)}
            title={toggleLabel}
            type="button"
          >
            {isVisible ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        }
        type={isVisible ? "text" : "password"}
      />
    );
  }
);

PasswordInput.displayName = "PasswordInput";
