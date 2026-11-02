-- Detalhe de uma oportunidade pelo id: só o que está publicado e aberto, como na busca.
create function vitrine.ver_oportunidade(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(v)
  from (
    select o.id, o.titulo, o.tipo, o.link_oficial, o.prazo, o.natureza_prazo, o.abrangencia, o.ufs, o.publico,
           o.descricao, o.niveis, o.valor, o.publico_especifico, f.nome as fonte, o.conferida_em
    from oportunidades.oportunidades o
    join oportunidades.fontes f on f.id = o.fonte_id
    where o.id = p_id
      and o.situacao = 'publicada'
      and o.prazo >= (now() at time zone 'America/Sao_Paulo')::date
  ) v
$$;

comment on function vitrine.ver_oportunidade(uuid) is 'Usada pela ferramenta ver_oportunidade do MCP.';

revoke all on function vitrine.ver_oportunidade(uuid) from public, anon;
grant execute on function vitrine.ver_oportunidade(uuid) to authenticated, service_role;
