import { StoryText } from "@/components/run/story/story-text";
import type { RenderedAutopsy, Segment } from "@/lib/story/types";

type Level = "h3" | "h4";

function AutopsySection({
  level: Heading,
  heading,
  segments,
}: {
  readonly level: Level;
  readonly heading: string;
  readonly segments: readonly Segment[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Heading className="text-parchment type-ui-l">{heading}</Heading>
      <p className="text-pretty text-parchment type-prose-s">
        <StoryText segments={segments} voiced={false} />
      </p>
    </div>
  );
}

/**
 * The body of a "What really happened" card, under whatever title its host gives it. Shared by
 * the hour-cleared moment and the Codex, so an autopsy reads the same wherever it is opened.
 */
export function AutopsySections({
  autopsy,
  level = "h4",
}: {
  readonly autopsy: RenderedAutopsy;
  /** The sections' heading level, one below whatever heads the card in its host. */
  readonly level?: Level;
}) {
  const Heading = level;
  return (
    <>
      <AutopsySection level={level} heading="In your data" segments={autopsy.town} />
      <AutopsySection
        level={level}
        heading="Why the easy answer was tempting"
        segments={autopsy.tempting}
      />
      <AutopsySection level={level} heading="The idea" segments={autopsy.idea} />
      <AutopsySection level={level} heading="In production" segments={autopsy.production} />
      {autopsy.search.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Heading className="text-parchment type-ui-l">To look up</Heading>
          <ul className="flex flex-wrap gap-2">
            {autopsy.search.map((term) => (
              <li key={term} className="rounded-xs bg-inset px-2 py-1 text-ash type-ui">
                {term}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
