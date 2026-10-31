import type { Metadata } from "next";
import { ClosedRoom } from "@/components/crypt/closed-room";

export const metadata: Metadata = {
  title: "The Daily Haunt",
  robots: { index: false, follow: false },
};

/** Where today's seed and its leaderboard will be, until the Daily Haunt is built. */
export default function DailyPage() {
  return (
    <ClosedRoom
      title="Today’s haunt isn’t posted."
      line="The board outside town hall is still blank. Come back a little later."
    />
  );
}
