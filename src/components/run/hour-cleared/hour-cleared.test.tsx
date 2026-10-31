import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RelicView } from "@/lib/run/bottom-bar";
import { SoundProvider } from "@/lib/sound/react";
import type { RenderedAutopsy, RenderedLine, Segment } from "@/lib/story/types";
import { clearedSteps, HourCleared } from "./hour-cleared";

const text = (value: string): Segment[] => [{ kind: "text", text: value, style: "plain" }];
const beat: RenderedLine[] = [{ speaker: "mayor", thought: false, segments: text("Fine work.") }];
const autopsy: RenderedAutopsy = {
  title: text("Event logs are not state"),
  town: text("town"),
  tempting: text("tempting"),
  idea: text("idea"),
  production: text("production"),
  search: ["event sourcing"],
};
const lantern: RelicView = {
  kind: "wrens-lantern",
  name: "Wren's Lantern",
  flavor: "f",
  effect: "e",
};
const page = { numeral: "I", year: 1891, segments: text("Lamps lit: 4.") };

describe("clearedSteps", () => {
  it("walks the beat, the autopsy, then the offer", () => {
    expect(clearedSteps({ beat, offer: [lantern] })).toEqual(["beat", "autopsy", "relics"]);
  });

  it("skips the offer for a character never offered relics", () => {
    expect(clearedSteps({ beat, offer: [] })).toEqual(["beat", "autopsy"]);
  });

  it("keeps the beat step for a found page even without a scene", () => {
    expect(clearedSteps({ beat: [], page, offer: [] })).toEqual(["beat", "autopsy"]);
    expect(clearedSteps({ beat: [], offer: [] })).toEqual(["autopsy"]);
  });
});

describe("HourCleared", () => {
  it("opens on the town's beat, with the technique kept off the page until the autopsy", () => {
    const html = renderToStaticMarkup(
      <SoundProvider>
        <HourCleared
          title="Porch Lights"
          beat={beat}
          autopsy={autopsy}
          offer={[lantern]}
          onFinish={() => undefined}
        />
      </SoundProvider>,
    );
    expect(html).toContain("Porch Lights, cleared");
    expect(html).toContain("Fine work.");
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("Event logs are not state");
  });
});
