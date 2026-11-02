-- Testes do painel de fontes: a visão de cada fonte, as pendências, pausar e retomar, os problemas que
-- viram aviso e a reabertura de quem saiu da fonte e voltou.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor, proxima_leitura_em) values
  ('00000000-0000-4000-8000-0000000000a1', 'Fonte boa', 'rss', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000a2', 'Fonte atrasada', 'rss', now() - interval '3 hours');

insert into oportunidades.fontes (id, nome, leitor, situacao, falhas_seguidas, ultimo_erro) values
  ('00000000-0000-4000-8000-0000000000a3', 'Fonte que falhou', 'rss', 'pausada', 3, 'O feed respondeu 500'),
  ('00000000-0000-4000-8000-0000000000a4', 'Fonte pausada à mão', 'rss', 'pausada', 0, null);

insert into oportunidades.leituras (fonte_id, situacao, iniciada_em, itens_lidos, itens_novos) values
  ('00000000-0000-4000-8000-0000000000a1', 'sucesso', now() - interval '9 days', 10, 10),
  ('00000000-0000-4000-8000-0000000000a1', 'erro', now() - interval '3 days 1 hour', 0, 0),
  ('00000000-0000-4000-8000-0000000000a1', 'sucesso', now() - interval '1 day', 8, 2),
  ('00000000-0000-4000-8000-0000000000a2', 'rodando', now() - interval '2 hours', 0, 0);

insert into oportunidades.oportunidades (id, fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico, situacao, publicada_em, motivo_moderacao, ultimo_resultado, proxima_conferencia_em)
values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000a1', 'Publicada com link quebrado', 'evento', 'https://x.test/1', current_date + 5, 'encerramento_inscricoes', 'nacional', 'pessoa', 'publicada', now(), null, 'quebrado', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-0000000000a1', 'Na moderação', 'evento', 'https://x.test/2', current_date + 5, 'encerramento_inscricoes', 'nacional', 'pessoa', 'em_moderacao', null, 'O link não abriu', 'incerto', now() + interval '7 days'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-0000000000a1', 'Saiu da fonte', 'vaga', 'https://x.test/3', current_date + 5, 'vaga_aberta', 'nacional', 'pessoa', 'removida', now(), 'Saiu da fonte', null, null),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-0000000000a1', 'Link morto', 'vaga', 'https://x.test/4', current_date + 5, 'vaga_aberta', 'nacional', 'pessoa', 'removida', now(), 'O link oficial não abriu em duas conferências', null, null);

insert into oportunidades.buscas_sem_resultado (termo, vezes) values ('level design', 3), ('edital', 1);

do $$
declare
  p record;
  r jsonb;
  t text[];
  n integer;
begin
  select * into p from oportunidades.painel_fontes() where id = '00000000-0000-4000-8000-0000000000a1';
  if p.atrasada or p.leituras_7d <> 2 or p.erros_7d <> 1 or p.lidos_7d <> 8 or p.novos_7d <> 2 then
    raise exception 'FALHA: leituras de 7 dias erradas: %', to_jsonb(p);
  end if;
  if p.publicadas <> 1 or p.em_moderacao <> 1 or p.links_quebrados <> 1 or p.links_incertos <> 1 then
    raise exception 'FALHA: contagem de oportunidades errada: %', to_jsonb(p);
  end if;
  if p.dias_sem_falha <> 3 then
    raise exception 'FALHA: os dias sem falha contam do último erro; veio %', p.dias_sem_falha;
  end if;

  select * into p from oportunidades.painel_fontes() where id = '00000000-0000-4000-8000-0000000000a2';
  if not p.atrasada or p.dias_sem_falha <> 0 then
    raise exception 'FALHA: a fonte deveria aparecer atrasada, com a contagem desde a primeira leitura; veio %', to_jsonb(p);
  end if;

  r := oportunidades.pendencias();
  if jsonb_array_length(r -> 'moderacao') <> 1 or r -> 'moderacao' -> 0 ->> 'motivo' <> 'O link não abriu' then
    raise exception 'FALHA: a moderação deveria vir com o motivo: %', r -> 'moderacao';
  end if;
  if r -> 'buscas_sem_resultado' -> 0 ->> 'termo' <> 'level design' or (r -> 'noticias_na_fila')::integer <> 0 then
    raise exception 'FALHA: pendências erradas: %', r;
  end if;

  -- Os problemas: fonte pausada por falhas, atrasada e leitura travada. Pausa à mão não é problema.
  t := oportunidades.problemas_do_sistema();
  if cardinality(t) <> 3 or t[1] not like '%"Fonte que falhou"%500%' or t[2] not like '%"Fonte atrasada"%atrasada%' or t[3] not like '%"Fonte atrasada"%não terminou%' then
    raise exception 'FALHA: problemas errados: %', t;
  end if;

  update oportunidades.oportunidades set proxima_conferencia_em = now() - interval '7 hours' where id = '00000000-0000-4000-8000-000000000011';
  t := oportunidades.problemas_do_sistema();
  if cardinality(t) <> 4 or t[4] not like '1 oportunidades%conferência%' then
    raise exception 'FALHA: conferência parada deveria aparecer: %', t;
  end if;

  -- Retomar zera as falhas e lê logo; pausar à mão tira do aviso.
  perform oportunidades.retomar_fonte('00000000-0000-4000-8000-0000000000a3');
  select * into p from oportunidades.painel_fontes() where id = '00000000-0000-4000-8000-0000000000a3';
  if p.situacao <> 'ativa' or p.falhas_seguidas <> 0 then
    raise exception 'FALHA: retomar deveria ativar e zerar as falhas: %', to_jsonb(p);
  end if;
  perform oportunidades.pausar_fonte('00000000-0000-4000-8000-0000000000a3');
  if (select situacao from oportunidades.fontes where id = '00000000-0000-4000-8000-0000000000a3') <> 'pausada' then
    raise exception 'FALHA: pausar deveria pausar';
  end if;

  -- Reabertura: só quem saiu por ter sumido da fonte, e só uma vez.
  n := oportunidades.reabrir_voltaram('00000000-0000-4000-8000-0000000000a1', array['https://x.test/3', 'https://x.test/4']);
  if n <> 1 or (select situacao from oportunidades.oportunidades where id = '00000000-0000-4000-8000-000000000013') <> 'publicada'
     or (select situacao from oportunidades.oportunidades where id = '00000000-0000-4000-8000-000000000014') <> 'removida' then
    raise exception 'FALHA: só a que saiu da fonte volta; reabertas: %', n;
  end if;
  if oportunidades.reabrir_voltaram('00000000-0000-4000-8000-0000000000a1', array['https://x.test/3']) <> 0 then
    raise exception 'FALHA: quem já voltou não reabre de novo';
  end if;

  if not exists (select 1 from cron.job where jobname = 'oportunidades-vigiar' and command = 'select oportunidades.chamar_vigia()') then
    raise exception 'FALHA: o vigia deveria estar agendado';
  end if;
  if has_function_privilege('authenticated', 'oportunidades.painel_fontes()', 'execute')
     or has_function_privilege('anon', 'oportunidades.pausar_fonte(uuid)', 'execute') then
    raise exception 'FALHA: quem usa o MCP não vê o painel nem pausa fontes';
  end if;
end;
$$;

rollback;
