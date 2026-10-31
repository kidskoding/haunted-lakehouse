"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { cx } from "./cx";
import { tabbableIn, wrappedTabIndex } from "./focus-trap";

interface DialogContextValue {
  readonly titleId: string;
  readonly descriptionId: string;
  readonly close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog(component: string): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) throw new Error(`${component} must be used inside a Dialog.`);
  return context;
}

export interface DialogProps {
  readonly open: boolean;
  /** Called with `false` when the player asks to close: Escape, a backdrop click, or `DialogClose`. */
  readonly onOpenChange: (open: boolean) => void;
  /** `alertdialog` for confirms that interrupt (abandon run, last candle). */
  readonly role?: "dialog" | "alertdialog";
  /** Whether a click on the backdrop closes the dialog. Confirms usually keep it off. */
  readonly closeOnBackdrop?: boolean;
  readonly className?: string;
  /** A `DialogTitle` is required; add `DialogDescription`, a body, and `DialogActions`. */
  readonly children: ReactNode;
}

/**
 * A modal dialog on the native `<dialog>` element. `showModal()` makes the rest of the page
 * inert and Tab wraps at either end, so focus stays inside; Escape closes it; focus returns to whatever held it before
 * opening. Focus starts on the element marked `data-autofocus`, else the first focusable one,
 * so mark the safe choice in a destructive confirm.
 */
export function Dialog({
  open,
  onOpenChange,
  role = "dialog",
  closeOnBackdrop = true,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    // Browsers restore focus on close, but not when the dialog unmounts while open, and not
    // consistently across engines, so the trigger is remembered and refocused explicitly.
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // React's `autoFocus` fires before the dialog opens, when nothing inside can take focus.
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open]);

  const close = () => {
    onOpenChangeRef.current(false);
  };

  return (
    <DialogContext value={{ titleId, descriptionId, close }}>
      <dialog
        ref={ref}
        role={role === "alertdialog" ? "alertdialog" : undefined}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          // The parent owns `open`; closing goes through it so state and element agree.
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const tabbable = tabbableIn(event.currentTarget);
          const current = tabbable.findIndex((element) => element === document.activeElement);
          const next = wrappedTabIndex(current, tabbable.length, event.shiftKey);
          const target = next === undefined ? undefined : tabbable[next];
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        onClick={(event) => {
          // A click on the <dialog> itself, not its content, landed on the backdrop.
          if (closeOnBackdrop && event.target === event.currentTarget) close();
        }}
        className={cx(
          "m-auto max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] max-w-copy overflow-visible",
          "bg-transparent p-0 text-parchment backdrop:bg-void/65",
          "opacity-0 open:opacity-100 starting:open:opacity-0",
          "translate-y-2 open:translate-y-0 starting:open:translate-y-2",
          "backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0",
          "transition-[opacity,translate,overlay,display] transition-discrete duration-base",
          "ease-out backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete",
          "backdrop:duration-base",
        )}
      >
        <div
          className={cx(
            "flex max-h-[calc(100dvh-4rem)] flex-col gap-4 overflow-y-auto rounded-m bg-raised p-6",
            "shadow-dialog",
            className,
          )}
        >
          {children}
        </div>
      </dialog>
    </DialogContext>
  );
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<"h2">) {
  const { titleId } = useDialog("DialogTitle");
  return (
    <h2
      id={titleId}
      className={cx("type-heading text-balance text-parchment", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  const { descriptionId } = useDialog("DialogDescription");
  return (
    <p id={descriptionId} className={cx("type-ui-l font-normal text-ash", className)} {...props} />
  );
}

/** The dialog's buttons, safe choice first in reading order and on the left. */
export function DialogActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cx("mt-2 flex justify-end gap-3", className)} {...props} />;
}

export interface DialogCloseProps {
  /** A button; its click closes the dialog after any `onClick` it already has. */
  readonly children: (close: () => void) => ReactNode;
}

/** Hands its child the dialog's close function, so any button can dismiss it. */
export function DialogClose({ children }: DialogCloseProps) {
  const { close } = useDialog("DialogClose");
  return children(close);
}
