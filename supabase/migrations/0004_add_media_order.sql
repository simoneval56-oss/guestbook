alter table public.media
add column if not exists order_index integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(section_id, subsection_id)
      order by created_at
    ) as rn
  from public.media
)
update public.media m
set order_index = ranked.rn
from ranked
where m.id = ranked.id
  and m.order_index is null;
