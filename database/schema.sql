-- Supabase AirsoftPG
-- Rodar no Dashboard > SQL Editor

create table if not exists public.jogos (
  id bigint generated always as identity primary key,
  titulo text not null,
  descricao text,
  data_jogo date not null,
  hora text not null,
  local_jogo text,
  criado_em timestamptz default now()
);

alter table public.jogos enable row level security;

drop policy if exists "jogos_select_public" on public.jogos;
create policy "jogos_select_public" on public.jogos
  for select to anon, authenticated using (true);

drop policy if exists "jogos_insert_auth" on public.jogos;
create policy "jogos_insert_auth" on public.jogos
  for insert to authenticated with check (true);

drop policy if exists "jogos_delete_auth" on public.jogos;
create policy "jogos_delete_auth" on public.jogos
  for delete to authenticated using (true);
