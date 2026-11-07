-- O vigia avisa quando uma tabela do site tem gravação sem a trava do visitante, e para de avisar com a trava.
begin;
create table public.trava_teste (id uuid primary key, user_id uuid);
alter table public.trava_teste enable row level security;
create policy dono_insere on public.trava_teste for insert to authenticated with check (true);
create policy todos_leem on public.trava_teste for select to authenticated using (true);
create table public.profile_views (id uuid primary key);
alter table public.profile_views enable row level security;
create policy quem_ve on public.profile_views for insert to public with check (true);

do $$
declare t text[];
begin
  t := oportunidades.problemas_do_sistema();
  if not exists (select 1 from unnest(t) p where p like 'Gravação do site sem a trava de visitante: public.trava_teste (INSERT).%') then
    raise exception 'FALHA: gravação sem trava deveria aparecer: %', t;
  end if;
  if exists (select 1 from unnest(t) p where p like '%profile_views%' or p like '%SELECT%') then
    raise exception 'FALHA: contagem de visitas e leitura não entram no aviso: %', t;
  end if;

  create policy visitante_nao_insere on public.trava_teste as restrictive for insert to authenticated
    with check ((select (current_setting('request.jwt.claims', true)::jsonb ->> 'is_anonymous')::boolean) is false);
  t := oportunidades.problemas_do_sistema();
  if exists (select 1 from unnest(t) p where p like 'Gravação do site sem a trava%') then
    raise exception 'FALHA: com a trava, o aviso some: %', t;
  end if;
end $$;
rollback;
