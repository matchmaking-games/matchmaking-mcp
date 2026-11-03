-- Testes da leitura do site: só o que é público entra, contato nunca é copiado, o que sai do site sai do
-- índice, e vaga em destaque ganha selo e desempate, sem furar a relevância.
begin;
set local timezone = 'America/Sao_Paulo';

-- Imitações das tabelas do site, só com o que a rotina lê.
create table public.estudios (id uuid primary key, nome text);
create table public.organizacoes (id uuid primary key, nome text);
create table public.vagas (
  id uuid primary key default gen_random_uuid(), estudio_id uuid, organizacao_id uuid, titulo text, slug text, descricao text,
  remoto text, estado text, salario_min integer, salario_max integer, mostrar_salario boolean default false,
  tipo_publicacao text default 'gratuita', ativa boolean default true, status text default 'publicada',
  expira_em timestamptz default now() + interval '20 days', contato_candidatura text
);
create table public.parcerias (
  id uuid primary key default gen_random_uuid(), estudio_id uuid, organizacao_id uuid, tipo text, titulo text, slug text,
  descricao text, contato text, remoto text, estado text, status text default 'ativa', expira_em date default current_date + 20
);

insert into oportunidades.fontes (id, nome, leitor, configuracao, confianca, promove_sozinha)
values ('00000000-0000-4000-8000-0000000000d1', 'Matchmaking (site)', 'site', '{"site": "https://site.test/"}', 'confiavel', true);

insert into public.estudios values ('00000000-0000-4000-8000-0000000000d2', 'Estúdio Teste');

insert into public.vagas (estudio_id, titulo, slug, descricao, remoto, estado, salario_min, salario_max, mostrar_salario, tipo_publicacao, contato_candidatura, expira_em) values
  ('00000000-0000-4000-8000-0000000000d2', 'Game Designer Presencial', 'gd-sp', '<p>Sistemas e economia.</p>', 'presencial', 'sp', 5000, 8000, true, 'gratuita', 'rh@estudio.test', now() + interval '5 days'),
  ('00000000-0000-4000-8000-0000000000d2', 'Game Designer Destaque', 'gd-destaque', 'Sistemas de combate.', 'remoto', null, 9000, 9500, false, 'destaque', 'vagas@estudio.test', now() + interval '25 days'),
  (null, 'Artista de Marketing Destaque', 'mkt-destaque', 'Peças para o time; game designer ajuda na revisão.', 'remoto', null, null, null, false, 'destaque', null, now() + interval '30 days'),
  (null, 'Vaga sem estado', 'sem-estado', null, 'hibrido', null, null, null, false, 'gratuita', null, now() + interval '6 days');

insert into public.vagas (titulo, slug, remoto, ativa, status) values ('Rascunho ativo', 'rascunho', 'remoto', true, 'rascunho');
insert into public.vagas (titulo, slug, remoto, ativa, status) values ('Aguardando pagamento', 'pagamento', 'remoto', false, 'aguardando_pagamento');
insert into public.vagas (titulo, slug, remoto, expira_em) values ('Vencida', 'vencida', 'remoto', now() - interval '1 day');

insert into public.parcerias (tipo, titulo, slug, descricao, contato, remoto, estado) values
  ('mentoria', 'Mentoria de arte', 'mentoria', 'Encontros mensais.', 'contato@org.test', 'remoto', null),
  ('edital', 'Edital do estado', 'edital', null, 'https://org.test', 'presencial', 'MA'),
  ('freelance_pontual', 'Freelance de áudio', 'freela', null, null, 'remoto', null),
  ('playtest', 'Playtest aberto', 'playtest', null, null, 'remoto', null),
  ('formar_time', 'Procuro time', 'time', null, null, 'remoto', null);
insert into public.parcerias (tipo, titulo, slug, remoto, status) values ('evento', 'Evento em rascunho', 'rasc', 'remoto', 'rascunho');
insert into public.parcerias (tipo, titulo, slug, remoto, expira_em) values ('evento', 'Evento vencido', 'venc', 'remoto', current_date - 1);

do $$
declare
  r jsonb;
  o oportunidades.oportunidades%rowtype;
  n integer;
  c text[];
