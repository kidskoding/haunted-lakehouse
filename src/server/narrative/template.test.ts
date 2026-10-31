import { describe, expect, it } from "vitest";
import { parseTemplate, placeholdersOf, TemplateError } from "./template";

describe("parseTemplate", () => {
  it("splits text from placeholders and reads their formats", () => {
    expect(parseTemplate("At {checkpoint}, {n|plural:house,houses} and {*shown|number}.")).toEqual([
      { kind: "text", text: "At ", style: "plain" },
      { kind: "slot", name: "checkpoint", symptom: false, format: null, style: "plain" },
      { kind: "text", text: ", ", style: "plain" },
      {
        kind: "slot",
        name: "n",
        symptom: false,
        format: { kind: "plural", one: "house", many: "houses" },
        style: "plain",
      },
      { kind: "text", text: " and ", style: "plain" },
      { kind: "slot", name: "shown", symptom: true, format: { kind: "number" }, style: "plain" },
      { kind: "text", text: ".", style: "plain" },
    ]);
  });

  it("reads every format", () => {
    const formats = placeholdersOf(
      "{a|number}{b|word}{c|Word}{d|words:batch,batches}{e|clock}{f}",
    ).map((slot) => slot.format);
    expect(formats).toEqual([
      { kind: "number" },
      { kind: "word", capital: false },
      { kind: "word", capital: true },
      { kind: "words", one: "batch", many: "batches" },
      { kind: "clock" },
      null,
    ]);
  });

  it("carries emphasis, strong, and code styles onto text and placeholders", () => {
    const nodes = parseTemplate("on *at that {when}*, **state**, `on*off`");
    expect(nodes.map((node) => [node.kind, node.style])).toEqual([
      ["text", "plain"],
      ["text", "em"],
      ["slot", "em"],
      ["text", "plain"],
      ["text", "strong"],
      ["text", "plain"],
      ["text", "code"],
    ]);
    expect(nodes.at(-1)).toMatchObject({ text: "on*off" });
  });

  it("unescapes backslashed markup", () => {
    expect(parseTemplate("\\{not a slot\\} \\*plain\\* \\`x\\` \\\\")).toEqual([
      { kind: "text", text: "{not a slot} *plain* `x` \\", style: "plain" },
    ]);
  });

  it.each([
    ["an unclosed placeholder", "the {count"],
    ["a stray brace", "the count}"],
    ["an empty placeholder", "the {}"],
    ["a name with spaces", "{two words}"],
    ["an unknown format", "{n|shout}"],
    ["a format given arguments it doesn't take", "{n|number:2}"],
    ["a plural with one form", "{n|plural:house}"],
    ["a plural with an empty form", "{n|plural:house,}"],
    ["unclosed emphasis", "on *at that moment"],
    ["styles crossing", "*em **strong** em*"],
    ["a dangling backslash", "trailing \\"],
    ["a backslash before a letter", "\\n"],
  ])("rejects %s", (_, source) => {
    expect(() => parseTemplate(source)).toThrow(TemplateError);
  });
});
