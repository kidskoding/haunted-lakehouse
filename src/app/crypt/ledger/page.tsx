import type { Metadata } from "next";
import { ClosedRoom } from "@/components/crypt/closed-room";

export const metadata: Metadata = {
  title: "The Ledger",
  robots: { index: false, follow: false },
};

/** Where the torn pages will be laid out, until the Ledger is built. */
export default function LedgerPage() {
  return (
    <ClosedRoom
      title="The Ledger stays shut tonight."
      line="Every page you find is kept. There’s just nowhere to lay them out yet."
    />
  );
}
