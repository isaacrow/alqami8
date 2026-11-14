"use client";

import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { cn } from "./utils";



import { DEFAULTS } from "./config";
import { anchorFold } from "./internal/anchor-fold.utils";
import { FoldBook } from "./internal/fold-book";
import {
  FoldCarouselContext,
  useFoldCarouselContext,
} from "./internal/fold-carousel.context";
import type {
  Fold,
  FoldVariantProps,
  Slide,
} from "./internal/fold-carousel.types";
import { FoldDoor } from "./internal/fold-door";
import { useFoldEngine } from "./internal/use-fold-engine";
import { useReadySlides } from "./internal/use-ready-slides";
import { wrap } from "./internal/wrap.utils";
import { useFoldCarousel } from "./use-fold-carousel";

const VARIANTS = {
  door: FoldDoor,
  book: FoldBook,
} satisfies Record<string, (props: FoldVariantProps) => ReactNode>;

export type FoldCarouselProps = ComponentProps<"div"> & {
  /**
   * One slide per item, each painted across both halves of the frame. Anything that fills a
   * box works, like `img` or `next/image` with `fill`.
   */
  slides: ReactNode[];
  /** Whether the last slide folds on to the first. */
  loop?: boolean;
  /** Seconds a turn takes to settle onto a slide. */
  duration?: number;
  /** The slide shown first. */
  defaultIndex?: number;
  /** Called with the slide a turn is heading for, as soon as the turn starts. */
  onIndexChange?: (index: number) => void;
};

/**
 * A carousel that folds from one slide to the next like a two-panel phone. It holds the
 * state, so put a `FoldCarouselFrame` and any controls inside it. Arrow keys change slides
 * while focus is inside.
 */
export function FoldCarousel({
  slides,
  loop = DEFAULTS.loop,
  duration = DEFAULTS.duration,
  defaultIndex = 0,
  onIndexChange,
  className,
  children,
  ...props
}: FoldCarouselProps) {
  const engine = useFoldEngine({
    count: slides.length,
    loop,
    duration,
    defaultIndex,
    onIndexChange,
  });
  const [fold, setFold] = useState<Fold>({
    from: engine.index,
    direction: 1,
  });

  // The fold this render shows, published for Motion. Measuring progress against it instead
  // of the raw position keeps the leaves from drawing a slide React has not mounted yet.
  const from = useMotionValue(fold.from);
  const direction = useMotionValue<number>(fold.direction);
  from.set(fold.from);
  direction.set(fold.direction);

  // Can sit just outside 0 to 1 while React catches up. Variants clamp it, and the clamp
  // lands on the same picture the other side of the swap draws.
  const progress = useTransform(
    () => direction.get() * (engine.position.get() - from.get()),
  );

  // Do not force React into step with `flushSync` here. Committing inside a motion value's
  // change event skips every subscriber after this one.
  useMotionValueEvent(engine.position, "change", (position) => {
    const anchored = anchorFold(fold, position);
    if (anchored !== fold) setFold(anchored);
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      engine.prev();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      engine.next();
    }
  };

  return (
    <FoldCarouselContext.Provider value={{ ...engine, slides, fold, progress }}>
      <div
        role="region"
        aria-roledescription="carousel"
        data-slot="fold-carousel"
        // Focusable by click but not by Tab, so arrow keys work after clicking a slide.
        // Without `outline-none` Chrome rings the whole carousel on the first key press, and
        // the fold is feedback enough.
        tabIndex={-1}
        onKeyDownCapture={handleKeyDown}
        className={cn("outline-none", className)}
        {...props}
      >
        {children}
        {slides.length > 0 && (
          <div aria-live="polite" aria-atomic className="sr-only">
            Slide {engine.index + 1} of {slides.length}
          </div>
        )}
      </div>
    </FoldCarouselContext.Provider>
  );
}

export type FoldCarouselFrameProps = Omit<
  FoldVariantProps,
  "outgoing" | "incoming" | "progress" | "mirrored"
> & {
  /** `door` swings the next slide in behind the current one. `book` lays it underneath. */
  variant?: keyof typeof VARIANTS;
};

/** The folding picture. Reads its slides and progress from the surrounding `FoldCarousel`. */
export function FoldCarouselFrame({
  variant = "door",
  ref,
  ...props
}: FoldCarouselFrameProps) {
  const { slides, fold, progress } = useFoldCarouselContext();
  // The frame looks inside its own stage for the slides' images, and a `ref` passed in still
  // gets the same element.
  const stage = useRef<HTMLDivElement>(null);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    // React 18 does not pass `ref` to function components as a prop; the cast only satisfies its older types.
    ref as React.Ref<HTMLDivElement | null>,
    () => stage.current,
  );

  const outgoingIndex = wrap(fold.from, slides.length);
  const incomingIndex = wrap(fold.from + fold.direction, slides.length);
  const ready = useReadySlides(stage, outgoingIndex, incomingIndex);

  if (!slides.length) return null;

  const slideAt = (index: number): Slide => ({
    content: slides[index],
    index,
    ready: ready.has(index),
  });
  const Variant = VARIANTS[variant];

  return (
    <Variant
      role="group"
      aria-roledescription="slide"
      aria-label={`${outgoingIndex + 1} of ${slides.length}`}
      data-slot="fold-carousel-frame"
      {...props}
      ref={stage}
      progress={progress}
      outgoing={slideAt(outgoingIndex)}
      incoming={slideAt(incomingIndex)}
      mirrored={fold.direction < 0}
    />
  );
}

/**
 * Folds back one slide. Takes every `Button` prop, and children replace the icon. At the
 * first slide without a loop it stays focusable and does nothing.
 */
export function FoldCarouselPrevious({
  className,
  children,
  onClick,
  ...props
}: ComponentProps<"button">) {
  const { canPrev, prev } = useFoldCarousel();

  return (
    <button
      data-slot="fold-carousel-previous"
      aria-label="Previous slide"
      disabled={!canPrev}
      className={cn(
        "relative p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white disabled:opacity-40 cursor-pointer transition active:scale-95 shadow-md",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        prev();
      }}
      {...props}
    >
      {children ?? <ChevronLeftIcon className="w-5 h-5" />}
    </button>
  );
}

export function FoldCarouselNext({
  className,
  children,
  onClick,
  ...props
}: ComponentProps<"button">) {
  const { canNext, next } = useFoldCarousel();

  return (
    <button
      data-slot="fold-carousel-next"
      aria-label="Next slide"
      disabled={!canNext}
      className={cn(
        "relative p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white disabled:opacity-40 cursor-pointer transition active:scale-95 shadow-md",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        next();
      }}
      {...props}
    >
      {children ?? <ChevronRightIcon className="w-5 h-5" />}
    </button>
  );
}
