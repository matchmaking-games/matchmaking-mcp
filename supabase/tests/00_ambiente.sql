-- Prepara um Postgres comum para se parecer com o Supabase no que as migrations usam:
-- os papéis de acesso e as duas tabelas do site para as quais o índice aponta.
-- Só para os testes automáticos; nunca aplicar no Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.habilidades (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.tipos_funcao (id uuid primary key default gen_random_uuid(), nome text not null);
