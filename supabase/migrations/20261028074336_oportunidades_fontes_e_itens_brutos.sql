-- Fontes: de onde as oportunidades vêm (planilha, agenda, site, sistema de vagas...).
create table oportunidades.fontes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 200),
  -- Identificador do leitor que sabe ler esta fonte (por exemplo, 'rss' ou 'greenhouse').
  leitor text not null check (leitor ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  endereco text check (endereco ~ '^https?://\S+$' and char_length(endereco) <= 2000),
  configuracao jsonb not null default '{}'::jsonb check (jsonb_typeof(configuracao) = 'object'),
  confianca oportunidades.confianca_fonte not null default 'observacao',
  situacao oportunidades.situacao_fonte not null default 'ativa',
  ultima_leitura_em timestamptz,
  ultimo_erro text check (char_length(ultimo_erro) <= 2000),
  ultimo_erro_em timestamptz,
  falhas_seguidas integer not null default 0 check (falhas_seguidas >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table oportunidades.fontes is 'Fontes conectadas ao índice. Cada item leva o crédito da sua fonte.';
comment on column oportunidades.fontes.configuracao is 'Configuração do leitor, como o de-para de colunas. Nunca guarda tokens ou senhas.';

create trigger fontes_atualizado_em
  before update on oportunidades.fontes
  for each row execute function oportunidades.definir_atualizado_em();

alter table oportunidades.fontes enable row level security;
revoke all on table oportunidades.fontes from anon, authenticated;
grant select, insert, update, delete on table oportunidades.fontes to service_role;

-- Itens como chegaram da fonte, guardados para auditar e reprocessar.
create table oportunidades.itens_brutos (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references oportunidades.fontes (id) on delete cascade,
  id_externo text check (char_length(id_externo) <= 500),
  conteudo jsonb not null,
  -- SHA-256 do conteúdo, em hexadecimal: evita guardar o mesmo item duas vezes.
  hash_conteudo text not null check (hash_conteudo ~ '^[0-9a-f]{64}$'),
  situacao oportunidades.situacao_item_bruto not null default 'pendente',
  motivo text check (char_length(motivo) <= 2000),
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  constraint itens_brutos_sem_repeticao unique (fonte_id, hash_conteudo)
);

comment on table oportunidades.itens_brutos is 'Itens exatamente como chegaram. Conteúdo de fora é dado, nunca instrução.';

create index itens_brutos_pendentes_idx
  on oportunidades.itens_brutos (recebido_em)
  where situacao = 'pendente';

alter table oportunidades.itens_brutos enable row level security;
revoke all on table oportunidades.itens_brutos from anon, authenticated;
grant select, insert, update, delete on table oportunidades.itens_brutos to service_role;
