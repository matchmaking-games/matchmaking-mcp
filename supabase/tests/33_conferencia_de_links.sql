-- Testes da conferência de links e prazos: duas falhas antes de valer, link da notícia como reserva,
-- moderação para o que é novo, nada muda quando não dá para saber, e renovação só para o que é sem data.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor) values
  ('00000000-0000-4000-8000-0000000000e1', 'Fonte de notícias', 'rss'),
  ('00000000-0000-4000-8000-0000000000e2', 'Planilha', 'planilha');

insert into oportunidades.itens_brutos (id, fonte_id, conteudo, hash_conteudo, situacao) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1',
   '{"feed": {"link": "https://noticia.test/a", "publicado_em": "2026-10-20T12:00:00Z"}}', 'hash-a', 'processado');

create temp table casos (codigo text primary key, id uuid not null default gen_random_uuid());
insert into casos (codigo) values ('com_noticia'), ('sem_noticia'), ('nova'), ('moderada'), ('sem_data'), ('com_prazo'), ('vencida'), ('encerrada');

insert into oportunidades.oportunidades (id, fonte_id, item_bruto_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico, situacao, publicada_em, criado_em)
select c.id,
  case when c.codigo = 'sem_noticia' then '00000000-0000-4000-8000-0000000000e2'::uuid else '00000000-0000-4000-8000-0000000000e1'::uuid end,
  case when c.codigo in ('com_noticia', 'moderada', 'sem_data', 'com_prazo', 'encerrada') then '00000000-0000-4000-8000-0000000000b1'::uuid end,
  'Oportunidade ' || c.codigo, 'evento', 'https://link.test/' || c.codigo,
  case when c.codigo = 'vencida' then current_date - 1 else current_date + 10 end,
  case when c.codigo in ('sem_data', 'encerrada', 'sem_noticia') then 'aberta_sem_data' else 'encerramento_inscricoes' end::oportunidades.natureza_prazo,
  'nacional', 'pessoa',
  case when c.codigo = 'moderada' then 'em_moderacao' else 'publicada' end::oportunidades.situacao_oportunidade,
  case when c.codigo = 'moderada' then null else now() end,
  case when c.codigo = 'nova' then now() else now() - interval '10 days' end
from casos c;

do $$
declare
  v_id uuid;
  r text;
  o oportunidades.oportunidades%rowtype;
  n integer;