begin
  r := oportunidades.ler_site();
  if (r ->> 'lidos')::integer <> 8 then
    raise exception 'FALHA: deveriam entrar 4 vagas e 4 colaborações; veio %', r;
  end if;

  select count(*) into n from oportunidades.oportunidades where fonte_id = '00000000-0000-4000-8000-0000000000d1' and situacao = 'publicada';
  if n <> 8 then
    raise exception 'FALHA: fonte confiável publica sozinha; publicadas: %', n;
  end if;

  if exists (select 1 from oportunidades.oportunidades where titulo in ('Rascunho ativo', 'Aguardando pagamento', 'Vencida', 'Procuro time', 'Evento em rascunho', 'Evento vencido')) then
    raise exception 'FALHA: rascunho, pagamento pendente, vencido e "formar time" ficam fora';
  end if;

  select * into o from oportunidades.oportunidades where titulo = 'Game Designer Presencial';
  if o.link_oficial <> 'https://site.test/jobs/gd-sp' or o.tipo <> 'vaga' or o.abrangencia <> 'estado' or o.ufs <> '{SP}'
     or o.publico <> 'pessoa' or o.natureza_prazo <> 'encerramento_inscricoes' or o.valor <> 'R$ 5000 a R$ 8000'
     or o.descricao <> 'Publicada por Estúdio Teste. Sistemas e economia.' or o.destaque then
    raise exception 'FALHA: vaga presencial mapeada errado: %', to_jsonb(o);
  end if;

  select * into o from oportunidades.oportunidades where titulo = 'Game Designer Destaque';
  if o.abrangencia <> 'remoto' or o.valor is not null or not o.destaque then
    raise exception 'FALHA: remota, sem mostrar salário e em destaque: %', to_jsonb(o);
  end if;

  if (select abrangencia from oportunidades.oportunidades where titulo = 'Vaga sem estado') <> 'nacional' then
    raise exception 'FALHA: híbrida sem estado vira nacional';
  end if;

  if (select tipo from oportunidades.oportunidades where titulo = 'Mentoria de arte') <> 'mentoria'
     or (select tipo from oportunidades.oportunidades where titulo = 'Edital do estado') <> 'edital_fomento'
     or (select tipo from oportunidades.oportunidades where titulo = 'Freelance de áudio') <> 'terceirizacao_codesenvolvimento'
     or (select tipo from oportunidades.oportunidades where titulo = 'Playtest aberto') <> 'evento'
     or (select link_oficial from oportunidades.oportunidades where titulo = 'Mentoria de arte') <> 'https://site.test/collaborations/mentoria' then
    raise exception 'FALHA: colaborações mapeadas errado';
  end if;

  -- Contato nunca é copiado, nem no item guardado.
  if exists (
    select 1 from oportunidades.itens_brutos b
    where b.fonte_id = '00000000-0000-4000-8000-0000000000d1' and (b.conteudo::text ~ '@' or b.candidato::text ~ '@')
  ) then
    raise exception 'FALHA: contato não pode entrar no índice';
  end if;

  -- A coleta nunca pega esta fonte, e a leitura fica registrada.
  if exists (select 1 from oportunidades.fontes where id = '00000000-0000-4000-8000-0000000000d1' and proxima_leitura_em <> 'infinity')
     or (select count(*) from oportunidades.leituras where fonte_id = '00000000-0000-4000-8000-0000000000d1' and situacao = 'sucesso') <> 1 then
    raise exception 'FALHA: a fonte fica fora da fila da coleta, com a leitura registrada';
  end if;

  -- Ler de novo sem mudança não cria nada.
  r := oportunidades.ler_site();
  if (r ->> 'novos')::integer <> 0 then
    raise exception 'FALHA: sem mudança, nada é novo; veio %', r;
  end if;

  -- Busca: destaque desempata entre iguais, mesmo com prazo mais longo. O que só tem o termo na descrição
  -- continua atrás, mesmo em destaque. O que não bate com a busca não aparece.
  select array_agg(x ->> 'titulo' order by ord) into c
  from jsonb_array_elements(vitrine.pesquisar_oportunidades(p_texto => 'game designer', p_limite => 10) -> 'resultados') with ordinality as t (x, ord);
  if c <> array['Game Designer Destaque', 'Game Designer Presencial', 'Artista de Marketing Destaque'] then
    raise exception 'FALHA: destaque só desempata; veio %', c;
  end if;

  select array_agg(x ->> 'titulo') into c
  from jsonb_array_elements(vitrine.pesquisar_oportunidades(p_texto => 'mentoria de arte', p_limite => 10) -> 'resultados') x;
  if 'Game Designer Destaque' = any (c) then
    raise exception 'FALHA: destaque que não bate com a busca fica de fora; veio %', c;
  end if;

  -- Sem termo não há relevância para empatar: vale o prazo.
  if (vitrine.pesquisar_oportunidades(p_tipo => 'vaga', p_limite => 1) -> 'resultados' -> 0 ->> 'titulo') <> 'Game Designer Presencial' then
    raise exception 'FALHA: sem termo, o destaque não muda a ordem';
  end if;

  if (vitrine.pesquisar_oportunidades(p_texto => 'game designer', p_limite => 1) -> 'resultados' -> 0 -> 'destaque') <> 'true'::jsonb then
    raise exception 'FALHA: a busca devolve o selo';
  end if;
  if (vitrine.ver_oportunidade((select id from oportunidades.oportunidades where titulo = 'Game Designer Destaque')) -> 'destaque') <> 'true'::jsonb then
    raise exception 'FALHA: o detalhe devolve o selo';
  end if;

  -- Deixou de ser destaque no site: perde o selo.
  update public.vagas set tipo_publicacao = 'gratuita' where slug = 'gd-destaque';
  perform oportunidades.ler_site();
  if (select destaque from oportunidades.oportunidades where titulo = 'Game Designer Destaque') then
    raise exception 'FALHA: sem destaque no site, sem selo';
  end if;

  -- Saiu do site: sai do índice. Voltou igual: reabre.
  update public.vagas set ativa = false where slug = 'gd-sp';
  r := oportunidades.ler_site();
  select * into o from oportunidades.oportunidades where titulo = 'Game Designer Presencial';
  if (r ->> 'encerradas')::integer <> 1 or o.situacao <> 'removida' then
    raise exception 'FALHA: o que sai do site sai do índice; veio %, %', r, o.situacao;
  end if;
  update public.vagas set ativa = true where slug = 'gd-sp';
  r := oportunidades.ler_site();
  if (r ->> 'reabertas')::integer <> 1 or (select situacao from oportunidades.oportunidades where titulo = 'Game Designer Presencial') <> 'publicada' then
    raise exception 'FALHA: o que volta ao site reabre; veio %', r;
  end if;

  -- Editou no site: atualiza no lugar, sem duplicar.
  update public.vagas set titulo = 'Game Designer Sênior Presencial' where slug = 'gd-sp';
  perform oportunidades.ler_site();
  if (select count(*) from oportunidades.oportunidades where link_oficial = 'https://site.test/jobs/gd-sp' and situacao = 'publicada') <> 1
     or not exists (select 1 from oportunidades.oportunidades where titulo = 'Game Designer Sênior Presencial') then
    raise exception 'FALHA: edição atualiza a mesma oportunidade';
  end if;

  -- Sem fonte ativa, não faz nada. Leitura parada aparece para o vigia.
  update oportunidades.fontes set ultima_leitura_em = now() - interval '3 hours' where id = '00000000-0000-4000-8000-0000000000d1';
  if not exists (select 1 from unnest(oportunidades.problemas_do_sistema()) p where p like '%"Matchmaking (site)" não é lida%') then
    raise exception 'FALHA: leitura do site parada deveria aparecer para o vigia';
  end if;
  update oportunidades.fontes set situacao = 'pausada' where id = '00000000-0000-4000-8000-0000000000d1';
  if (oportunidades.ler_site() ->> 'lidos')::integer <> 0 then
    raise exception 'FALHA: fonte pausada não é lida';
  end if;

  -- Endereço inválido falha com registro, sem tirar nada do índice.
  update oportunidades.fontes set situacao = 'ativa', configuracao = '{"site": "sem endereço"}' where id = '00000000-0000-4000-8000-0000000000d1';
  r := oportunidades.ler_site();
  if r ->> 'erro' is null or (select falhas_seguidas from oportunidades.fontes where id = '00000000-0000-4000-8000-0000000000d1') <> 1
     or not exists (select 1 from oportunidades.oportunidades where titulo = 'Mentoria de arte' and situacao = 'publicada') then
    raise exception 'FALHA: erro de configuração registra a falha e não fecha nada; veio %', r;
  end if;

  if not exists (select 1 from cron.job where jobname = 'oportunidades-ler-site' and command = 'select oportunidades.ler_site()') then
    raise exception 'FALHA: a leitura do site deveria estar agendada';
  end if;
  if has_function_privilege('authenticated', 'oportunidades.ler_site()', 'execute') then
    raise exception 'FALHA: quem usa o MCP não dispara a leitura';
  end if;
end;
$$;

rollback;
