-- Busca com limite: contas e visitantes do MCP deixam de ler a vitrine inteira e passam a
-- consultar por uma busca que filtra no banco e devolve no máximo 20 itens por vez.
-- Assim, quem cria um visitante com a chave pública não baixa o índice inteiro de uma vez,
-- como prevê a "API com limite" do planejamento.
create function vitrine.buscar_oportunidades(
  p_tipo oportunidades.tipo_item default null,
  p_uf text default null,
  p_texto text default null,
  p_limite integer default 5
)
returns table (
  id uuid,
  titulo text,
  tipo oportunidades.tipo_item,
  link_oficial text,
  prazo date,
  natureza_prazo oportunidades.natureza_prazo,
  abrangencia oportunidades.abrangencia,
  ufs text[],
  publico oportunidades.publico,
  descricao text,
  valor text,
  publico_especifico text,
  fonte text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.titulo, o.tipo, o.link_oficial, o.prazo, o.natureza_prazo, o.abrangencia, o.ufs,
    o.publico, o.descricao, o.valor, o.publico_especifico, f.nome
  from oportunidades.oportunidades o
  join oportunidades.fontes f on f.id = o.fonte_id
  where o.situacao = 'publicada'
    and o.prazo >= (now() at time zone 'America/Sao_Paulo')::date
    and (p_tipo is null or o.tipo = p_tipo)
    -- Vaga remota e oportunidade nacional valem para todos os estados.
    and (p_uf is null or o.abrangencia in ('nacional', 'remoto') or upper(p_uf) = any (o.ufs))
    -- O texto procurado é literal: sem curingas.
    and (p_texto is null or position(lower(p_texto) in lower(o.titulo)) > 0)
  order by o.prazo, o.id
  limit least(greatest(coalesce(p_limite, 5), 1), 20)
$$;

comment on function vitrine.buscar_oportunidades(oportunidades.tipo_item, text, text, integer) is
  'Busca de oportunidades publicadas e abertas, com filtros aplicados no banco e no máximo 20 resultados.';

revoke all on function vitrine.buscar_oportunidades(oportunidades.tipo_item, text, text, integer) from public, anon;
grant execute on function vitrine.buscar_oportunidades(oportunidades.tipo_item, text, text, integer) to authenticated, service_role;
