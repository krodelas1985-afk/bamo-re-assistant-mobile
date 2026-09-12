-- Notify BaMo staff when an agent submits a Marketplace listing from the app.
--
-- Why: listing-new.tsx tells the agent "the BaMo admin will verify your listing
-- before it goes live on the Marketplace", but nothing was telling any admin.
-- Rows just sat in public.agent_listings — no trigger, no queue, no webhook, and
-- nothing copies them into the separate BaMo-Marketplace project. This closes
-- the human half of that loop; the actual publish path is still to be built.
--
-- Recipients mirror notify_tour_completed(): every active baymo_admin, plus the
-- submitter's own workspace client_admins. Type `listing_submitted` is not in
-- push-dispatch's POLICY map, so it is deliberately in-app only (unknown types
-- are stamped pushed and never sent to Expo).

-- Human place label for a listing: "location, city", but without repeating the
-- city when the agent already typed it into the location field.
create or replace function public.listing_place(p_location text, p_city text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    case
      when nullif(trim(p_city), '') is null then coalesce(trim(p_location), '')
      when nullif(trim(p_location), '') is null then trim(p_city)
      when trim(p_location) ilike '%' || trim(p_city) || '%' then trim(p_location)
      else trim(p_location) || ', ' || trim(p_city)
    end, '');
$$;

create or replace function public.notify_listing_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name  text;
  v_where text;
  v_body  text;
begin
  -- Fire on submit only: a fresh published row, or a draft flipped to published.
  if new.status is distinct from 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  -- trim: some profiles carry a trailing space in full_name, which would show
  -- up as a double space before "submitted".
  select trim(coalesce(nullif(trim(p.full_name), ''), p.email, 'An agent')) into v_name
  from public.profiles p where p.id = new.created_by;

  -- Agents usually type the city into `location` too ("Sabang, Lipa City"), so
  -- only append `city` when it is not already in there.
  v_where := public.listing_place(new.location, new.city);

  v_body := concat_ws(' · ',
    left(coalesce(nullif(new.title, ''), 'Untitled listing'), 120),
    v_where,
    case when new.price is not null
         then 'PHP ' || to_char(new.price, 'FM999,999,999,999') else null end
  );

  insert into public.notifications (user_id, client_id, type, title, body, data)
  select
    p.id,
    new.client_id,
    'listing_submitted',
    v_name || ' submitted a listing for review',
    v_body,
    jsonb_build_object(
      'listing_id', new.id,
      'client_id',  new.client_id,
      'created_by', new.created_by,
      'title',      new.title,
      'city',       new.city,
      'route',      '/listings'
    )
  from public.profiles p
  where coalesce(p.is_active, true)
    and p.id is distinct from new.created_by
    and (
      p.role = 'baymo_admin'
      or (p.role = 'client_admin'
          and new.client_id is not null
          and p.client_id = new.client_id)
    );

  return new;
end;
$$;

drop trigger if exists notify_listing_submitted on public.agent_listings;
create trigger notify_listing_submitted
  after insert or update of status on public.agent_listings
  for each row execute function public.notify_listing_submitted();

-- Backfill: listings submitted before this trigger existed are still waiting on
-- a human, and nobody was ever told. Emit one notification per pending listing.
insert into public.notifications (user_id, client_id, type, title, body, data)
select
  p.id,
  l.client_id,
  'listing_submitted',
  trim(coalesce(nullif(trim(a.full_name), ''), a.email, 'An agent')) || ' submitted a listing for review',
  concat_ws(' · ',
    left(coalesce(nullif(l.title, ''), 'Untitled listing'), 120),
    public.listing_place(l.location, l.city),
    case when l.price is not null
         then 'PHP ' || to_char(l.price, 'FM999,999,999,999') else null end
  ),
  jsonb_build_object(
    'listing_id', l.id,
    'client_id',  l.client_id,
    'created_by', l.created_by,
    'title',      l.title,
    'city',       l.city,
    'route',      '/listings',
    'backfilled', true
  )
from public.agent_listings l
join public.profiles a on a.id = l.created_by
join public.profiles p on coalesce(p.is_active, true)
  and p.id is distinct from l.created_by
  and (
    p.role = 'baymo_admin'
    or (p.role = 'client_admin' and l.client_id is not null and p.client_id = l.client_id)
  )
where l.status = 'published'
  and not exists (
    select 1 from public.notifications n
    where n.type = 'listing_submitted'
      and n.data->>'listing_id' = l.id::text
      and n.user_id = p.id
  );
