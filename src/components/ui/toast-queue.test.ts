import { describe, expect, it } from "vitest";
import {
  autoDismissMs,
  dismissToast,
  emptyToastQueue,
  enqueueToast,
  maxVisibleToasts,
  visibleToasts,
  type ToastInput,
} from "./toast-queue";

const notice = (title: string): ToastInput => ({ tone: "info", title });

describe("toast queue", () => {
  it("gives each toast a fresh id, even after dismissals", () => {
    let queue = enqueueToast(emptyToastQueue, notice("a"));
    queue = dismissToast(queue, 1);
    queue = enqueueToast(queue, notice("b"));
    expect(queue.toasts.map((toast) => toast.id)).toEqual([2]);
  });

  it(`shows at most ${String(maxVisibleToasts)}, oldest first, and promotes the next on dismiss`, () => {
    let queue = emptyToastQueue;
    for (const title of ["a", "b", "c"]) queue = enqueueToast(queue, notice(title));
    expect(visibleToasts(queue).map((toast) => toast.title)).toEqual(["a", "b"]);

    queue = dismissToast(queue, 1);
    expect(visibleToasts(queue).map((toast) => toast.title)).toEqual(["b", "c"]);
  });

  it("returns the same queue when the id is unknown", () => {
    const queue = enqueueToast(emptyToastQueue, notice("a"));
    expect(dismissToast(queue, 99)).toBe(queue);
  });

  it("never mutates the queue it was given", () => {
    const queue = enqueueToast(emptyToastQueue, notice("a"));
    enqueueToast(queue, notice("b"));
    dismissToast(queue, 1);
    expect(queue.toasts).toHaveLength(1);
    expect(emptyToastQueue.toasts).toHaveLength(0);
  });
});

describe("autoDismissMs", () => {
  it("lets notices and successes fade after five seconds", () => {
    expect(autoDismissMs("info")).toBe(5000);
    expect(autoDismissMs("success")).toBe(5000);
  });

  it("keeps warnings and errors until the player dismisses them", () => {
    expect(autoDismissMs("warning")).toBeUndefined();
    expect(autoDismissMs("error")).toBeUndefined();
  });
});
