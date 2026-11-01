-- Itens descartados pelo leitor (fora do escopo, notícias guardadas para depois) não contam
-- como erro da fonte: uma fonte de RSS que traz muita coisa fora do escopo ainda pode ganhar confiança.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor, promove_sozinha, criado_em)
values ('00000000-0000-4000-8000-0000000000f4', 'Feed misturado', 'teste', true, now() - interval '8 days');
insert into oportunidades.leituras (fonte_id, situacao, terminada_em)
select '00000000-0000-4000-8000-0000000000f4', 'sucesso', now() from generate_series(1, 5);

insert into oportunidades.itens_brutos (fonte_id, conteudo, hash_conteudo, situacao, processado_em)
select '00000000-0000-4000-8000-0000000000f4'::uuid, jsonb_build_object('n', n), encode(sha256(convert_to('bom' || n, 'UTF8')), 'hex'), 'processado'::oportunidades.situacao_item_bruto, now() from generate_series(1, 10) n
union all
select '00000000-0000-4000-8000-0000000000f4'::uuid, jsonb_build_object('n', n), encode(sha256(convert_to('fora' || n, 'UTF8')), 'hex'), 'descartado'::oportunidades.situacao_item_bruto, now() from generate_series(1, 30) n;

do $$
begin
  if oportunidades.avaliar_confianca('00000000-0000-4000-8000-0000000000f4') <> 'confiavel' then
    raise exception 'FALHA: itens descartados não deveriam contar como rejeição da fonte';
  end if;
end;
$$;

rollback;
