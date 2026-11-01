-- A busca do MCP passa a encontrar mais: procura no título e na descrição, ignora acentos e
-- maiúsculas, compara palavras inteiras e usa o vocabulário único (quem busca "artista de cenário"
-- também encontra "Environment Artist", e vice-versa). Busca com texto que não encontra nada fica
-- registrada, só com o termo, os filtros e o dia, sem nada sobre quem buscou: é dessa lista que saem
-- os sinônimos novos.

create table oportunidades.buscas_sem_resultado (
  id uuid primary key default gen_random_uuid(),
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  termo text not null check (char_length(termo) between 1 and 100),
  tipo oportunidades.tipo_item,
  uf text check (uf ~ '^[A-Z]{2}$'),
  vezes integer not null default 1 check (vezes >= 1),
  constraint buscas_sem_resultado_unica unique nulls not distinct (dia, termo, tipo, uf)
);

comment on table oportunidades.buscas_sem_resultado is
  'Buscas com texto que não encontraram nada, por dia. Sem dado de quem buscou. Fonte dos sinônimos novos.';

alter table oportunidades.buscas_sem_resultado enable row level security;
revoke all on table oportunidades.buscas_sem_resultado from anon, authenticated;
grant select, insert, update, delete on table oportunidades.buscas_sem_resultado to service_role;

create or replace function vitrine.buscar_oportunidades(
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
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- Texto da busca sem acentos, em minúsculas e só com letras e números separados por espaço.
  v_texto text := nullif(btrim(regexp_replace(oportunidades.normalizar_termo(coalesce(p_texto, '')), '[^a-z0-9]+', ' ', 'g')), '');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_termos text[];
  v_achados integer;
begin
  if v_texto is not null then
    -- O termo, mais o nome oficial e todos os sinônimos das habilidades e funções a que ele leva.
    with alvos as (
      select coalesce(s.habilidade_id, s.tipo_funcao_id) as alvo
      from oportunidades.sinonimos s
      where regexp_replace(s.termo_normalizado, '[^a-z0-9]+', ' ', 'g') = v_texto
      union
      select h.id from public.habilidades h
      where btrim(regexp_replace(oportunidades.normalizar_termo(h.nome), '[^a-z0-9]+', ' ', 'g')) = v_texto
      union
      select t.id from public.tipos_funcao t
      where btrim(regexp_replace(oportunidades.normalizar_termo(t.nome), '[^a-z0-9]+', ' ', 'g')) = v_texto
    )
    select array_agg(distinct btrim(regexp_replace(nome_normalizado, '[^a-z0-9]+', ' ', 'g'))) into v_termos
    from (
      select v_texto as nome_normalizado
      union all
      select oportunidades.normalizar_termo(h.nome) from public.habilidades h join alvos a on a.alvo = h.id
      union all
      select oportunidades.normalizar_termo(t.nome) from public.tipos_funcao t join alvos a on a.alvo = t.id
      union all
      select s.termo_normalizado from oportunidades.sinonimos s join alvos a on a.alvo = coalesce(s.habilidade_id, s.tipo_funcao_id)
    ) nomes;
  end if;

  return query
  select
    o.id, o.titulo, o.tipo, o.link_oficial, o.prazo, o.natureza_prazo, o.abrangencia, o.ufs,
    o.publico, o.descricao, o.valor, o.publico_especifico, f.nome
  from oportunidades.oportunidades o
  join oportunidades.fontes f on f.id = o.fonte_id
  where o.situacao = 'publicada'
    and o.prazo >= v_hoje
    and (p_tipo is null or o.tipo = p_tipo)
    -- Vaga remota e oportunidade nacional valem para todos os estados.
    and (p_uf is null or o.abrangencia in ('nacional', 'remoto') or upper(p_uf) = any (o.ufs))
    -- Palavras inteiras, no título ou na descrição, aceitando o plural com "s": "ui" não encontra
    -- "build", e "artista de cenário" encontra "artista de cenários". Os termos só têm letras, números
    -- e espaços, então entram na expressão sem risco.
    and (v_termos is null or exists (
      select 1 from unnest(v_termos) as busca(termo)
      where regexp_replace(oportunidades.normalizar_termo(o.titulo || ' ' || coalesce(o.descricao, '')), '[^a-z0-9]+', ' ', 'g')
            ~ ('(^| )' || busca.termo || 's?( |$)')
    ))
  order by o.prazo, o.id
  limit least(greatest(coalesce(p_limite, 5), 1), 20);

  get diagnostics v_achados = row_count;
  if v_achados = 0 and v_texto is not null then
    insert into oportunidades.buscas_sem_resultado as b (dia, termo, tipo, uf)
    values (v_hoje, left(v_texto, 100), p_tipo, case when p_uf ~* '^[a-z]{2}$' then upper(p_uf) end)
    on conflict on constraint buscas_sem_resultado_unica do update set vezes = b.vezes + 1;
  end if;
end;
$$;

comment on function vitrine.buscar_oportunidades(oportunidades.tipo_item, text, text, integer) is
  'Busca de oportunidades publicadas e abertas, no título e na descrição, com sinônimos e no máximo 20 resultados. Registra buscas sem resultado, sem dado de quem buscou.';
