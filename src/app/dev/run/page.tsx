import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunDemo } from "./run-demo";

export const metadata: Metadata = {
  title: "Run screen",
  robots: { index: false, follow: false },
};

/**
 * Development-only proving ground for the run-screen layout. The real run route needs a
 * created run and its batches from the server, which no route serves yet, so the layout is
 * mounted here with fixtures; production builds answer 404.
 */
export default function RunDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <RunDemo />;
}
