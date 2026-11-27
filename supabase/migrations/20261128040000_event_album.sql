alter table public.club_events add column if not exists ar_anchor jsonb;
create table if not exists public.event_photos (
  id uuid primary key,
  event_id text not null references public.club_events(id) on delete cascade,
  slot smallint not null check (slot between 1 and 24),
  approved boolean not null default false,
  image text not null check (length(image) <= 600000),
  unique(event_id,slot)
);
alter table public.event_photos enable row level security;
revoke all on public.event_photos from anon, authenticated;
grant select, insert, update, delete on public.event_photos to service_role;
