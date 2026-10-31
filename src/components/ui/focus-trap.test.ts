import { describe, expect, it } from "vitest";
import {
  byTabOrder,
  isTabVisible,
  TABBABLE_SELECTOR,
  wrappedTabIndex,
  wrapTarget,
  type RadioState,
} from "./focus-trap";

describe("TABBABLE_SELECTOR", () => {
  it("includes contenteditable hosts so Tab does not skip controls after an editor", () => {
    expect(TABBABLE_SELECTOR).toContain("[contenteditable]:not([contenteditable='false'])");
  });

  it("includes summary so a details disclosure does not break the trap wrap", () => {
    expect(TABBABLE_SELECTOR.split(",")).toContain("summary");
  });
});

describe("isTabVisible", () => {
  it("asks checkVisibility to treat visibility:hidden as not tabbable", () => {
    const seen: unknown[] = [];
    const element = {
      checkVisibility: (options?: { visibilityProperty?: boolean }) => {
        seen.push(options);
        return false;
      },
    };
    expect(isTabVisible(element)).toBe(false);
    expect(seen).toEqual([{ visibilityProperty: true }]);
  });
});

describe("byTabOrder", () => {
  it("puts positive tabIndex values ahead of ordinary controls, ascending", () => {
    const items = [{ tabIndex: 0 }, { tabIndex: 2 }, { tabIndex: 0 }, { tabIndex: 1 }];
    expect([...items].sort(byTabOrder).map((item) => item.tabIndex)).toEqual([1, 2, 0, 0]);
  });
});

describe("wrappedTabIndex", () => {
  it("wraps Tab from the last element to the first", () => {
    expect(wrappedTabIndex(2, 3, false)).toBe(0);
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    expect(wrappedTabIndex(0, 3, true)).toBe(2);
  });

  it("leaves moves inside the trap to the browser", () => {
    expect(wrappedTabIndex(0, 3, false)).toBeUndefined();
    expect(wrappedTabIndex(2, 3, true)).toBeUndefined();
    expect(wrappedTabIndex(1, 3, false)).toBeUndefined();
  });

  it("enters from the container at the end Tab points to", () => {
    expect(wrappedTabIndex(-1, 3, false)).toBe(0);
    expect(wrappedTabIndex(-1, 3, true)).toBe(2);
  });

  it("keeps a single element focused", () => {
    expect(wrappedTabIndex(0, 1, false)).toBe(0);
    expect(wrappedTabIndex(0, 1, true)).toBe(0);
  });

  it("does nothing when nothing can take focus", () => {
    expect(wrappedTabIndex(-1, 0, false)).toBeUndefined();
  });
});

interface Stub {
  readonly label: string;
  readonly radio?: RadioState;
}

const button = (label: string): Stub => ({ label });
const radio = (label: string, name: string, checked = false, form: object | null = null): Stub => ({
  label,
  radio: { name, checked, form },
});
const radioOf = (stub: Stub) => stub.radio;
const wrap = (elements: readonly Stub[], active: Stub | null, backward: boolean) =>
  wrapTarget(elements, active, backward, radioOf)?.label;

describe("wrapTarget with radio groups", () => {
  it("counts a checked group at the end as its checked radio", () => {
    const cancel = button("cancel");
    const dusk = radio("dusk", "act", true);
    const elements = [cancel, dusk, radio("night", "act"), radio("witching", "act")];
    expect(wrap(elements, dusk, false)).toBe("cancel");
    expect(wrap(elements, cancel, true)).toBe("dusk");
  });

  it("counts an unchecked group at the end as its first radio", () => {
    const cancel = button("cancel");
    const dusk = radio("dusk", "act");
    const elements = [cancel, dusk, radio("night", "act"), radio("witching", "act")];
    expect(wrap(elements, dusk, false)).toBe("cancel");
    expect(wrap(elements, null, true)).toBe("dusk");
  });

  it("counts a checked group at the start as its checked radio", () => {
    const night = radio("night", "act", true);
    const confirm = button("confirm");
    const elements = [radio("dusk", "act"), night, confirm];
    expect(wrap(elements, night, true)).toBe("confirm");
    expect(wrap(elements, confirm, false)).toBe("night");
  });

  it("counts an unchecked group at the start as its first radio", () => {
    const night = radio("night", "act");
    const elements = [radio("dusk", "act"), night, button("confirm")];
    // Focus can sit on any member (a click, or `data-autofocus`); Shift+Tab still leaves the group.
    expect(wrap(elements, night, true)).toBe("confirm");
    expect(wrap(elements, null, false)).toBe("dusk");
  });

  it("keeps groups with the same name in different forms apart", () => {
    const first = {};
    const second = {};
    const last = radio("last", "act", true, second);
    const elements = [radio("one", "act", true, first), last];
    expect(wrap(elements, last, false)).toBe("one");
  });

  it("counts an unnamed radio as its own stop", () => {
    const lone = radio("lone", "");
    const elements = [button("cancel"), radio("other", ""), lone];
    expect(wrap(elements, lone, false)).toBe("cancel");
    expect(wrap(elements, null, true)).toBe("lone");
  });
});
