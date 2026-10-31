import type { Metadata } from "next";
import { ClosedRoom } from "@/components/crypt/closed-room";

export const metadata: Metadata = {
  title: "Characters",
  robots: { index: false, follow: false },
};

/** Where the character select will be, until it is built. */
export default function CharactersPage() {
  return (
    <ClosedRoom
      title="Nobody is waiting at the door yet."
      line="The rest of the night shift hasn’t clocked in. Come back a little later."
    />
  );
}
