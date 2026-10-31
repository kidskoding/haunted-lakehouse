import { describe, expect, it, vi } from "vitest";
import { shareLink, type ShareTarget } from "./share";

const link = { title: "Haunted Lakehouse", text: "A New Hire", url: "https://x.test/tombstone" };

function clipboard(fails = false) {
  return {
    writeText: vi.fn(() => (fails ? Promise.reject(new Error("denied")) : Promise.resolve())),
  };
}

describe("shareLink", () => {
  it("uses the share sheet when there is one", async () => {
    const target = { share: vi.fn(() => Promise.resolve()), clipboard: clipboard() };
    await expect(shareLink(link, target)).resolves.toBe("shared");
    expect(target.share).toHaveBeenCalledWith(link);
    expect(target.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("treats a closed share sheet as a choice and copies nothing", async () => {
    const target = {
      share: () => Promise.reject(new DOMException("closed", "AbortError")),
      clipboard: clipboard(),
    };
    await expect(shareLink(link, target)).resolves.toBe("cancelled");
    expect(target.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("copies the link when the share sheet breaks or cannot take it", async () => {
    const broken = {
      share: () => Promise.reject(new DOMException("no", "NotAllowedError")),
      clipboard: clipboard(),
    };
    await expect(shareLink(link, broken)).resolves.toBe("copied");
    expect(broken.clipboard.writeText).toHaveBeenCalledWith(link.url);

    const refusing = { share: vi.fn(), canShare: () => false, clipboard: clipboard() };
    await expect(shareLink(link, refusing)).resolves.toBe("copied");
    expect(refusing.share).not.toHaveBeenCalled();
  });

  it("copies the link where there is no share sheet, as on desktop Linux", async () => {
    const target = { clipboard: clipboard() };
    await expect(shareLink(link, target)).resolves.toBe("copied");
  });

  it("fails when the clipboard is missing or refuses", async () => {
    const none: ShareTarget = {};
    await expect(shareLink(link, none)).resolves.toBe("failed");
    await expect(shareLink(link, { clipboard: clipboard(true) })).resolves.toBe("failed");
  });
});
