-- Vitrine: a única parte do índice que o servidor do MCP lê em nome das pessoas.
-- Mostra só oportunidades publicadas e ainda abertas, e só os campos públicos.
--
-- Visitantes do MCP entram como usuários anônimos do Supabase, com o papel authenticated,
-- então a vitrine é liberada para authenticated. O papel anon (sem login nenhum) fica de
-- fora: a consulta aberta aos dados virá por uma API com limite de uso.
create schema if not exists vitrine;
comment on schema vitrine is 'Vitrine do índice de oportunidades, lida pelo servidor do MCP';

revoke all on schema vitrine from public, anon;
grant usage on schema vitrine to authenticated, service_role;

-- A vitrine respeita as regras de acesso de quem consulta (security_invoker), então o papel
-- authenticated precisa enxergar, nas tabelas internas, só as colunas públicas das
-- oportunidades publicadas e o nome das fontes delas. Nada mais.
grant usage on schema oportunidades to authenticated;

grant select (
  id, fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico,
  descricao, niveis, valor, publico_especifico, situacao
) on table oportunidades.oportunidades to authenticated;

grant select (id, nome) on table oportunidades.fontes to authenticated;

create policy oportunidades_publicadas_para_contas
  on oportunidades.oportunidades
  for select
  to authenticated
  using (situacao = 'publicada');

create policy fontes_com_oportunidade_publicada
  on oportunidades.fontes
  for select
  to authenticated
  using (
    exists (
      select 1
      from oportunidades.oportunidades o
      where o.fonte_id = fontes.id
        and o.situacao = 'publicada'
    )
  );

-- Prazo contado no horário de Brasília: um edital que fecha hoje aparece até o fim do dia.
create view vitrine.oportunidades
  with (security_invoker = true)
as
select
  o.id,
  o.titulo,
  o.tipo,
  o.link_oficial,
  o.prazo,
  o.natureza_prazo,
  o.abrangencia,
  o.ufs,
  o.publico,
  o.descricao,
  o.niveis,
  o.valor,
  o.publico_especifico,
  f.nome as fonte
from oportunidades.oportunidades o
join oportunidades.fontes f on f.id = o.fonte_id
where o.situacao = 'publicada'
  and o.prazo >= (now() at time zone 'America/Sao_Paulo')::date;

comment on view vitrine.oportunidades is 'Oportunidades publicadas e abertas, só com os campos públicos e o crédito da fonte.';

revoke all on table vitrine.oportunidades from anon;
grant select on table vitrine.oportunidades to authenticated, service_role;
