"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { cn } from "@/components/ui/classNames";

type ChatPanelProps = {
  children: ReactNode;
  closeLabel: string;
  isOpen: boolean;
  launcherRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  title: string;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A corner-docked popover next to the launcher, not a page-blocking modal: the
// rest of the app stays interactive while the panel is open, unlike the shared
// `Dialog` primitive (a centered, backdrop-blocking native <dialog> — a good
// fit for forms, not for a persistent chat widget users expect to keep
// browsing around). Focus is still trapped manually while open and Esc still
// closes it, so this stays keyboard-operable without the visual/interaction
// cost of a full modal.
export function ChatPanel({
  children,
  closeLabel,
  isOpen,
  launcherRef,
  onClose,
  title,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const titleId = `${uid}-chat-panel-title`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panel?.contains(target) || launcherRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, launcherRef, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby={titleId}
      className={cn(
        "fixed bottom-24 z-20 flex max-h-[70dvh] flex-col overflow-hidden rounded-[20px]",
        "border border-white/[0.10] bg-[#1a2030] shadow-2xl",
        "inset-x-4 sm:inset-x-auto sm:right-6 sm:w-[380px]"
      )}
      ref={panelRef}
      role="dialog"
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-3.5">
        <strong className="text-sm font-[850] text-white" id={titleId}>
          {title}
        </strong>
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
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4 pt-3">
        {children}
      </div>
    </div>
  );
}
