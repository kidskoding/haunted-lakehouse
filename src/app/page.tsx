import Link from "next/link";
import { buttonClassName } from "@/components/ui/button-styles";
import { site } from "@/lib/site";
import { HollowCreekScene } from "./hollow-creek-scene";

/*
 * Server-rendered: the title, the copy, and the link are plain HTML that works before any
 * script runs. The scene's still drawing ships in the same HTML; PixiJS loads after
 * hydration and takes over in place.
 */
export default function Home() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-night">
      <div className="relative z-10 mx-auto w-full max-w-page px-4 pt-16 md:px-8 md:pt-24">
        <h1 className="type-display-l text-parchment md:type-display-xl">{site.name}</h1>
        <p className="mt-4 max-w-copy type-heading text-parchment">{site.tagline}</p>
        <p className="mt-5 max-w-copy type-prose text-ash">
          You were hired this afternoon. From six, Hollow Creek&rsquo;s whole Halloween lands in
          your lakehouse, batch by batch: late, twice, and out of order. Something is already in it.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href="/run" className={buttonClassName("primary", "lg")}>
            Enter the night
          </Link>
          <p className="type-ui text-ash">
            {/* The run screen needs a laptop; phones can still read the story and the Crypt. */}
            <span className="xl:hidden">Best played on a laptop.</span>
            <span className="hidden xl:inline">Plays in your browser.</span> No install, no account.
          </p>
        </div>
      </div>
      {/*
       * On phones and short screens the scene follows the copy, its empty sky tucked up behind
       * the button; where there is room, it fills the page behind the copy. Stacked, the scene
       * is never shorter than its width-fitted frame (1600 by 490), so the moon is never cropped
       * and the town's lights stay below the copy.
       */}
      <div className="relative -mt-40 min-h-[max(30rem,30.625vw)] flex-1 open-sky:absolute open-sky:inset-0 open-sky:-z-10 open-sky:mt-0">
        <div className="absolute inset-0">
          <HollowCreekScene />
        </div>
        <div aria-hidden="true" className="absolute inset-0 bg-(image:--vignette-room)" />
      </div>
    </main>
  );
}
