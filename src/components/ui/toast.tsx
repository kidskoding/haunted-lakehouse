"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { IconButton } from "./button";
import { cx } from "./cx";
import {
  CandleGutteringIcon,
  CandleLitIcon,
  CandleSnuffedIcon,
  CloseIcon,
  MoonIcon,
} from "./icons";
import {
  autoDismissMs,
  dismissToast,
  emptyToastQueue,
  enqueueToast,
  visibleToasts,
  type Toast,
  type ToastInput,
  type ToastQueue,
  type ToastTone,
} from "./toast-queue";

interface ToneStyle {
  readonly word: string;
  readonly Icon: ComponentType<Omit<SVGProps<SVGSVGElement>, "children">>;
  readonly ink: string;
}

/*
 * Every tone has its own icon shape as well as its color, and its word for screen readers
 * (art direction §2.5), so no tone is told apart by color alone.
 */
const tones: Readonly<Record<ToastTone, ToneStyle>> = {
  info: { word: "Notice", Icon: MoonIcon, ink: "text-moon" },
  success: { word: "Done", Icon: CandleLitIcon, ink: "text-flame" },
  warning: { word: "Warning", Icon: CandleGutteringIcon, ink: "text-tallow" },
  error: { word: "Error", Icon: CandleSnuffedIcon, ink: "text-snuffed" },
};

export interface ToastCardProps {
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string | undefined;
  /** Dismisses the toast; omitted, the card has no close button (a static specimen). */
  readonly onDismiss?: () => void;
  readonly className?: string;
}

/**
 * One toast as drawn: a `raised` card with the tone's icon in its color beside the title.
 * Flat on its own; the viewport adds the shadow when it floats. Escape dismisses it while
 * focus is inside.
 */
export function ToastCard({ tone, title, description, onDismiss, className }: ToastCardProps) {
  const { word, Icon, ink } = tones[tone];
  return (
    <div
      className={cx(
        "flex w-full items-start gap-3 rounded-s bg-raised py-3 pr-2 pl-3.5",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onDismiss) {
          event.stopPropagation();
          onDismiss();
        }
      }}
    >
      <Icon className={cx("size-5 shrink-0", ink)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-parchment type-ui font-semibold">
          <span className="sr-only">{word}: </span>
          <span>{title}</span>
        </p>
        {description ? <p className="text-pretty text-ash type-ui">{description}</p> : null}
      </div>
      {onDismiss ? (
        <IconButton label="Dismiss" icon={<CloseIcon />} size="sm" onClick={onDismiss} />
      ) : null}
    </div>
  );
}

interface ToastContextValue {
  readonly queue: ToastQueue;
  readonly show: (toast: ToastInput) => void;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function useToastContext(component: string): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error(`${component} must be used inside a ToastProvider.`);
  return context;
}

/** Shows and dismisses toasts from anywhere under a `ToastProvider`. */
export function useToast(): Pick<ToastContextValue, "show" | "dismiss"> {
  const { show, dismiss } = useToastContext("useToast");
  return { show, dismiss };
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [queue, setQueue] = useState(emptyToastQueue);
  const show = (toast: ToastInput) => {
    setQueue((current) => enqueueToast(current, toast));
  };
  const dismiss = (id: number) => {
    setQueue((current) => dismissToast(current, id));
  };
  return <ToastContext value={{ queue, show, dismiss }}>{children}</ToastContext>;
}

/**
 * A visible toast that dismisses itself after its tone's delay. The countdown pauses while
 * the pointer is over it or focus is inside, and restarts in full afterwards, so a toast
 * being read never disappears mid-sentence.
 */
function TimedToast({
  toast,
  onDismiss,
}: {
  readonly toast: Toast;
  readonly onDismiss: () => void;
}) {
  const [held, setHeld] = useState({ pointer: false, focus: false });
  const delay = autoDismissMs(toast.tone);
  const paused = held.pointer || held.focus;
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (delay === undefined || paused) return;
    const timer = window.setTimeout(() => {
      onDismissRef.current();
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [delay, paused]);

  return (
    <div
      className={cx(
        "flex justify-end transition-[opacity,translate] duration-base ease-out",
        "starting:translate-y-2 starting:opacity-0",
      )}
      onPointerEnter={() => {
        setHeld((current) => ({ ...current, pointer: true }));
      }}
      onPointerLeave={() => {
        setHeld((current) => ({ ...current, pointer: false }));
      }}
      onFocus={() => {
        setHeld((current) => ({ ...current, focus: true }));
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHeld((current) => ({ ...current, focus: false }));
        }
      }}
    >
      <ToastCard
        tone={toast.tone}
        title={toast.title}
        description={toast.description}
        onDismiss={onDismiss}
        className="shadow-float"
      />
    </div>
  );
}

/**
 * Speaks the shown toasts of some tones. It stays in the page while empty, so screen readers
 * are already watching it when a toast arrives, and only additions are read, so a new toast
 * doesn't repeat the ones before it.
 */
function Announcer({
  role,
  toasts,
}: {
  readonly role: "status" | "alert";
  readonly toasts: readonly Toast[];
}) {
  return (
    <div role={role} aria-atomic="false" aria-relevant="additions" className="sr-only">
      {toasts.map((toast) => (
        <p key={toast.id}>
          {`${tones[toast.tone].word}: ${toast.title}.`}
          {toast.description ? ` ${toast.description}` : null}
        </p>
      ))}
    </div>
  );
}

/**
 * Where toasts appear: bottom right, in queue order with the newest at the bottom, whatever the
 * tone. The visible stack isn't live: two always-present, visually hidden regions announce each
 * toast as it appears, errors through `role="alert"` and the rest through `role="status"`, so
 * how a toast is spoken never decides where it sits. When a focused toast is dismissed, focus
 * moves to the next toast, or back to where it was before the player tabbed into the toasts.
 */
export function ToastViewport({ className }: { readonly className?: string }) {
  const { queue, dismiss } = useToastContext("ToastViewport");
  const regionRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const shown = visibleToasts(queue);

  const dismissAndRefocus = (id: number) => {
    const region = regionRef.current;
    const hadFocus = region?.contains(document.activeElement) ?? false;
    dismiss(id);
    if (!hadFocus || !region) return;
    // After React removes the toast, hand focus on rather than dropping it to <body>.
    requestAnimationFrame(() => {
      const next = region.querySelector<HTMLElement>("button");
      const target = next ?? returnFocusRef.current;
      if (target?.isConnected) target.focus();
    });
  };

  return (
    <section
      ref={regionRef}
      aria-label="Notifications"
      className={cx(
        "pointer-events-none fixed right-6 bottom-6 z-50 flex w-sm max-w-[calc(100vw-3rem)] flex-col",
        "gap-2 *:pointer-events-auto",
        className,
      )}
      onFocus={(event) => {
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
          returnFocusRef.current = from;
        }
      }}
    >
      <Announcer role="status" toasts={shown.filter((toast) => toast.tone !== "error")} />
      <Announcer role="alert" toasts={shown.filter((toast) => toast.tone === "error")} />
      {shown.map((toast) => (
        <TimedToast
          key={toast.id}
          toast={toast}
          onDismiss={() => {
            dismissAndRefocus(toast.id);
          }}
        />
      ))}
    </section>
  );
}
