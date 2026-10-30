-- Testes da fila de coleta, do registro de leituras e do portão de qualidade.
begin;

insert into oportunidades.fontes (id, nome, leitor, intervalo_minutos)
values ('00000000-0000-4000-8000-0000000000f2', 'Fonte da fila', 'teste', 60);

-- A fila entrega a fonte vencida uma vez só e marca a próxima leitura.
do $$
declare
  r record;
  segunda integer;
begin
  select * into r from oportunidades.reservar_proxima_fonte();
  if r.fonte_id is distinct from '00000000-0000-4000-8000-0000000000f2' then
    raise exception 'FALHA: a fila deveria entregar a fonte vencida';
  end if;
  if not exists (select 1 from oportunidades.leituras where id = r.leitura_id and situacao = 'rodando') then
    raise exception 'FALHA: a leitura deveria ficar registrada como rodando';
  end if;
  select count(*) into segunda from oportunidades.reservar_proxima_fonte();
  if segunda <> 0 then
    raise exception 'FALHA: a mesma fonte foi entregue duas vezes';
  end if;
  perform oportunidades.registrar_fim_leitura(r.leitura_id, null, 5, 5);
  if not exists (select 1 from oportunidades.leituras where id = r.leitura_id and situacao = 'sucesso' and itens_lidos = 5) then
    raise exception 'FALHA: a leitura deveria fechar como sucesso';
  end if;
end;
$$;

-- O portão: itens bons entram em moderação (fonte em observação); os ruins ficam com motivo.
create temporary table casos (chave text, candidato jsonb);
insert into casos values
  ('bom', jsonb_build_object('titulo', 'Edital bom', 'tipo', 'edital_fomento', 'link_oficial', 'https://e.org/bom',
     'prazo', (current_date + 20)::text, 'natureza_prazo', 'encerramento_inscricoes', 'abrangencia', 'estado',
     'ufs', jsonb_build_array('sp'), 'publico', 'ambos')),
  ('vencido', jsonb_build_object('titulo', 'Edital vencido', 'tipo', 'edital_fomento', 'link_oficial', 'https://e.org/v',
     'prazo', (current_date - 1)::text, 'natureza_prazo', 'encerramento_inscricoes', 'abrangencia', 'nacional', 'publico', 'ambos')),
  ('regiao', jsonb_build_object('titulo', 'Região errada', 'tipo', 'evento', 'link_oficial', 'https://e.org/r',
     'prazo', (current_date + 5)::text, 'natureza_prazo', 'data_do_evento', 'abrangencia', 'estado', 'publico', 'ambos')),
  ('tipo', jsonb_build_object('titulo', 'Tipo fora da lista', 'tipo', 'bolsa', 'link_oficial', 'https://e.org/t',
     'prazo', (current_date + 5)::text, 'natureza_prazo', 'data_do_evento', 'abrangencia', 'nacional', 'publico', 'ambos')),
  ('sem_candidato', null);

insert into oportunidades.itens_brutos (fonte_id, conteudo, hash_conteudo, candidato)
select '00000000-0000-4000-8000-0000000000f2', jsonb_build_object('chave', chave),
       encode(sha256(convert_to(chave, 'UTF8')), 'hex'), candidato
from casos;

do $$
declare
  r record;
  motivo_vencido text;
  motivo_regiao text;
begin
  select * into r from oportunidades.processar_pendentes();
  if r.processados <> 5 or r.em_moderacao <> 1 or r.publicados <> 0 or r.rejeitados <> 4 then
    raise exception 'FALHA: portão deveria aprovar 1 (em moderação) e recusar 4; deu %', r;
  end if;

  if not exists (select 1 from oportunidades.oportunidades
                 where titulo = 'Edital bom' and situacao = 'em_moderacao' and ufs = array['SP']) then
    raise exception 'FALHA: o item bom deveria virar oportunidade em moderação, com a UF em maiúsculas';
  end if;

  select motivo into motivo_vencido from oportunidades.itens_brutos where conteudo->>'chave' = 'vencido';
  if motivo_vencido not like 'O prazo já passou%' then
    raise exception 'FALHA: o motivo do item vencido deveria explicar o prazo, veio: %', motivo_vencido;
  end if;

  select motivo into motivo_regiao from oportunidades.itens_brutos where conteudo->>'chave' = 'regiao';
  if motivo_regiao not like 'Região:%' then
    raise exception 'FALHA: o motivo do item com região errada deveria explicar a região, veio: %', motivo_regiao;
  end if;
end;
$$;

-- Fonte confiável publica direto; item repetido (mesmo link) atualiza em vez de duplicar.
update oportunidades.fontes set confianca = 'confiavel' where id = '00000000-0000-4000-8000-0000000000f2';

