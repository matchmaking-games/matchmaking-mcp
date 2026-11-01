-- Confiança das fontes com mais cuidado. Uma fonte só passa a publicar sozinha quando:
-- - aceita promoção automática (promove_sozinha). Fontes cujo conteúdo a IA interpreta (RSS, sites)
--   não aceitam: só ganham confiança com o OK de quem modera. Fontes estruturadas (sistemas de
--   vagas, planilhas) aceitam;
-- - está há pelo menos 7 dias no índice, além das leituras boas e da baixa taxa de recusa de antes.
-- Sem isso, uma fonte lida a cada hora ganhava confiança em poucas horas.

alter table oportunidades.fontes add column promove_sozinha boolean not null default false;

comment on column oportunidades.fontes.promove_sozinha is
  'A fonte pode ganhar confiança sozinha depois de 7 dias com histórico bom. Fontes interpretadas pela IA ficam sem promoção automática.';

update oportunidades.fontes set promove_sozinha = true where leitor in ('greenhouse', 'planilha');

create or replace function oportunidades.avaliar_confianca(p_fonte uuid)
returns oportunidades.confianca_fonte
language plpgsql
set search_path = ''
as $$
declare
  atual oportunidades.confianca_fonte;
  pode_promover boolean;
  desde timestamptz;
  leituras_boas integer;
  processados integer;
  rejeitados integer;
  recusados_na_moderacao integer;
  taxa_rejeicao numeric;
  nova oportunidades.confianca_fonte;
begin
  select confianca, promove_sozinha, criado_em into atual, pode_promover, desde
  from oportunidades.fontes where id = p_fonte;

  select count(*) filter (where situacao = 'sucesso') into leituras_boas
  from (
    select situacao from oportunidades.leituras
    where fonte_id = p_fonte and situacao <> 'rodando'
    order by iniciada_em desc
    limit 5
  ) ultimas;

  select count(*) filter (where situacao in ('processado', 'rejeitado')),
         count(*) filter (where situacao = 'rejeitado')
  into processados, rejeitados
  from oportunidades.itens_brutos
  where fonte_id = p_fonte and processado_em > now() - interval '30 days';

  select count(*) into recusados_na_moderacao
  from oportunidades.oportunidades
  where fonte_id = p_fonte and situacao = 'rejeitada' and atualizado_em > now() - interval '30 days';

  taxa_rejeicao := case when processados = 0 then 0 else rejeitados::numeric / processados end;

  nova := atual;
  if atual = 'observacao' and pode_promover and desde <= now() - interval '7 days'
     and leituras_boas = 5 and processados >= 10 and taxa_rejeicao <= 0.10 and recusados_na_moderacao = 0 then
    nova := 'confiavel';
  elsif atual = 'confiavel' and (taxa_rejeicao > 0.25 or recusados_na_moderacao > 0) then
    nova := 'observacao';
  end if;

  if nova <> atual then
    update oportunidades.fontes set confianca = nova where id = p_fonte;
  end if;

  return nova;
end;
$$;
