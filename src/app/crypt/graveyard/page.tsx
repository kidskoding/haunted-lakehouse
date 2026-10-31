import type { Metadata } from "next";
import { ClosedRoom } from "@/components/crypt/closed-room";

export const metadata: Metadata = {
  title: "The Graveyard",
  robots: { index: false, follow: false },
};

/** Where the tombstone wall will stand, until the Graveyard is built. */
export default function GraveyardPage() {
  return (
    <ClosedRoom
      title="The Graveyard gate is chained."
      line="The stones are up on the hill, but nobody has cut the paths between them yet."
    />
  );
}
