import Link from "next/link";
import type { ReactNode } from "react";
import { Tombstone } from "@/components/run/death/tombstone";
import { buttonClassName } from "@/components/ui/button-styles";
import { cx } from "@/components/ui/cx";
import { PendingMark } from "./pending-mark";
import {
  EVERY_STONE,
  type GraveyardFilter,
  type GraveyardOption,
  type GraveyardPage,
  graveyardHref,
  isFiltered,
  LAST_PAGE,
} from "@/lib/crypt/graveyard";

export interface GraveyardOptions {
  readonly characters: readonly GraveyardOption[];
  readonly hours: readonly GraveyardOption[];
}

export interface GraveyardProps {
  readonly filter: GraveyardFilter;
  readonly options: GraveyardOptions;
  /** The page of stones, or null when the hill couldn't be read. */
  readonly page: GraveyardPage | null;
}

/** The room's frame: its title, the way back, and the filters, around whatever the hill shows. */
function GraveyardFrame({
  filter,
  options,
  children,
}: Omit<GraveyardProps, "page"> & { readonly children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-page flex-col gap-10 px-4 py-16 md:px-8 md:py-24">
      <header className="flex flex-col gap-5">
        <h1 className="text-balance text-parchment type-display-l">The Graveyard</h1>
        <p className="max-w-copy text-pretty text-ash type-prose">
          Every night that ended in the dark leaves a stone on the hill above the lake. Read whose
          they are, then walk the same night again.
        </p>
        <Link href="/crypt" className={`${buttonClassName("ghost", "md")} self-start`}>
          Back to the Crypt
        </Link>
      </header>
      <GraveyardFilters filter={filter} options={options} />
      {children}
    </main>
  );
}

interface FilterGroupProps {
  readonly id: string;
  readonly label: string;
  readonly links: readonly { label: string; href: string; current: boolean }[];
}

