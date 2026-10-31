import type { Metadata } from "next";
import { ClosedRoom } from "@/components/crypt/closed-room";

export const metadata: Metadata = {
  title: "The Codex",
  robots: { index: false, follow: false },
};

/** Where the earned autopsies will be read, until the Codex is built. */
export default function CodexPage() {
  return (
    <ClosedRoom
      title="The Codex is still being bound."
      line="Wren files every autopsy by hand, and she isn’t finished. Come back a little later."
    />
  );
}
