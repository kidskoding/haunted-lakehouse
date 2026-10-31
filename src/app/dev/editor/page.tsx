import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorDemo } from "./editor-demo";

export const metadata: Metadata = {
  title: "SQL editor",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the model editor; production builds answer 404. */
export default function EditorDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-8 py-16">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">SQL editor</h1>
        <p className="text-pretty text-ash type-prose">
          CodeMirror 6 with schema-aware completion, per-model tabs, a materialization picker,
          format-on-demand, and the Preview / Run the night shortcuts. This page exists only in
          development.
        </p>
      </header>
      <EditorDemo />
    </main>
  );
}
