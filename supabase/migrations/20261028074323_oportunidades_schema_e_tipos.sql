-- Área separada para o índice de oportunidades.
-- Nenhuma tabela do site é alterada por este repositório.
create schema if not exists oportunidades;
comment on schema oportunidades is 'Índice de oportunidades do MCP comunitário da Matchmaking';

-- Fechada por padrão: visitantes (anon) e contas (authenticated) não acessam nada aqui.
-- A leitura pública chega depois, por uma vitrine com só os campos públicos.
revoke all on schema oportunidades from public, anon, authenticated;
grant usage on schema oportunidades to service_role;

-- Lista fechada de tipos. Vale para oportunidades e notícias; cada tabela restringe os seus.
create type oportunidades.tipo_item as enum (
  'vaga',
  'edital_fomento',
  'game_jam',
  'evento',
  'chamada_festival_vitrine',
  'curso_capacitacao',
  'mentoria',
  'aceleracao_incubacao',
  'chamada_publisher',
  'terceirizacao_codesenvolvimento',
  'noticia'
);

-- Região: um ou mais estados, o país inteiro, remoto no Brasil ou internacional.
create type oportunidades.abrangencia as enum ('estado', 'nacional', 'remoto', 'internacional');

-- Quem pode participar.
create type oportunidades.publico as enum ('pessoa', 'empresa', 'ambos');

-- O que a data do contrato significa.
create type oportunidades.natureza_prazo as enum ('encerramento_inscricoes', 'data_do_evento');

-- Mesmos níveis usados nas vagas da plataforma.
create type oportunidades.nivel as enum ('iniciante', 'junior', 'pleno', 'senior', 'lead');

-- Toda fonte começa em observação e passa a publicar sozinha depois de um histórico bom.
create type oportunidades.confianca_fonte as enum ('observacao', 'confiavel');

create type oportunidades.situacao_fonte as enum ('ativa', 'pausada');

create type oportunidades.situacao_item_bruto as enum ('pendente', 'processado', 'rejeitado', 'erro');

create type oportunidades.situacao_oportunidade as enum ('em_moderacao', 'publicada', 'rejeitada', 'removida');

-- Mantém atualizado_em em dia nas tabelas que têm essa coluna.
create function oportunidades.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

revoke all on function oportunidades.definir_atualizado_em() from public, anon, authenticated;
