export interface ShareLink {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

/** The parts of `navigator` sharing uses; every one may be missing, as on desktop Linux. */
export interface ShareTarget {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly canShare?: (data?: ShareData) => boolean;
  readonly clipboard?: Pick<Clipboard, "writeText">;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * Hands the link to the system share sheet where there is one, and copies it otherwise. A
 * share sheet the player closes is a choice, not a failure; one that breaks falls back to the
 * clipboard.
 */
export async function shareLink(link: ShareLink, target: ShareTarget): Promise<ShareOutcome> {
  if (target.share && (target.canShare?.(link) ?? true)) {
    try {
      await target.share(link);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  if (!target.clipboard) return "failed";
  try {
    await target.clipboard.writeText(link.url);
    return "copied";
  } catch {
    return "failed";
  }
}
