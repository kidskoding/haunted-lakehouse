import "server-only";

/** A player's project: model files by path, as the editor holds them. */
export type Project = Readonly<Record<string, string>>;

/*
 * Each drop with its item and quantity text back in place, folded into silver as it lands so
 * bronze's three-upload memory never matters. The row is read as JSON, so a column the feed
 * has not named yet is null rather than a binder error, and the old and new quantity names are
 * coalesced. A quantity holding an item name means the export swapped the two values; they are
 * put back. `quantity` reads `q`, the quantity text, in lower case.
 */
const placedDrops = (
  quantity: string,
) => `{{ config(materialized='incremental', unique_key='drop_id') }}
with raw as (
  select
    drop_id,
    to_json(b) ->> 'item' as item_raw,
    coalesce(to_json(b) ->> 'quantity', to_json(b) ->> 'qty') as qty_raw
  from {{ new_batch('decoration_drops') }} b
),
placed as (
  select
    drop_id,
    qty_raw in ('candle', 'fog juice', 'cobweb', 'lantern', 'skeleton', 'glow stick') as swapped,
    item_raw,
    qty_raw
  from raw
),
spelled as (
  select
    drop_id,
    case when swapped then qty_raw else item_raw end as item,
    lower(case when swapped then item_raw else qty_raw end) as q
  from placed
)
select drop_id, item, ${quantity} as quantity
from spelled
`;

/*
 * The text read by the rules in Hobb's note: digits, digits with pcs or units, a number word
 * up to twenty, or a dozen. Anything else is a null quantity: the drop stays, disputed.
 */
const READ_QUANTITY = `case
    when regexp_full_match(q, '[0-9]+( (pcs|units))?')
      then cast(regexp_extract(q, '^[0-9]+') as integer)
    when q = 'half a dozen' then 6
    when q = 'a dozen' then 12
    when q = 'two dozen' then 24
    else list_position(
      ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
       'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
       'eighteen', 'nineteen', 'twenty'],
      q
    )
  end`;

/** The Mayor's tally: countable pieces per item, and the drops with no count to pay for. */
const TALLY = `{{ config(materialized='view') }}
select
  item,
  coalesce(sum(quantity), 0) as pieces,
  count(*) - count(quantity) as disputed
from silver.drops
group by item
`;

/** The reference: every drop kept, every readable spelling counted, the rest disputed. */
export const REFERENCE: Project = {
  "silver/drops.sql": placedDrops(READ_QUANTITY),
  "gold/decoration_tally.sql": TALLY,
};

/*
 * The hurried reading: the rename and the swap handled, then a strict cast. It never errors
 * and is right for plain digits, the commonest spelling, but '12 pcs', 'Nine', and 'a dozen'
 * come out null alongside 'lots'.
 */
const CAST_QUANTITY = "try_cast(q as integer)";

/** The null trap: rows a strict cast can't read are kept, and disputed with the vague ones. */
export const DISPUTE_UNCAST_TRAP: Project = {
  "silver/drops.sql": placedDrops(CAST_QUANTITY),
  "gold/decoration_tally.sql": TALLY,
};

/** The quarantine trap: rows a strict cast can't read are left out of the tally entirely. */
export const DROP_UNCAST_TRAP: Project = {
  "silver/drops.sql": `${placedDrops(CAST_QUANTITY)}where ${CAST_QUANTITY} is not null\n`,
  "gold/decoration_tally.sql": TALLY,
};
