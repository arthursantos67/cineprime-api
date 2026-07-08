"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/classNames";
import { useI18n } from "@/i18n";

type ConfirmTone = "danger" | "default";

type AdminConfirmDialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  description?: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: ConfirmTone;
};

export function AdminConfirmDialog({
  cancelLabel,
  children,
  confirmDisabled,
  confirmLabel,
  description,
  isOpen,
  onCancel,
  onConfirm,
  title,
  tone = "default",
}: AdminConfirmDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      aria-labelledby="confirm-dialog-title"
      // m-auto is required: Tailwind's Preflight resets margin, which the native <dialog> centering relies on.
      className={cn(
        "fixed inset-0 m-auto w-full max-w-sm rounded-[10px] border border-white/[0.10]",
        "bg-[#1a2030] p-6 text-white shadow-xl backdrop:bg-black/60",
        "open:flex open:flex-col open:gap-4"
      )}
      onCancel={onCancel}
      ref={dialogRef}
    >
      <div className="flex flex-col gap-1.5">
        <strong className="text-base font-[850]" id="confirm-dialog-title">
          {title}
        </strong>
        {description ? (
          <p className="text-sm text-white/60">{description}</p>
        ) : null}
      </div>
      {children ? <div>{children}</div> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">
          {cancelLabel ?? t("admin.cancel")}
        </Button>
        <Button
          disabled={confirmDisabled}
          onClick={onConfirm}
          variant={tone === "danger" ? "danger" : "primary"}
        >
          {confirmLabel ?? t("admin.confirm")}
        </Button>
      </div>
    </dialog>
  );
}
