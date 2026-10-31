import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tab, TabList, TabPanel, Tabs } from "./tabs";

const values = ["model one", "model_one", "model-one", "model%20one", "model_20_one"];

/** Reads one attribute from every element with the given role, in document order. */
function attributes(html: string, role: string, name: string): string[] {
  const elements = html.match(new RegExp(`<[^>]*role="${role}"[^>]*>`, "g")) ?? [];
  return elements.map((element) => {
    const match = new RegExp(`\\s${name}="([^"]*)"`).exec(element);
    return match?.[1] ?? "";
  });
}

describe("Tabs ids", () => {
  const html = renderToStaticMarkup(
    <Tabs defaultValue="model one">
      <TabList aria-label="Models">
        {values.map((value) => (
          <Tab key={value} value={value}>
            {value}
          </Tab>
        ))}
      </TabList>
      {values.map((value) => (
        <TabPanel key={value} value={value} />
      ))}
    </Tabs>,
  );
  const tabIds = attributes(html, "tab", "id");
  const panelIds = attributes(html, "tabpanel", "id");

  it("gives every tab value a distinct id", () => {
    expect(new Set([...tabIds, ...panelIds]).size).toBe(values.length * 2);
  });

  it("keeps whitespace out of ids, since ID references split on it", () => {
    for (const id of [...tabIds, ...panelIds]) expect(id).not.toMatch(/\s/);
  });

  it("points each tab at its own panel and each panel back at its tab", () => {
    expect(attributes(html, "tab", "aria-controls")).toEqual(panelIds);
    expect(attributes(html, "tabpanel", "aria-labelledby")).toEqual(tabIds);
  });

  it("scopes ids to each Tabs instance", () => {
    const twice = renderToStaticMarkup(
      <>
        <Tabs defaultValue="a">
          <Tab value="a">A</Tab>
        </Tabs>
        <Tabs defaultValue="a">
          <Tab value="a">A</Tab>
        </Tabs>
      </>,
    );
    const ids = attributes(twice, "tab", "id");
    expect(new Set(ids).size).toBe(2);
  });
});