function FilterGroup({ id, label, links }: FilterGroupProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:gap-4">
      <p id={id} className="shrink-0 text-smoke type-ui md:w-28">
        {label}
      </p>
      <ul aria-labelledby={id} className="-mx-2 flex flex-wrap gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={link.current ? "true" : undefined}
              className={cx(
                "relative inline-flex min-h-8 items-center rounded-xs px-2 type-ui transition-colors duration-fast ease-out pointer-coarse:max-xl:min-h-11",
                link.current
                  ? "bg-raised text-parchment font-semibold"
                  : "text-ash ui-hover:bg-raised ui-hover:text-parchment",
              )}
            >
              {link.label}
              <PendingMark />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plain links, so every filter is its own shareable URL and works before any script runs. */
function GraveyardFilters({ filter, options }: Omit<GraveyardProps, "page">) {
  // Changing a filter starts the hill over from the newest stones.
  const href = (change: Partial<GraveyardFilter>) =>
    graveyardHref({ ...filter, page: 1, ...change });
  const choices = (
    key: "character" | "hour",
    anyLabel: string,
    list: readonly GraveyardOption[],
  ) => [
    { label: anyLabel, href: href({ [key]: null }), current: filter[key] === null },
    ...list.map(({ value, label }) => ({
      label,
      href: href({ [key]: value }),
      current: filter[key] === value,
    })),
  ];

  return (
    <nav
      aria-label="Filter the stones"
      className="flex flex-col gap-4 rounded-s bg-panel p-4 md:p-6"
    >
      <FilterGroup
        id="graveyard-who"
        label="Who fell"
        links={choices("character", "Anyone", options.characters)}
      />
      <FilterGroup
        id="graveyard-hour"
        label="Where it broke"
        links={choices("hour", "Any hour", options.hours)}
      />
      <FilterGroup
        id="graveyard-nights"
        label="Which nights"
        links={[
          { label: "Every night", href: href({ daily: false }), current: !filter.daily },
          { label: "Daily Haunt only", href: href({ daily: true }), current: filter.daily },
        ]}
      />
    </nav>
  );
}

function Message({
  title,
  line,
  action,
}: {
  readonly title: string;
  readonly line: string;
  readonly action: ReactNode;
}) {
  return (
    <section aria-labelledby="graveyard-message" className="flex flex-col gap-4 py-12">
      <h2 id="graveyard-message" className="text-balance text-parchment type-display-m">
        {title}
      </h2>
      <p className="max-w-copy text-pretty text-ash type-prose">{line}</p>
      <div className="mt-2">{action}</div>
    </section>
  );
}

function Pager({
  filter,
  hasMore,
}: {
  readonly filter: GraveyardFilter;
  readonly hasMore: boolean;
}) {
  const newer = filter.page > 1;
  const older = hasMore && filter.page < LAST_PAGE;
  if (!newer && !older) return null;
  return (
    <nav aria-label="More stones" className="flex flex-wrap items-center gap-3">
      {newer ? (
        <Link
          href={graveyardHref({ ...filter, page: filter.page - 1 })}
          className={buttonClassName("ghost", "md")}
        >
          Newer stones
          <PendingMark />
        </Link>
      ) : null}
      {older ? (
        <Link
          href={graveyardHref({ ...filter, page: filter.page + 1 })}
          className={buttonClassName("ghost", "md")}
        >
          Older stones
          <PendingMark />
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * The Graveyard: recent stones across players, newest first, each leading to its share page
 * and to a new run on its seed. Server-renderable; filters and paging are plain links.
 */
export function Graveyard({ filter, options, page }: GraveyardProps) {
  if (page === null) {
    return (
      <GraveyardFrame filter={filter} options={options}>
        <Message
          title="The gate won't open tonight."
          line="Wren's key turns, but the lock is rusted through. The stones are still up there; try the gate again in a moment."
          action={
            <Link href={graveyardHref(filter)} className={buttonClassName("secondary", "md")}>
              Try the gate again
            </Link>
          }
        />
      </GraveyardFrame>
    );
  }

  if (page.stones.length === 0) {
    const filtered = isFiltered(filter);
    return (
      <GraveyardFrame filter={filter} options={options}>
        {filtered ? (
          <Message
            title="No stone here answers to that."
            line="Nobody has fallen that way yet. Widen the search, or be the first."
            action={
              <Link
                href={graveyardHref(EVERY_STONE)}
                className={buttonClassName("secondary", "md")}
              >
                Show every stone
              </Link>
            }
          />
        ) : (
          <Message
            title="The hill is bare."
            line="No night has ended in the dark yet. Someone has to go first."
            action={
              <Link href="/run/new" className={buttonClassName("primary", "lg")}>
                Enter the night
              </Link>
            }
          />
        )}
      </GraveyardFrame>
    );
  }

  return (
    <GraveyardFrame filter={filter} options={options}>
      <section aria-label="Stones" className="flex flex-col gap-10">
        <ul className="grid grid-cols-1 justify-items-center gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {page.stones.map(({ stone, sharePath, replayPath }, index) => (
            // Stones carry no id of their own (no run id leaves the server), and a page never
            // reorders under a render, so position is a stable key here.
            <li key={index} className="flex w-full max-w-100 flex-col items-center gap-4">
              <Tombstone stone={stone} className="flex-1" />
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href={sharePath}
                  aria-label={`Visit the stone of ${stone.handle}, ${stone.hour}`}
                  className={buttonClassName("ghost", "md")}
                >
                  Visit the stone
                </Link>
                <Link
                  href={replayPath}
                  aria-label={`Replay seed ${stone.seed}`}
                  className={buttonClassName("ghost", "md")}
                >
                  Replay seed
                </Link>
              </div>
            </li>
          ))}
        </ul>
        <Pager filter={filter} hasMore={page.hasMore} />
      </section>
    </GraveyardFrame>
  );
}
