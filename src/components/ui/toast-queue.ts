/*
 * The toast queue, kept free of React so its rules are unit-tested: at most two toasts show
 * at once, the rest wait in order, and only calm tones dismiss themselves (art direction §9).
 */

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastInput {
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string;
}

export interface Toast extends ToastInput {
  readonly id: number;
}

export interface ToastQueue {
  readonly toasts: readonly Toast[];
  readonly nextId: number;
}

/** How many toasts are on screen at once; later ones wait their turn. */
export const maxVisibleToasts = 2;

export const emptyToastQueue: ToastQueue = { toasts: [], nextId: 1 };

/**
 * How long a toast stays before dismissing itself, or `undefined` if it waits for the player.
 * Errors and warnings ask for something, so they never vanish unread (WCAG 2.2.1).
 */
export function autoDismissMs(tone: ToastTone): number | undefined {
  return tone === "info" || tone === "success" ? 5000 : undefined;
}

export function enqueueToast(queue: ToastQueue, input: ToastInput): ToastQueue {
  return {
    toasts: [...queue.toasts, { ...input, id: queue.nextId }],
    nextId: queue.nextId + 1,
  };
}

export function dismissToast(queue: ToastQueue, id: number): ToastQueue {
  const toasts = queue.toasts.filter((toast) => toast.id !== id);
  return toasts.length === queue.toasts.length ? queue : { ...queue, toasts };
}

/** The toasts on screen now: the oldest ones, so nothing is skipped. */
export function visibleToasts(queue: ToastQueue): readonly Toast[] {
  return queue.toasts.slice(0, maxVisibleToasts);
}
