import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { candleLostSpecimens } from "./fixtures";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Candle lost",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the candle-lost moment; production builds answer 404. */
export default function CandleLostDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <Gallery specimens={candleLostSpecimens()} />;
}
