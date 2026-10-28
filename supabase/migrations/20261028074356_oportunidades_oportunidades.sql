-- Oportunidades no contrato mínimo de 6 campos.
create table oportunidades.oportunidades (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references oportunidades.fontes (id) on delete restrict,
  item_bruto_id uuid references oportunidades.itens_brutos (id) on delete set null,

  -- Contrato mínimo
  titulo text not null check (char_length(btrim(titulo)) between 3 and 200),
  tipo oportunidades.tipo_item not null,
  link_oficial text not null check (link_oficial ~ '^https?://\S+$' and char_length(link_oficial) <= 2000),
  prazo date not null,
  natureza_prazo oportunidades.natureza_prazo not null,
  abrangencia oportunidades.abrangencia not null,
  ufs text[],
  publico oportunidades.publico not null,

  -- Opcionais
  descricao text check (char_length(descricao) <= 2000),
  niveis oportunidades.nivel[],
  valor text check (char_length(valor) <= 200),
  publico_especifico text check (char_length(publico_especifico) <= 200),

  -- Moderação
  situacao oportunidades.situacao_oportunidade not null default 'em_moderacao',
  motivo_moderacao text check (char_length(motivo_moderacao) <= 2000),
  publicada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- Notícias ficam numa área própria, nunca misturadas às oportunidades.
  constraint oportunidades_sem_noticia check (tipo <> 'noticia'),
  -- Estados só quando a abrangência é estadual, e sempre siglas válidas.
  constraint oportunidades_ufs_conforme_abrangencia check (
    (
      abrangencia = 'estado'
      and ufs is not null
      and cardinality(ufs) between 1 and 27
      and ufs <@ array[
        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
        'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
        'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
      ]::text[]
    )
    or (abrangencia <> 'estado' and ufs is null)
  ),
  constraint oportunidades_niveis_nao_vazio check (niveis is null or cardinality(niveis) >= 1),
  constraint oportunidades_publicada_tem_data check (situacao <> 'publicada' or publicada_em is not null)
);

comment on table oportunidades.oportunidades is 'Oportunidades no contrato mínimo: título, tipo, link oficial, prazo ou data, região e quem pode participar.';

create trigger oportunidades_atualizado_em
  before update on oportunidades.oportunidades
  for each row execute function oportunidades.definir_atualizado_em();

create index oportunidades_publicadas_prazo_idx
  on oportunidades.oportunidades (prazo)
  where situacao = 'publicada';
create index oportunidades_ufs_idx on oportunidades.oportunidades using gin (ufs);
create index oportunidades_fonte_idx on oportunidades.oportunidades (fonte_id);
create index oportunidades_item_bruto_idx on oportunidades.oportunidades (item_bruto_id);

alter table oportunidades.oportunidades enable row level security;
revoke all on table oportunidades.oportunidades from anon, authenticated;
grant select, insert, update, delete on table oportunidades.oportunidades to service_role;

-- Áreas da oportunidade, no mesmo vocabulário dos perfis: as habilidades da plataforma.
create table oportunidades.oportunidade_habilidades (
  oportunidade_id uuid not null references oportunidades.oportunidades (id) on delete cascade,
  habilidade_id uuid not null references public.habilidades (id) on delete cascade,
  primary key (oportunidade_id, habilidade_id)
);

create index oportunidade_habilidades_habilidade_idx
  on oportunidades.oportunidade_habilidades (habilidade_id);

alter table oportunidades.oportunidade_habilidades enable row level security;
revoke all on table oportunidades.oportunidade_habilidades from anon, authenticated;
grant select, insert, update, delete on table oportunidades.oportunidade_habilidades to service_role;

-- Funções da oportunidade, no mesmo vocabulário dos perfis: os tipos de função da plataforma.
create table oportunidades.oportunidade_funcoes (
  oportunidade_id uuid not null references oportunidades.oportunidades (id) on delete cascade,
  tipo_funcao_id uuid not null references public.tipos_funcao (id) on delete cascade,
  primary key (oportunidade_id, tipo_funcao_id)
);

create index oportunidade_funcoes_tipo_funcao_idx
  on oportunidades.oportunidade_funcoes (tipo_funcao_id);

alter table oportunidades.oportunidade_funcoes enable row level security;
revoke all on table oportunidades.oportunidade_funcoes from anon, authenticated;
grant select, insert, update, delete on table oportunidades.oportunidade_funcoes to service_role;
