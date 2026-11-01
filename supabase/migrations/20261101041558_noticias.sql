-- Notícias: área própria, separada das oportunidades, para o que muda decisões de profissionais e
-- estúdios brasileiros de games. Cada notícia guarda título e resumo em português (escritos pela IA,
-- nunca o texto do portal), o link do original, a nota de relevância (0 a 100) com o motivo e vale
-- por 21 dias.

create type oportunidades.situacao_noticia as enum ('em_fila', 'publicada', 'descartada', 'removida');

create table oportunidades.noticias (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references oportunidades.fontes (id) on delete cascade,
  item_bruto_id uuid references oportunidades.itens_brutos (id) on delete set null,
  titulo text not null check (char_length(btrim(titulo)) between 3 and 300),
  titulo_original text check (char_length(titulo_original) <= 300),
  link text not null check (link ~ '^https?://' and char_length(link) <= 2000),
  resumo text check (char_length(resumo) <= 600),
  idioma_original text not null default 'pt' check (idioma_original in ('pt', 'en')),
  publicada_na_fonte_em timestamptz,
  nota integer not null check (nota between 0 and 100),
  motivo text check (char_length(motivo) <= 500),
  situacao oportunidades.situacao_noticia not null,
  duplicata_de uuid references oportunidades.noticias (id) on delete set null,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint noticias_link_unico unique (link)
);

comment on table oportunidades.noticias is 'Notícias que mudam decisões de profissionais e estúdios brasileiros de games. Vencem em 21 dias.';

create index noticias_situacao_idx on oportunidades.noticias (situacao, expira_em);
create index noticias_fonte_idx on oportunidades.noticias (fonte_id);

create trigger noticias_atualizado_em
  before update on oportunidades.noticias
  for each row execute function oportunidades.definir_atualizado_em();

alter table oportunidades.noticias enable row level security;
revoke all on table oportunidades.noticias from anon, authenticated;
grant select, insert, update, delete on table oportunidades.noticias to service_role;

-- Decide o destino de uma notícia que a IA avaliou.
-- Faixas iniciais (a calibragem ajusta): abaixo de 40 é descartada; 40 a 69 vai para a fila;
-- 70 ou mais é publicada, mas só quando a publicação automática estiver ligada e o teto diário
-- não tiver sido atingido. Enquanto ela estiver desligada (início em observação), tudo de 40 para
-- cima vai para a fila. Mesma história já registrada: fica como duplicata, descartada.
create function oportunidades.registrar_noticia(
  p_fonte uuid,
  p_item_bruto uuid,
  p_titulo text,
  p_titulo_original text,
  p_link text,
  p_resumo text,
  p_idioma text,
  p_publicada_em timestamptz,
  p_nota integer,
  p_motivo text,
  p_duplicata_de uuid
)
returns oportunidades.situacao_noticia
language plpgsql
set search_path = ''
as $$
declare
  publicacao_automatica constant boolean := false;
  nota_minima_fila constant integer := 40;
  nota_minima_publicacao constant integer := 70;
  teto_diario constant integer := 5;
  dias_de_validade constant integer := 21;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_situacao oportunidades.situacao_noticia;
  v_motivo text := p_motivo;
  v_duplicata uuid;
begin
  select n.id into v_duplicata from oportunidades.noticias n where n.id = p_duplicata_de;

  if v_duplicata is not null then
    v_situacao := 'descartada';
    v_motivo := left('Mesma história de outra notícia já registrada. ' || coalesce(p_motivo, ''), 500);
  elsif p_publicada_em < now() - make_interval(days => dias_de_validade) then
    v_situacao := 'descartada';
    v_motivo := left('Notícia com mais de 21 dias. ' || coalesce(p_motivo, ''), 500);
  elsif p_nota < nota_minima_fila then
    v_situacao := 'descartada';
  elsif p_nota >= nota_minima_publicacao and publicacao_automatica
        and (select count(*) from oportunidades.noticias n
             where n.situacao = 'publicada'
               and (n.criado_em at time zone 'America/Sao_Paulo')::date = hoje) < teto_diario then
    v_situacao := 'publicada';
  else
    v_situacao := 'em_fila';
  end if;

  insert into oportunidades.noticias (
    fonte_id, item_bruto_id, titulo, titulo_original, link, resumo, idioma_original,
    publicada_na_fonte_em, nota, motivo, situacao, duplicata_de, expira_em
  ) values (
    p_fonte, p_item_bruto, left(btrim(p_titulo), 300), left(p_titulo_original, 300), p_link, left(p_resumo, 600),
    p_idioma, p_publicada_em, greatest(0, least(100, p_nota)), left(v_motivo, 500), v_situacao, v_duplicata,
    coalesce(least(p_publicada_em, now()), now()) + make_interval(days => dias_de_validade)
  )
  on conflict (link) do nothing;

  return v_situacao;
end;
$$;

revoke all on function oportunidades.registrar_noticia(uuid, uuid, text, text, text, text, text, timestamptz, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function oportunidades.registrar_noticia(uuid, uuid, text, text, text, text, text, timestamptz, integer, text, uuid)
  to service_role;
