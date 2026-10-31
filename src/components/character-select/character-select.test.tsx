import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { characterSelectView } from "@/server/unlocks/character-select";
import { applyAwards, awardsForBossClear, FRESH_UNLOCKS } from "@/server/unlocks/progress";
import { PAGE_IDS } from "@/server/narrative/progress";
import { CharacterSelect } from "./character-select";

const COMPLETE = applyAwards(
  FRESH_UNLOCKS,
  [
    ...awardsForBossClear("act-1", []),
    ...awardsForBossClear("act-2", []),
    ...awardsForBossClear("act-3", PAGE_IDS),
  ],
  PAGE_IDS,
);

describe("CharacterSelect", () => {
  it("keeps a locked secret character's id and name out of the page", () => {
    const html = renderToStaticMarkup(
      <CharacterSelect view={characterSelectView(FRESH_UNLOCKS)} />,
    );
    expect(html).not.toContain("old_wren");
    expect(html).not.toContain("Old Wren");
    expect(html).toContain('value="locked-3"');
  });

  it("sends the real id once the secret is unlocked", () => {
    const html = renderToStaticMarkup(<CharacterSelect view={characterSelectView(COMPLETE)} />);
    expect(html).toContain('value="old_wren"');
  });
});
