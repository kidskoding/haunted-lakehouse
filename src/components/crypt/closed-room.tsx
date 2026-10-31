import Link from "next/link";
import { buttonClassName } from "@/components/ui/button-styles";

export interface ClosedRoomProps {
  readonly title: string;
  readonly line: string;
}

/** A room of the Crypt that isn't open yet: a line in the town's voice and the way back. */
export function ClosedRoom({ title, line }: ClosedRoomProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col justify-center gap-5 px-4 md:px-8">
      <h1 className="text-balance text-parchment type-display-m">{title}</h1>
      <p className="max-w-copy text-pretty text-ash type-prose">{line}</p>
      <Link href="/crypt" className={`${buttonClassName("ghost", "md")} self-start`}>
        Back to the Crypt
      </Link>
    </main>
  );
}
