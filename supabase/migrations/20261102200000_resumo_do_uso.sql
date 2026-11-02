-- A ligação entre uso e pessoa dura até 8 semanas fechadas; depois sobra só o total da semana,
-- que serve à métrica "pessoas por semana".
create table oportunidades.uso_semanal (
  semana date primary key,
  pessoas integer not null,
  contas integer not null,
  visitantes integer not null,
  chamadas integer not null
);

comment on table oportunidades.uso_semanal is 'Totais das semanas antigas, sem identificar ninguém.';

alter table oportunidades.uso_semanal enable row level security;
revoke all on table oportunidades.uso_semanal from anon, authenticated;
grant select, insert, update, delete on table oportunidades.uso_semanal to service_role;

create function oportunidades.fechar_uso_antigo()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  corte date := date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date - 56;
  apagadas integer;
begin
  insert into oportunidades.uso_semanal as s (semana, pessoas, contas, visitantes, chamadas)
  select
    date_trunc('week', u.dia)::date,
    count(distinct u.user_id),
    count(distinct u.user_id) filter (where not u.visitante),
    count(distinct u.user_id) filter (where u.visitante),
    sum(u.chamadas)
  from oportunidades.uso_por_pessoa u
  where u.dia < corte
  group by 1
  on conflict (semana) do update set
    pessoas = excluded.pessoas, contas = excluded.contas, visitantes = excluded.visitantes, chamadas = excluded.chamadas;

  delete from oportunidades.uso_por_pessoa u where u.dia < corte;
  get diagnostics apagadas = row_count;
  return apagadas;
end;
$$;

comment on function oportunidades.fechar_uso_antigo() is 'Resume as semanas com mais de 8 semanas e apaga a ligação com as pessoas. Só o agendador usa.';

revoke all on function oportunidades.fechar_uso_antigo() from public, anon, authenticated;
grant execute on function oportunidades.fechar_uso_antigo() to service_role;

-- A métrica: pessoas por semana, somando as semanas resumidas e as recentes.
create function oportunidades.uso_por_semana()
returns table (semana date, pessoas integer, contas integer, visitantes integer, chamadas integer)
language sql
stable
set search_path = ''
as $$
  select s.semana, s.pessoas, s.contas, s.visitantes, s.chamadas from oportunidades.uso_semanal s
  union all
  select
    date_trunc('week', u.dia)::date,
    count(distinct u.user_id)::integer,
    (count(distinct u.user_id) filter (where not u.visitante))::integer,
    (count(distinct u.user_id) filter (where u.visitante))::integer,
    sum(u.chamadas)::integer
  from oportunidades.uso_por_pessoa u
  group by 1
  order by 1 desc
$$;

revoke all on function oportunidades.uso_por_semana() from public, anon, authenticated;
grant execute on function oportunidades.uso_por_semana() to service_role;

select cron.schedule('oportunidades-fechar-uso', '30 6 * * *', 'select oportunidades.fechar_uso_antigo()');
