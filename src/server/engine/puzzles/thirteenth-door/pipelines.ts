import "server-only";

/** A player's project: model files by path, as the editor holds them. */
export type Project = Readonly<Record<string, string>>;

/*
 * Every scale with its candy and its street. The stock, catalog, and directory land once, at
 * dusk, so this keeps them past bronze's memory (the Curse of Short Memory forgets them after
 * batch 0); later batches deliver no stock and merge nothing.
 */
const SCALES = `{{ config(materialized='incremental', unique_key='device_id') }}
select s.device_id, s.house_id, h.street, c.grams_per_piece, c.pieces_per_bag
from {{ new_batch('bowl_stock') }} s
join bronze.candy_catalog c using (candy_type)
join bronze.houses h using (house_id)
`;

/*
 * Each scale's running tally, carried from batch to batch: its last reading before the bell
 * and the pieces taken up to it. Readings are ordered by seq, never by arrival, because an
 * upload packs them in any order. A fall is pieces taken; a rise is whole bags tipped in, less
 * whatever a kid took in the same moment. Rounding to whole pieces absorbs the scale's noise.
 * A reading already counted (seq at or below the tally's) is skipped, so a batch run twice
 * changes nothing.
 */
const BOWL_TAKINGS = `{{ config(materialized='incremental', unique_key='device_id') }}
with fresh as (
  select b.device_id, b.seq, b.weight_g, 0 as carried
  from {{ new_batch('candy_bowls') }} b
  where b.read_at_local < '2026-10-31 19:00:00'
{% if is_incremental() %}
    and b.seq > coalesce((select t.last_seq from {{ this }} t where t.device_id = b.device_id), -1)
{% endif %}
),
readings as (
  select device_id, seq, weight_g, carried from fresh
{% if is_incremental() %}
  union all
  select device_id, last_seq, last_weight, pieces from {{ this }}
  where device_id in (select device_id from fresh)
{% endif %}
),
changes as (
  select r.device_id, r.seq, r.weight_g, r.carried, s.pieces_per_bag as bag,
         cast(round((r.weight_g - lag(r.weight_g) over (partition by r.device_id order by r.seq))
                    / s.grams_per_piece) as bigint) as dp
  from readings r
  join silver.scales s using (device_id)
)
select device_id,
       max(seq) as last_seq,
       arg_max(weight_g, seq) as last_weight,
       cast(sum(carried) + sum(case
         when dp is null then 0
         when dp <= 0 then -dp
         else cast(ceil(dp / bag) as bigint) * bag - dp
       end) as bigint) as pieces
from changes
group by device_id
`;

const CURSED_STREET = `{{ config(materialized='view') }}
with tally as (
  select s.street, count(*) as cursed_houses
  from silver.bowl_takings t
  join silver.scales s using (device_id)
  where t.pieces = 13
  group by s.street
)
select street, cursed_houses
from tally
where cursed_houses = (select max(cursed_houses) from tally)
`;

/**
 * The reference pipeline: per scale, in reading order, weight changes become pieces through
 * the candy's weight and bag, counted up to the last reading before the bell.
 */
export const REFERENCE: Project = {
  "silver/scales.sql": SCALES,
  "silver/bowl_takings.sql": BOWL_TAKINGS,
  "gold/cursed_street.sql": CURSED_STREET,
};

/*
 * The hurried engineer's pipeline: weight lost between the first and last reading before the
 * bell, read as pieces. Right for every bowl nobody topped up, which is why it feels finished.
 */
const WEIGHT_LOST_TAKINGS = `{{ config(materialized='table') }}
select s.house_id,
       round((arg_min(b.weight_g, b.seq) - arg_max(b.weight_g, b.seq))
             / any_value(c.grams_per_piece)) as pieces
from bronze.candy_bowls b
join bronze.bowl_stock s using (device_id)
join bronze.candy_catalog c using (candy_type)
where b.read_at_local < '2026-10-31 19:00:00'
group by s.house_id
`;

const WEIGHT_LOST_STREET = `{{ config(materialized='view') }}
with tally as (
  select h.street, count(*) as cursed_houses
  from silver.bowl_takings p
  join bronze.houses h using (house_id)
  where p.pieces = 13
  group by h.street
)
select street, cursed_houses
from tally
where cursed_houses = (select max(cursed_houses) from tally)
`;

/** The trap: a bag tipped in nets out against the candy given, so a refilled bowl reads short. */
export const WEIGHT_LOST_TRAP: Project = {
  "silver/bowl_takings.sql": WEIGHT_LOST_TAKINGS,
  "gold/cursed_street.sql": WEIGHT_LOST_STREET,
};