begin
  -- A lista: só o que está aberto e ainda não foi conferido, com o link da notícia e o pedido de releitura.
  select count(*) into n from oportunidades.oportunidades_a_conferir(100);
  if n <> 7 then
    raise exception 'FALHA: deveriam vir 7 para conferir (a vencida fica de fora); vieram %', n;
  end if;
  select id into v_id from casos where codigo = 'sem_data';
  if not (select a.reler and a.link_noticia = 'https://noticia.test/a' from oportunidades.oportunidades_a_conferir(100) a where a.id = v_id) then
    raise exception 'FALHA: sem data vinda de notícia deveria ser relida e trazer o link da notícia';
  end if;
  select id into v_id from casos where codigo = 'sem_noticia';
  if (select a.reler from oportunidades.oportunidades_a_conferir(100) a where a.id = v_id) then
    raise exception 'FALHA: sem data de planilha não é relida pela IA';
  end if;

  -- Link quebrado com notícia que abre: a 1ª falha só espera 1 dia; a 2ª troca o link.
  select id into v_id from casos where codigo = 'com_noticia';
  r := oportunidades.registrar_conferencia(v_id, 'quebrado');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'falha' or o.situacao <> 'publicada' or o.falhas_de_link <> 1 or o.proxima_conferencia_em < now() + interval '23 hours' then
    raise exception 'FALHA: a 1ª falha só deveria esperar 1 dia; veio %, %', r, to_jsonb(o);
  end if;
  if exists (select 1 from oportunidades.oportunidades_a_conferir(100) a where a.id = v_id) then
    raise exception 'FALHA: depois da 1ª falha, só volta à lista no dia seguinte';
  end if;
  r := oportunidades.registrar_conferencia(v_id, 'quebrado', true);
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'link_trocado' or o.link_oficial <> 'https://noticia.test/a' or o.situacao <> 'publicada' or o.falhas_de_link <> 0
     or o.motivo_moderacao not like '%https://link.test/com_noticia%' then
    raise exception 'FALHA: a 2ª falha deveria trocar pelo link da notícia, guardando o antigo; veio %, %', r, to_jsonb(o);
  end if;

  -- Sem notícia que abra: sai da vitrine com o motivo.
  select id into v_id from casos where codigo = 'sem_noticia';
  perform oportunidades.registrar_conferencia(v_id, 'quebrado');
  r := oportunidades.registrar_conferencia(v_id, 'quebrado', false);
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'removida' or o.situacao <> 'removida' or o.motivo_moderacao not like '%duas conferências%' then
    raise exception 'FALHA: sem reserva, a 2ª falha tira da vitrine; veio %, %', r, to_jsonb(o);
  end if;

  -- Uma resposta boa no meio zera a contagem.
  select id into v_id from casos where codigo = 'com_prazo';
  perform oportunidades.registrar_conferencia(v_id, 'quebrado');
  r := oportunidades.registrar_conferencia(v_id, 'abre');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'ok' or o.falhas_de_link <> 0 or o.conferida_em is null or o.proxima_conferencia_em < now() + interval '6 days' then
    raise exception 'FALHA: link que abre zera as falhas e volta em 7 dias; veio %, %', r, to_jsonb(o);
  end if;

  -- Não dá para saber: nada muda além da anotação.
  r := oportunidades.registrar_conferencia(v_id, 'incerto');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'incerta' or o.situacao <> 'publicada' or o.falhas_de_link <> 0 or o.ultimo_resultado <> 'incerto' then
    raise exception 'FALHA: resultado incerto não muda a oportunidade; veio %, %', r, to_jsonb(o);
  end if;

  -- Oportunidade recém-publicada, nunca conferida: vai para a moderação na 1ª falha.
  select id into v_id from casos where codigo = 'nova';
  r := oportunidades.registrar_conferencia(v_id, 'quebrado');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'moderacao' or o.situacao <> 'em_moderacao' or o.motivo_moderacao not like '%primeira conferência%' then
    raise exception 'FALHA: oportunidade nova com link quebrado vai para a moderação; veio %, %', r, to_jsonb(o);
  end if;

  -- Quem está na moderação, sem notícia que abra, continua lá para uma pessoa decidir.
  select id into v_id from casos where codigo = 'moderada';
  perform oportunidades.registrar_conferencia(v_id, 'quebrado');
  r := oportunidades.registrar_conferencia(v_id, 'quebrado', false);
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'moderacao' or o.situacao <> 'em_moderacao' then
    raise exception 'FALHA: na moderação, a decisão é de uma pessoa; veio %, %', r, to_jsonb(o);
  end if;

  -- Sem data: aberta ganha 30 dias; sem como saber não renova; encerrada sai.
  select id into v_id from casos where codigo = 'sem_data';
  r := oportunidades.registrar_conferencia(v_id, 'abre', false, 'incerta');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'ok' or o.prazo <> current_date + 10 then
    raise exception 'FALHA: sem como saber não renova; veio %, %', r, o.prazo;
  end if;
  r := oportunidades.registrar_conferencia(v_id, 'abre', false, 'aberta');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'renovada' or o.prazo <> current_date + 30 then
    raise exception 'FALHA: aberta ganha 30 dias; veio %, %', r, o.prazo;
  end if;

  select id into v_id from casos where codigo = 'encerrada';
  r := oportunidades.registrar_conferencia(v_id, 'abre', false, 'encerrada', 'A página diz que as inscrições acabaram');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'removida' or o.situacao <> 'removida' or o.motivo_moderacao not like '%inscrições acabaram%' then
    raise exception 'FALHA: encerrada sai da vitrine, com o motivo; veio %, %', r, to_jsonb(o);
  end if;

  -- A renovação nunca encurta, e prazo informado pela fonte não muda.
  select id into v_id from casos where codigo = 'com_prazo';
  r := oportunidades.registrar_conferencia(v_id, 'abre', false, 'aberta');
  select * into o from oportunidades.oportunidades where id = v_id;
  if r <> 'ok' or o.prazo <> current_date + 10 then
    raise exception 'FALHA: prazo informado pela fonte não é renovado; veio %, %', r, o.prazo;
  end if;

  -- O que já saiu não volta por conferência.
  select id into v_id from casos where codigo = 'encerrada';
  if oportunidades.registrar_conferencia(v_id, 'abre') <> 'ignorada' then
    raise exception 'FALHA: oportunidade removida não é conferida de novo';
  end if;

  -- A busca mostra a data da conferência.
  select id into v_id from casos where codigo = 'com_prazo';
  if not exists (
    select 1 from jsonb_array_elements(vitrine.pesquisar_oportunidades(p_limite => 20) -> 'resultados') x
    where (x ->> 'id')::uuid = v_id and x ->> 'conferida_em' is not null
  ) then
    raise exception 'FALHA: a busca deveria devolver a data da conferência';
  end if;

  if not exists (select 1 from cron.job where jobname = 'oportunidades-conferir' and command = 'select oportunidades.chamar_conferencia()') then
    raise exception 'FALHA: a conferência deveria estar agendada';
  end if;
  if has_function_privilege('authenticated', 'oportunidades.registrar_conferencia(uuid, text, boolean, text, text)', 'execute') then
    raise exception 'FALHA: quem usa o MCP não registra conferências';
  end if;
end;
$$;

rollback;
