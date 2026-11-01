import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryPanel } from "@/components/run/story";
import { storySpecimens } from "./specimens";

export const metadata: Metadata = {
  title: "Story panel",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the story panel; production builds answer 404. */
export default function StoryDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-8 px-4 py-12 md:px-8 3xl:max-w-none">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Story panel</h1>
        <p className="text-pretty text-ash type-prose">
          Real scenes from the launch packs, rendered by the narrative engine for the seed
          raven-pumpkin-13. Each panel is sized like the run screen&rsquo;s story panel and scrolls
          on its own.
        </p>
      </header>
      <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2 3xl:grid-cols-3">
        {storySpecimens().map(({ id, caption, ...panel }) => (
          <figure key={id} className="flex flex-col gap-3">
            <div className="h-144">
              <StoryPanel {...panel} />
            </div>
            <figcaption className="text-ash type-ui">{caption}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
