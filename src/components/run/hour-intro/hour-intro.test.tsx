import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HourIntro, type BossIntroView, type CurseIntroView } from "./hour-intro";

const fog: CurseIntroView = {
  name: "Curse of the Fog",
  flavor: "The fog's in.",
  effect: "The story withholds the symptom numbers.",
  bonusRelic: true,
};
const feed: BossIntroView = {
  title: "The Possessed Feed",
  time: "19:30",
  tier: 2,
  act: 1,
  candleCost: 2,
};
const render = (boss: BossIntroView | null, curse: CurseIntroView | null) =>
  renderToStaticMarkup(<HourIntro boss={boss} curse={curse} onBegin={() => undefined} />);

describe("HourIntro", () => {
  it("names a curse, what it changes, and the relic it pays, in fog", () => {
    const html = render(null, fog);
    expect(html).toContain("Curse of the Fog");
    expect(html).toContain("withholds the symptom numbers");
    expect(html).toContain("one more relic");
    expect(html).toContain("data-fog");
    expect(html).not.toContain("candles");
  });

  it("promises no relic when the engine says none comes", () => {
    expect(render(null, { ...fog, bonusRelic: false })).not.toContain("one more relic");
  });

  it("presents a boss with its time, act, tier, and two-candle cost, without fog", () => {
    const html = render(feed, null);
    expect(html).toContain("The Possessed Feed");
    expect(html).toContain("7:30pm");
    expect(html).toContain("Act I, Dusk");
    expect(html).toContain('aria-label="Difficulty 2 of 5"');
    expect(html).toContain("★★☆☆☆");
    expect(html).toContain("two candles");
    expect(html).not.toContain("data-fog");
  });

  it("gives a cursed boss both, with the boss title as the moment's name", () => {
    const html = render(feed, fog);
    expect(html).toContain("data-fog");
    expect(html).toMatch(/<h2[^>]*>The Possessed Feed<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Curse of the Fog<\/h3>/);
  });

  it("renders nothing for an hour that is neither", () => {
    expect(render(null, null)).toBe("");
  });
});
