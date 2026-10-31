import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandleClockDemo } from "./candle-clock-demo";

export const metadata: Metadata = {
  title: "Scene shell",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the scene shell; production builds answer 404. */
export default function SceneDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Scene shell</h1>
      <p className="text-neutral-300">
        A PixiJS scene loaded after first paint. It holds still under reduced motion and pauses
        while the tab is hidden.
      </p>
      <CandleClockDemo />
    </main>
  );
}
