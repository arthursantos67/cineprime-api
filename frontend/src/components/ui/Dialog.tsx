"use client";

import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "./classNames";

type DialogProps = {
  children: ReactNode;
  className?: string;
  closeLabel: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
};

export function Dialog({
  children,
  className,
  closeLabel,
  description,
  isOpen,
  onClose,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const titleId = `${uid}-dialog-title`;
  const descriptionId = description ? `${uid}-dialog-description` : undefined;

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

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;

    if (!dialog || event.target !== dialog) return;

    // Clicks on the ::backdrop hit the <dialog> element itself but land
    // outside its box; clicks on the dialog's padding land inside it.
    const rect = dialog.getBoundingClientRect();
    const isInsideDialog =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!isInsideDialog) {
      onClose();
    }
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-[10px] border border-white/[0.10]",
        "bg-[#1a2030] p-6 text-white shadow-xl backdrop:bg-black/60",
        "open:flex open:flex-col open:gap-5",
        className
      )}
      onCancel={onClose}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <strong className="text-base font-[850]" id={titleId}>
            {title}
          </strong>
          {description ? (
            <p className="m-0 text-sm text-white/60" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <button
          aria-label={closeLabel}
          className="grid size-8 shrink-0 place-items-center rounded-control text-white/55 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:shadow-focus"
          onClick={onClose}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.5"
            viewBox="0 0 16 16"
            width="16"
          >
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>
      <div>{children}</div>
    </dialog>
  );
}
