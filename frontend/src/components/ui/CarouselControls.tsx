import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "./classNames";

type CarouselControlsProps = {
  canNext?: boolean;
  canPrevious?: boolean;
  className?: string;
  nextLabel?: string;
  onNext: () => void;
  onPrevious: () => void;
  previousLabel?: string;
  tone?: "dark" | "light";
};

const toneClasses = {
  dark: "border-white/20 bg-white/10 text-white hover:bg-white/20",
  light: "border-border bg-surface text-text hover:bg-cinema-gold-soft",
};

export function CarouselControls({
  canNext = true,
  canPrevious = true,
  className,
  nextLabel = "Próximo item",
  onNext,
  onPrevious,
  previousLabel = "Item anterior",
  tone = "light",
}: CarouselControlsProps) {
  const buttonClasses = cn(
    "inline-flex size-10 items-center justify-center rounded-pill border transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-[0.45]",
    toneClasses[tone]
  );

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <button
        aria-label={previousLabel}
        className={buttonClasses}
        disabled={!canPrevious}
        onClick={onPrevious}
        title={previousLabel}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.5} />
      </button>
      <button
        aria-label={nextLabel}
        className={buttonClasses}
        disabled={!canNext}
        onClick={onNext}
        title={nextLabel}
        type="button"
      >
        <ChevronRight aria-hidden="true" size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
}
