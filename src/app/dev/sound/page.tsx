import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoundDemo } from "./sound-demo";

export const metadata: Metadata = {
  title: "Sound",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the sound system; production builds answer 404. */
export default function SoundDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-copy flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Sound</h1>
        <p className="text-pretty text-ash type-prose-s">
          Wind, crickets, and an owl under the night, with a sting for each turn of fortune. Every
          sound is synthesized in the browser, and nothing plays until you turn it on.
        </p>
      </div>
      <SoundDemo />
    </main>
  );
}
