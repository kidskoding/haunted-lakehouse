import "server-only";
import { slotDefinition, type Slot } from "../engine/slots";
import { marisol, mayor, moribund, narrator, wren } from "./lines";
import { holdsEveryPage, type StoryEndingId, type StoryProgress } from "./progress";
import type { Line, Scene } from "./types";

export interface Ending {
  readonly id: StoryEndingId;
  readonly title: string;
  readonly scene: Scene;
  /** The keys this ending reads, beyond the shared ones, filled from the run. */
  readonly bindings: readonly string[];
}

const dusk: Ending = {
  id: "act-1",
  title: "Dusk",
  bindings: ["unknown_rows"],
  scene: [
    narrator("The bat on the Town Green fills with air and stands up."),
    mayor(
      "Every delivery accounted for. {unknown_rows} of them 'unknown', which I've decided is a quantity. Good work, {you}. Go home. The night shift can handle the rest.",
    ),
    wren("There isn't a night shift. There's you."),
    narrator("A reply arrives from Moribund Party Supply's support inbox:"),
    moribund(
      "Our feed has not changed since 2019. Our logs show clean files all evening. Please do not reply to this message.",
    ),
    wren("Then who rewrote it?"),
    narrator(
      "She doesn't wait for an answer. She's looking at the rows you kept, the ones whose quantity came through as a word.",
    ),
    wren(
      "The town used to write things down like that. 'Lots.' 'A handful.' We kept them exactly as they were said. You kept them. Not everyone does.",
    ),
    narrator("She puts her coat on."),
    wren("Come back tomorrow night. Stay past eight. It gets stranger after eight."),
  ],
};

const night: Ending = {
  id: "act-2",
  title: "Night",
  bindings: ["flameouts_total"],
  scene: [
    narrator(
      "The last pumpkin on the hill is still lit. It has burned at the same brightness since six o'clock.",
    ),
    mayor(
      "{flameouts_total} out, final, carved, thank you. One more thing. Finance found a storage folder nobody owns. `ledger/_delta_log`. A few cents a month since 2020. Delete it.",
    ),
    wren("No."),
    mayor("I'm sorry?"),
    wren("No, Mr. Mayor."),
    narrator("She hangs up for him."),
    wren(
      "There was a ledger. Every Halloween since 1891. Every lamp lit, every child at every door, what they were given, in their own words. My family kept it. In 2020 the town modernized, the ledger didn't fit the new shape, and it was dropped. That folder is what's left. Its diary.",
    ),
    narrator("She looks at the candle that doesn't flicker."),
    wren(
      "Kids call it the Hollow. Whatever's been rewriting your feeds. I used to tell them that was nonsense. Come back after eleven. It'll be waiting for you at two.",
    ),
  ],
};

const STILL_OUT_THERE =
  "Not in the lakehouse. In the town's feeds, every Halloween since, in the rows nobody wanted. Look at what your pipelines throw away. That's where it's been standing.";

/** Wren's pointer to the pages, which counts them once the player holds some. */
function seancePointer(pagesFound: number): Line {
  return pagesFound > 0
    ? wren(`{pages_found|Word} of seven. The rest are still out there. ${STILL_OUT_THERE}`)
    : wren(`Some of it is still out there. ${STILL_OUT_THERE}`);
}

function witchingHour(pagesFound: number): Ending {
  return {
    id: "act-3",
    title: "The Witching Hour",
    bindings: ["restored_version", "restored_rows", "restored_last_year", "lost_versions"].concat(
      pagesFound > 0 ? ["pages_found"] : [],
    ),
    scene: [
      narrator(
        "The ledger comes back as it stood at version {restored_version}: {restored_rows} lines, 1891 to {restored_last_year}. After that the diary goes on for {lost_versions} more entries that can't be read whole. The first line reads: *Hallowe'en, 1891. Callers: 2, the Thorne girls. Given: lots.*",
      ),
      narrator("Wren reads it for a long time."),
      wren(
        "I ran the vacuum. That night in 2020, at the second 1:40, with the safety off, because the Mayor wanted it gone by morning and I wanted to go home. I stopped it at 1:47, when I saw the new table started at 1950. Seven minutes. That's what it cost. Seven minutes of deleting.",
      ),
      wren(
        "You brought back everything that can be read whole. The rest, the diary remembers happening and can't say what it was.",
      ),
      narrator("She closes the laptop."),
      seancePointer(pagesFound),
      narrator("3:00am. The clocks agree with each other again."),
    ],
  };
}

const kept: Ending = {
  id: "true",
  title: "Kept",
  bindings: ["restored_version", "lamps_lit_final", "kids_out", "pieces_given_total"],
  scene: [
    narrator(
      "The ledger comes back as it stood at version {restored_version}. This time you have the pages. They aren't rows. They're what the rows never had a column for, from seven different nights, and they fit.",
    ),
    wren(
      "1918. Thirteen bowls and nobody came. 1962, my mother: *do not tidy these.* 1987. I typed that. I was twenty-five and I checked every line twice.",
    ),
    narrator(
      "The sixth page is a memo. *I want the old table gone by morning. Storage is a line item.* It is signed.",
    ),
    narrator("The Mayor has come up the hill in his good coat. He reads it over her shoulder."),
    mayor("I said that. I said it in that tone, too."),
    mayor("I didn't ask what we'd lose. I never ask. It's a policy."),
    wren("And I didn't tell you. That one's mine."),
    narrator("Marisol arrives out of breath, with a shoebox of receipts from 1946."),
    marisol("It balances. The whole town balances. I've never seen that before."),
    narrator("Wren turns the laptop to you."),
    wren("One more line. Tonight's. You write it."),
    narrator(
      "*Hallowe'en, 2026. Lamps lit: {lamps_lit_final}. Callers: {kids_out}. Given: {pieces_given_total}. Kept by {keeper_name}.*",
    ),
    narrator(
      "The table commits. A new version. Then, without anyone running anything, a second row appears below yours:",
    ),
    narrator("`2026 | Hallowe'en | kept`"),
    narrator(
      "The green leaves the screen. On the hill, the candle that never flickered gutters and goes out, the ordinary way, wax and wick.",
    ),
    wren("Kept. Every line of it. I'd forgotten what that word was for."),
  ],
};

/**
 * The ending a boss clear plays, if any. Act I and II endings play once, the first time; the
 * Séance always ends the run, and holding all seven pages turns it into the true ending.
 */
export function endingFor(slot: Slot, progress: StoryProgress): StoryEndingId | null {
  const { boss, act } = slotDefinition(slot);
  if (!boss) return null;
  if (act === 3) return holdsEveryPage(progress) ? "true" : "act-3";
  const id = act === 1 ? "act-1" : "act-2";
  return progress.endingsSeen.includes(id) ? null : id;
}

/** An ending's text. The Séance ending counts the pages the player holds. */
export function ending(id: StoryEndingId, pagesFound = 0): Ending {
  switch (id) {
    case "act-1":
      return dusk;
    case "act-2":
      return night;
    case "act-3":
      return witchingHour(pagesFound);
    case "true":
      return kept;
  }
}