insert into oportunidades.itens_brutos (fonte_id, conteudo, hash_conteudo, candidato)
values
  ('00000000-0000-4000-8000-0000000000f2', '{"chave":"novo"}', encode(sha256(convert_to('novo', 'UTF8')), 'hex'),
   jsonb_build_object('titulo', 'Game jam nova', 'tipo', 'game_jam', 'link_oficial', 'https://e.org/jam',
     'prazo', (current_date + 9)::text, 'natureza_prazo', 'data_do_evento', 'abrangencia', 'nacional', 'publico', 'pessoa')),
  ('00000000-0000-4000-8000-0000000000f2', '{"chave":"bom-mudou"}', encode(sha256(convert_to('bom-mudou', 'UTF8')), 'hex'),
   jsonb_build_object('titulo', 'Edital bom (prazo prorrogado)', 'tipo', 'edital_fomento', 'link_oficial', 'https://e.org/bom',
     'prazo', (current_date + 40)::text, 'natureza_prazo', 'encerramento_inscricoes', 'abrangencia', 'estado',
     'ufs', jsonb_build_array('SP'), 'publico', 'ambos'));

do $$
declare
  r record;
  n integer;
begin
  select * into r from oportunidades.processar_pendentes();
  if r.processados <> 2 or r.rejeitados <> 0 then
    raise exception 'FALHA: os dois itens novos deveriam passar; deu %', r;
  end if;
  if not exists (select 1 from oportunidades.oportunidades where titulo = 'Game jam nova' and situacao = 'publicada' and publicada_em is not null) then
    raise exception 'FALHA: item de fonte confiável deveria ser publicado direto';
  end if;
  select count(*) into n from oportunidades.oportunidades where link_oficial = 'https://e.org/bom';
  if n <> 1 then
    raise exception 'FALHA: o item repetido deveria atualizar, não duplicar (há %)', n;
  end if;
  if not exists (select 1 from oportunidades.oportunidades where link_oficial = 'https://e.org/bom' and titulo like '%prorrogado%') then
    raise exception 'FALHA: o item repetido deveria ter sido atualizado';
  end if;
end;
$$;

-- Três falhas seguidas pausam a fonte.
update oportunidades.fontes set proxima_leitura_em = now() - interval '1 minute' where id = '00000000-0000-4000-8000-0000000000f2';

do $$
declare
  r record;
  tentativa integer;
begin
  for tentativa in 1..3 loop
    update oportunidades.fontes set proxima_leitura_em = now() - interval '1 minute' where id = '00000000-0000-4000-8000-0000000000f2';
    select * into r from oportunidades.reservar_proxima_fonte();
    perform oportunidades.registrar_fim_leitura(r.leitura_id, 'site fora do ar');
  end loop;
  if not exists (select 1 from oportunidades.fontes where id = '00000000-0000-4000-8000-0000000000f2'
                 and situacao = 'pausada' and falhas_seguidas = 3 and ultimo_erro = 'site fora do ar') then
    raise exception 'FALHA: três falhas seguidas deveriam pausar a fonte';
  end if;
  update oportunidades.fontes set proxima_leitura_em = now() - interval '1 minute' where id = '00000000-0000-4000-8000-0000000000f2';
  if exists (select 1 from oportunidades.reservar_proxima_fonte()) then
    raise exception 'FALHA: a fila não deveria entregar fonte pausada';
  end if;
end;
$$;

-- Confiança conquistada: 5 leituras boas e 10 itens com poucos erros promovem a fonte.
insert into oportunidades.fontes (id, nome, leitor) values ('00000000-0000-4000-8000-0000000000f3', 'Fonte nova', 'teste');
insert into oportunidades.leituras (fonte_id, situacao, iniciada_em, terminada_em)
select '00000000-0000-4000-8000-0000000000f3', 'sucesso', now() - make_interval(hours => g), now() - make_interval(hours => g)
from generate_series(1, 5) g;
insert into oportunidades.itens_brutos (fonte_id, conteudo, hash_conteudo, situacao, processado_em)
select '00000000-0000-4000-8000-0000000000f3', jsonb_build_object('n', g),
       encode(sha256(convert_to('f3-' || g, 'UTF8')), 'hex'), 'processado', now()
from generate_series(1, 10) g;

do $$
begin
  if oportunidades.avaliar_confianca('00000000-0000-4000-8000-0000000000f3') <> 'confiavel' then
    raise exception 'FALHA: a fonte com histórico bom deveria passar a confiável';
  end if;

  insert into oportunidades.itens_brutos (fonte_id, conteudo, hash_conteudo, situacao, processado_em)
  select '00000000-0000-4000-8000-0000000000f3', jsonb_build_object('erro', g),
         encode(sha256(convert_to('f3-erro-' || g, 'UTF8')), 'hex'), 'rejeitado', now()
  from generate_series(1, 5) g;
  if oportunidades.avaliar_confianca('00000000-0000-4000-8000-0000000000f3') <> 'observacao' then
    raise exception 'FALHA: a fonte com muitos itens recusados deveria voltar para observação';
  end if;
end;
$$;

-- Visitantes e contas não usam as funções da fila.
set local role authenticated;
do $$
begin
  begin
    perform oportunidades.processar_pendentes();
    raise exception 'FALHA: o papel authenticated rodou o portão';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from oportunidades.leituras limit 1;
    raise exception 'FALHA: o papel authenticated leu o registro de leituras';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select 'Fila e portão cumpriram todas as regras.' as resultado;

rollback;
