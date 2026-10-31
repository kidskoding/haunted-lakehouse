import type { Metadata } from "next";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button-styles";

export const metadata: Metadata = {
  title: "The night isn’t ready yet",
  robots: { index: false, follow: false },
};

/** Where "Enter the night" lands until the run screen is built. */
export default function RunPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col justify-center gap-5 px-4 md:px-8">
      <h1 className="type-display-m text-parchment">The night isn&rsquo;t ready yet.</h1>
      <p className="max-w-copy type-prose text-ash">
        Old Wren is still lighting the lamps along the shore. Come back a little later.
      </p>
      <Link href="/" className={`${buttonClassName("ghost", "md")} self-start`}>
        Back to Hollow Creek
      </Link>
    </main>
  );
}
