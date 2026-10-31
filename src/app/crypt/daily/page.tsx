import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DailyHaunt } from "@/components/crypt/daily-haunt";
import type { DailyToday } from "@/lib/crypt/daily";
import { dailyToday, loadDailyStanding } from "@/server/daily/daily";

export const metadata: Metadata = {
  title: "The Daily Haunt",
  robots: { index: false, follow: false },
};

async function Standing({ today }: { readonly today: DailyToday }) {
  return <DailyHaunt today={today} standing={await loadDailyStanding(today.date)} />;
}

/**
 * Today's seed, the caller's one attempt, and today's board. The seed is posted at once; the
 * attempt and board stream in behind it from the database.
 */
export default async function DailyPage() {
  // The seed turns over at midnight UTC, so the page is read per request, never prerendered.
  await connection();
  const today = dailyToday(new Date());
  return (
    <Suspense fallback={<DailyHaunt today={today} standing="loading" />}>
      <Standing today={today} />
    </Suspense>
  );
}
