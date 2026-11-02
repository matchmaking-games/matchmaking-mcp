-- Detalhe de uma oportunidade: só o que a busca também mostraria.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor, configuracao)
values ('00000000-0000-4000-8000-0000000000f9', 'Fonte do detalhe', 'teste', '{"coluna_interna": "x"}');

insert into oportunidades.oportunidades
  (id, fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico, situacao, publicada_em, motivo_moderacao)
values
  ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-0000000000f9', 'Publicada', 'vaga', 'https://exemplo.org/d1',
   current_date + 30, 'encerramento_inscricoes', 'remoto', 'pessoa', 'publicada', now(), 'interno'),
  ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-0000000000f9', 'Vencida', 'vaga', 'https://exemplo.org/d2',
   current_date - 1, 'encerramento_inscricoes', 'remoto', 'pessoa', 'publicada', now(), null),
  ('00000000-0000-4000-8000-000000000a03', '00000000-0000-4000-8000-0000000000f9', 'Em moderacao', 'vaga', 'https://exemplo.org/d3',
   current_date + 30, 'encerramento_inscricoes', 'remoto', 'pessoa', 'em_moderacao', null, null);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;

do $$
declare
  item jsonb := vitrine.ver_oportunidade('00000000-0000-4000-8000-000000000a01');
begin
  if item ->> 'titulo' is distinct from 'Publicada' or item ->> 'fonte' is distinct from 'Fonte do detalhe' then
    raise exception 'FALHA: o visitante deveria ver a oportunidade publicada, com o crédito da fonte';
  end if;
  if item ? 'motivo_moderacao' or item ? 'configuracao' then
    raise exception 'FALHA: o detalhe não pode trazer campos internos';
  end if;
  if vitrine.ver_oportunidade('00000000-0000-4000-8000-000000000a02') is not null then
    raise exception 'FALHA: oportunidade vencida não aparece no detalhe';
  end if;
  if vitrine.ver_oportunidade('00000000-0000-4000-8000-000000000a03') is not null then
    raise exception 'FALHA: oportunidade em moderação não aparece no detalhe';
  end if;
  if vitrine.ver_oportunidade('00000000-0000-4000-8000-000000000a99') is not null then
    raise exception 'FALHA: id inexistente deveria voltar vazio';
  end if;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'vitrine.ver_oportunidade(uuid)', 'execute') then
    raise exception 'FALHA: quem não entrou não pode ver o detalhe';
  end if;
end;
$$;

rollback;
