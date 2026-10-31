import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RenderedLine, Segment } from "@/lib/story/types";
import { turnName, turnsOf } from "./speakers";
import { StoryPanel } from "./story-panel";
import { StoryText } from "./story-text";

const text = (value: string, style: Segment["style"] = "plain"): Segment => ({
  kind: "text",
  text: value,
  style,
});
const line = (speaker: RenderedLine["speaker"], words: string, thought = false): RenderedLine => ({
  speaker,
  thought,
  segments: [text(words)],
});
const markup = (segments: readonly Segment[], voiced = true) =>
  renderToStaticMarkup(<StoryText segments={segments} voiced={voiced} />);

describe("StoryText", () => {
  it("sets a run value apart, with tabular figures", () => {
    const html = markup([
      text("Hollow Creek has "),
      { kind: "value", key: "house_count", text: "1,204 homes", style: "plain" },
    ]);
    expect(html).toBe(
      'Hollow Creek has <span data-segment="value" class="font-semibold text-glow tabular-nums lining-nums">1,204 homes</span>',
    );
  });

  it("leaves how the cast addresses the player as ordinary words", () => {
    const html = markup([
      text("Welcome aboard, "),
      { kind: "value", key: "you", text: "new hire", style: "plain" },
    ]);
    expect(html).toBe("Welcome aboard, new hire");
  });

  it("renders a fogged value as its words, in the fog", () => {
    const html = markup([
      { kind: "fog", key: "n", text: "a number lost in the fog", style: "plain" },
    ]);
    expect(html).toContain('data-segment="fog"');
    expect(html).toContain(">a number lost in the fog</span>");
  });

  it("flips emphasis against the voice, as in print", () => {
    expect(markup([text("then", "em")], true)).toBe('<em class="not-italic">then</em>');
    expect(markup([text("then", "em")], false)).toBe('<em class="italic">then</em>');
  });

  it("maps strong and code, and keeps a styled value's emphasis", () => {
    expect(markup([text("no", "strong")])).toBe('<strong class="font-semibold">no</strong>');
    expect(markup([text("bronze", "code")])).toMatch(
      /^<code class="[^"]*type-code[^"]*">bronze<\/code>$/,
    );
    const html = markup([{ kind: "value", key: "n", text: "7", style: "strong" }]);
    expect(html).toMatch(/^<strong[^>]*><span data-segment="value"[^>]*>7<\/span><\/strong>$/);
  });

  it("never treats story text as markup", () => {
    expect(markup([text("<b>boo</b> & co")])).toBe("&lt;b&gt;boo&lt;/b&gt; &amp; co");
  });
});

describe("turnsOf", () => {
  it("groups a speaker's consecutive lines and splits on a change of speaker", () => {
    const turns = turnsOf([
      line("mayor", "One."),
      line("mayor", "Two."),
      line("wren", "Three."),
      line("mayor", "Four."),
    ]);
    expect(turns.map((turn) => [turn.speaker, turn.lines.length])).toEqual([
      ["mayor", 2],
      ["wren", 1],
      ["mayor", 1],
    ]);
  });

  it("keeps a thought apart from speech by the same speaker", () => {
    const turns = turnsOf([line("wren", "Said."), line("wren", "Thought.", true)]);
    expect(turns.map(turnName)).toEqual(["Wren", "Wren, to herself"]);
  });

  it("is empty for an empty scene", () => {
    expect(turnsOf([])).toEqual([]);
  });
});

describe("StoryPanel", () => {
  it("names every turn's speaker, the narrator included, and hides monograms", () => {
    const html = renderToStaticMarkup(
      <StoryPanel
        title="Porch Lights"
        lines={[line("mayor", "Count them."), line("narrator", "He leaves.")]}
      />,
    );
    expect(html).toContain(">The Mayor</p>");
    expect(html).toContain('<p class="sr-only">Narrator</p>');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>M<\/span>/);
  });

  it("shows the quiet state when there is no scene", () => {
    const html = renderToStaticMarkup(<StoryPanel title="Story" lines={[]} />);
    expect(html).toContain("Nobody in Hollow Creek has asked for anything yet.");
    expect(html).not.toContain("<ol");
  });

  it("puts tips in a labelled aside after the scene", () => {
    const html = renderToStaticMarkup(
      <StoryPanel
        title="Porch Lights"
        lines={[line("mayor", "Count them.")]}
        asides={[{ id: "story", segments: [text("Read it closely.")] }]}
      />,
    );
    expect(html).toMatch(/<aside aria-label="First-night tips"[^>]*>[\s\S]*Read it closely\./);
  });
});
