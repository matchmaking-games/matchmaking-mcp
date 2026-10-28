-- Sinônimos: termos em português (ou variações em inglês) que levam à habilidade
-- ou função oficial. "arte conceitual" e "Concept Art" encontram o mesmo lugar.
create table oportunidades.sinonimos (
  id uuid primary key default gen_random_uuid(),
  termo text not null check (char_length(btrim(termo)) between 2 and 100),
  termo_normalizado text generated always as (lower(btrim(termo))) stored,
  idioma text not null default 'pt' check (idioma in ('pt', 'en')),
  habilidade_id uuid references public.habilidades (id) on delete cascade,
  tipo_funcao_id uuid references public.tipos_funcao (id) on delete cascade,
  criado_em timestamptz not null default now(),
  -- Cada sinônimo aponta para exatamente uma habilidade ou uma função.
  constraint sinonimos_um_alvo check (num_nonnulls(habilidade_id, tipo_funcao_id) = 1)
);

comment on table oportunidades.sinonimos is 'Sinônimos do vocabulário único: levam à habilidade ou função oficial da plataforma.';

create unique index sinonimos_termo_alvo_idx
  on oportunidades.sinonimos (termo_normalizado, coalesce(habilidade_id, tipo_funcao_id));
create index sinonimos_habilidade_idx on oportunidades.sinonimos (habilidade_id);
create index sinonimos_tipo_funcao_idx on oportunidades.sinonimos (tipo_funcao_id);

alter table oportunidades.sinonimos enable row level security;
revoke all on table oportunidades.sinonimos from anon, authenticated;
grant select, insert, update, delete on table oportunidades.sinonimos to service_role;
