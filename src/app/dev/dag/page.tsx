import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DagDemo } from "./dag-demo";

export const metadata: Metadata = {
  title: "Pipeline DAG",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the pipeline DAG; production builds answer 404. */
export default function DagDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-8 px-8 py-12">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Pipeline DAG</h1>
        <p className="text-pretty text-ash type-prose">
          Live graph of the hour&rsquo;s models from <code className="type-data">compile()</code>{" "}
          output. Bronze feeds sit on the left; silver and gold flow right. Arrow keys walk the
          models; Enter opens the editor tab.
        </p>
      </header>
      <DagDemo />
    </main>
  );
}
