import { cx } from "@/components/ui/cx";

/*
 * Four banks of fog, one per edge, each pushed partly off the frame and blurred soft. Each
 * creeps in from its own edge; `--fog-from` is where it starts.
 */
const BANKS = [
  "inset-y-[-15%] -left-36 w-80 [--fog-from:-8rem_0]",
  "inset-y-[-15%] -right-36 w-80 [--fog-from:8rem_0]",
  "inset-x-[-15%] -top-32 h-64 [--fog-from:0_-6rem]",
  "inset-x-[-15%] -bottom-32 h-64 [--fog-from:0_6rem]",
];

/**
 * The fog a curse brings: banks drifting in over the frame's edges (art direction §6.4). It
 * fills its nearest positioned ancestor and takes no pointer events. Calm motion shows it at
 * once at its final opacity, a still scrim with no drift.
 */
export function CurseFog({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-fog=""
      className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {BANKS.map((bank) => (
        <div
          key={bank}
          className={cx("absolute rounded-full bg-fog opacity-90 blur-3xl fog-creep", bank)}
        />
      ))}
    </div>
  );
}
