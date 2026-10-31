import type {
  CharacterCard,
  CharacterQuote,
  CharacterSelectView,
} from "@/server/unlocks/character-select";
import { Button } from "../ui/button";
import { cx } from "../ui/cx";
import { CandleLitIcon } from "../ui/icons";
import { RadioForm } from "./radio-form";

export interface CharacterSelectProps {
  readonly view: CharacterSelectView;
  /** Where confirming goes; the chosen character arrives as `?character=<id>`. */
  readonly action?: string;
}

const TITLE_ID = "character-select-title";

/**
 * The run's first choice. Native radios give the APG radio group for free: arrows move and
 * check, locked characters are skipped, and the form sends the choice. Script only adds Enter to confirm.
 */
export function CharacterSelect({ view, action = "/run" }: CharacterSelectProps) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-12 sm:px-8 lg:py-20">
      <RadioForm action={action} method="get" className="flex flex-col gap-10">
        <div className="flex max-w-copy flex-col gap-3">
          <h1 id={TITLE_ID} className="type-display-l text-parchment">
            Who takes the night?
          </h1>
          <p className="type-prose text-ash">
            The lakehouse needs someone on call from 6pm to 3am. Choose who answers when it breaks.
          </p>
        </div>

        <fieldset
          role="radiogroup"
          aria-labelledby={TITLE_ID}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {view.cards.map((card, index) => {
            // A secret stays secret in the page too, keys included, since they ride in the RSC
            // payload; its radio is disabled, so the stand-in value is never sent.
            const value =
              card.locked && card.preview === null ? `locked-${String(index)}` : card.id;
            return (
              <CharacterOption
                key={value}
                card={card}
                value={value}
                checked={card.id === view.defaultCharacter}
              />
            );
          })}
        </fieldset>

        {/* On a phone the cards run long, so the confirm rides along at the bottom. */}
        <div className="sticky bottom-0 -mx-4 bg-night px-4 py-4 sm:static sm:mx-0 sm:p-0">
          <Button type="submit" variant="primary" size="lg">
            Start the night
          </Button>
        </div>
      </RadioForm>
    </main>
  );
}

function CharacterOption({
  card,
  value,
  checked,
}: {
  card: CharacterCard;
  value: string;
  checked: boolean;
}) {
  const detailsId = `character-${value}-details`;
  const shown = card.locked ? card.preview : card;

  return (
    <label
      className={cx(
        "group relative flex flex-col gap-5 rounded-m bg-panel p-5",
        "transition-colors duration-fast ease-out",
        "has-checked:bg-tint-flame has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
        "has-focus-visible:outline-glow",
        card.locked
          ? "cursor-not-allowed"
          : "cursor-pointer ui-hover:bg-raised ui-hover:has-checked:bg-tint-flame",
      )}
    >
      <input
        type="radio"
        name="character"
        value={value}
        defaultChecked={checked}
        disabled={card.locked}
        aria-describedby={detailsId}
        // Keeps a focused card clear of the phone's sticky confirm bar.
        className="peer sr-only scroll-mb-24 sm:scroll-mb-0"
      />
      <Portrait card={card} />
      {card.locked ? null : <RadioMark />}

      <div className="flex flex-col gap-1">
        <span className={cx("type-heading", card.locked ? "text-ash" : "text-parchment")}>
          {shown ? shown.name : "Someone else"}
        </span>
        {shown ? <Candles count={shown.candles} locked={card.locked} /> : null}
      </div>

      <div id={detailsId} className="flex grow flex-col gap-5">
        {shown ? (
          <dl
            className={cx("flex flex-col gap-3 type-ui", card.locked ? "text-smoke" : "text-ash")}
          >
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-parchment">Starts with</dt>
              <dd>
                {shown.startingRelics.length > 0 ? shown.startingRelics.join(", ") : "Nothing"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-parchment">Rules</dt>
              {shown.rules.map((rule) => (
                <dd key={rule}>{rule}</dd>
              ))}
            </div>
          </dl>
        ) : null}

        {card.locked ? (
          <div className="mt-auto flex flex-col gap-2">
            {card.mystery ? <p className="type-prose-s text-ash italic">{card.mystery}</p> : null}
            <p className="type-ui-l text-tallow">{card.unlockHint}</p>
          </div>
        ) : (
          <Quote lines={card.quote} />
        )}
      </div>
    </label>
  );
}

function Quote({ lines }: { lines: readonly CharacterQuote[] }) {
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line) => (
        <p key={line.text} className="type-prose-s text-ash">
          {line.speaker ? (
            <span className="font-semibold text-parchment not-italic">{line.speaker}: </span>
          ) : null}
          <span className="italic">{line.text}</span>
        </p>
      ))}
    </div>
  );
}

function Candles({ count, locked }: { count: number; locked: boolean }) {
  return (
    <span className={cx("flex items-center gap-2 type-ui", locked ? "text-smoke" : "text-ash")}>
      <span className={cx("flex", locked ? "text-smoke" : "text-flame")}>
        {Array.from({ length: count }, (_, index) => (
          <CandleLitIcon key={index} className="size-5 shrink-0" />
        ))}
      </span>
      {count} {count === 1 ? "candle" : "candles"}
    </span>
  );
}

/** A plain radio dot, so the choice never rests on colour alone. */
function RadioMark() {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "absolute top-7 right-7 grid size-5 place-items-center rounded-full",
        "border-2 border-line-control bg-inset",
        "peer-checked:border-flame peer-disabled:border-line-strong",
        "peer-checked:[&>span]:scale-100",
      )}
    >
      <span className="size-2.5 scale-0 rounded-full bg-flame transition-transform duration-fast ease-out" />
    </span>
  );
}

function Portrait({ card }: { card: CharacterCard }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-20 items-end overflow-hidden rounded-s bg-inset px-4 sm:h-28"
    >
      {card.locked ? (
        <Silhouette />
      ) : (
        <span className="type-display-l leading-none text-flame sm:type-display-xl sm:leading-none">
          {monogram(card.name)}
        </span>
      )}
    </div>
  );
}

/** The initial the town knows them by: Intern, Clerk, Purist, Wren. */
function monogram(name: string): string {
  return name.split(" ").at(-1)?.charAt(0) ?? "";
}

function Silhouette() {
  return (
    <svg viewBox="0 0 64 56" className="h-16 w-auto text-fog sm:h-24" fill="currentColor">
      <circle cx="32" cy="18" r="12" />
      <path d="M8 56c0-14 10.7-23 24-23s24 9 24 23Z" />
    </svg>
  );
}
