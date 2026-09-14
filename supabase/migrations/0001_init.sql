-- Etat des lieux : schema initial (a executer une fois dans Supabase > SQL Editor)
-- Donnees privees par utilisateur : chaque ligne et chaque fichier appartiennent a auth.uid().

-- ---------------------------------------------------------------------------
-- Etats des lieux : document complet en JSONB (meme forme que le type Inspection de l'app)
-- ---------------------------------------------------------------------------
create table if not exists public.inspections (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('entree', 'sortie')),
  status text not null default 'draft' check (status in ('draft', 'validated')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Horodatage serveur utilise pour la synchronisation (independant de l'horloge des appareils)
alter table public.inspections add column if not exists synced_at timestamptz not null default now();

create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists inspections_touch_synced_at on public.inspections;
create trigger inspections_touch_synced_at before insert or update on public.inspections
  for each row execute function public.touch_synced_at();

create index if not exists inspections_owner_synced_idx on public.inspections (owner, synced_at);

alter table public.inspections enable row level security;

create policy "inspections_select_own" on public.inspections
  for select to authenticated using (owner = auth.uid());
create policy "inspections_insert_own" on public.inspections
  for insert to authenticated with check (owner = auth.uid());
create policy "inspections_update_own" on public.inspections
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "inspections_delete_own" on public.inspections
  for delete to authenticated using (owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Photos : metadonnees en base, fichiers dans le bucket prive "photos"
-- Chemin des fichiers : <owner>/<inspection_id>/<photo_id>.jpg et <photo_id>_thumb.jpg
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  inspection_id text not null references public.inspections (id) on delete cascade,
  storage_path text not null,
  thumb_path text not null,
  width integer not null,
  height integer not null,
  source text not null check (source in ('pdf', 'camera', 'import')),
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photos_inspection_idx on public.photos (inspection_id);

alter table public.photos enable row level security;

create policy "photos_select_own" on public.photos
  for select to authenticated using (owner = auth.uid());
create policy "photos_insert_own" on public.photos
  for insert to authenticated with check (owner = auth.uid());
create policy "photos_update_own" on public.photos
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "photos_delete_own" on public.photos
  for delete to authenticated using (owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Stockage prive : un utilisateur n'accede qu'au dossier portant son identifiant
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos_bucket_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_bucket_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
