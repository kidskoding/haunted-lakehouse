import "server-only";

/** A player's project: model source keyed by its path, as the editor saves it. */
export type PipelineFiles = Readonly<Record<string, string>>;

/**
 * The reference: each house's latest change by `seq`, folded incrementally into silver, so it
 * survives any retention. This is the shape later hours reward.
 */
export const REFERENCE: PipelineFiles = {
  "silver/porch_state.sql": `{{ config(materialized='incremental', unique_key='house_id') }}
with latest as (
  select house_id, arg_max(state, seq) as state, max(seq) as seq
  from {{ new_batch('porch_lights') }}
  group by house_id
)
{% if is_incremental() %}
select l.* from latest l
left join {{ this }} t using (house_id)
where t.seq is null or l.seq > t.seq
{% else %}
select * from latest
{% endif %}
`,
  "gold/welcoming_houses.sql": `{{ config(materialized='view') }}
select count(*) filter (where state = 'on') as houses
from silver.porch_state
`,
};

/**
 * The tutorial-grade reference: one view straight over bronze. It holds only because this
 * hour's bronze keeps every batch.
 */
export const TUTORIAL_REFERENCE: PipelineFiles = {
  "gold/welcoming_houses.sql": `{{ config(materialized='view') }}
with last_word as (
  select house_id, state
  from bronze.porch_lights
  qualify row_number() over (partition by house_id order by seq desc) = 1
)
select count(*) filter (where state = 'on') as houses
from last_word
`,
};

/** The trap: every house that ever reported `on`, including the porches switched off since. */
export const EVER_ON_TRAP: PipelineFiles = {
  "gold/welcoming_houses.sql": `{{ config(materialized='view') }}
select count(distinct house_id) as houses
from bronze.porch_lights
where state = 'on'
`,
};

/**
 * The quieter trap: each house's last report in arrival order. A report shuffled within its
 * batch or held up a delivery puts an `on` after its `off`, but only on some nights.
 */
export const ARRIVAL_ORDER_TRAP: PipelineFiles = {
  "gold/welcoming_houses.sql": `{{ config(materialized='view') }}
with last_arrived as (
  select house_id, state
  from bronze.porch_lights
  qualify row_number() over (partition by house_id order by _batch desc, _seq desc) = 1
)
select count(*) filter (where state = 'on') as houses
from last_arrived
`,
};
