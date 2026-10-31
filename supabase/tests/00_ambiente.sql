-- Prepara um Postgres comum para se parecer com o Supabase no que as migrations usam:
-- os papéis de acesso e as duas tabelas do site para as quais o índice aponta.
-- Só para os testes automáticos; nunca aplicar no Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.habilidades (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.tipos_funcao (id uuid primary key default gen_random_uuid(), nome text not null);

-- Imitações do agendador (pg_cron), do Vault e das chamadas HTTP (pg_net), só com o que as
-- migrations usam. As chamadas ficam guardadas em tabelas para os testes conferirem.
create schema cron;
create table cron.job (jobname text primary key, schedule text not null, command text not null);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint;
$$;

create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

create schema net;
create table net.pedidos (id bigserial primary key, url text, headers jsonb, body jsonb, timeout_milliseconds integer);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as $$
  insert into net.pedidos (url, headers, body, timeout_milliseconds) values (url, headers, body, timeout_milliseconds) returning id;
$$;
