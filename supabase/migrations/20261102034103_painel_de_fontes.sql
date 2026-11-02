-- Painel de fontes e avisos: uma visão de cada fonte, a lista do que espera uma pessoa, pausar e retomar,
-- e a lista de problemas que a função `vigiar` confere uma vez por dia e manda por e-mail.
-- O painel é lido por consulta no chat; a página visual fica para quando moderadores e organizações usarem.

create function oportunidades.painel_fontes()
returns table (
  id uuid,
  fonte text,
  leitor text,
  situacao oportunidades.situacao_fonte,
  confianca oportunidades.confianca_fonte,
  ultima_leitura_em timestamptz,
  atrasada boolean,
  falhas_seguidas integer,
  ultimo_erro_em timestamptz,
  ultimo_erro text,
  leituras_7d bigint,
  erros_7d bigint,
  lidos_7d bigint,
  novos_7d bigint,
  publicadas bigint,
  em_moderacao bigint,
  links_quebrados bigint,
  links_incertos bigint,
  dias_sem_falha integer
)
language sql
stable
set search_path = ''
as $$
  select
    f.id, f.nome, f.leitor, f.situacao, f.confianca, f.ultima_leitura_em,
    f.situacao = 'ativa' and f.proxima_leitura_em < now() - interval '2 hours',
    f.falhas_seguidas, f.ultimo_erro_em, left(f.ultimo_erro, 300),
    coalesce(l.leituras, 0), coalesce(l.erros, 0), coalesce(l.lidos, 0), coalesce(l.novos, 0),
    coalesce(o.publicadas, 0), coalesce(o.em_moderacao, 0), coalesce(o.quebrados, 0), coalesce(o.incertos, 0),
    -- Dias seguidos sem leitura com erro, contados da primeira leitura: é a contagem do portão.
    coalesce(floor(extract(epoch from now() - greatest(h.primeira, h.ultimo_erro)) / 86400)::integer, 0)
  from oportunidades.fontes f
  left join lateral (
    select count(*) as leituras, count(*) filter (where x.situacao = 'erro') as erros,
      sum(x.itens_lidos) as lidos, sum(x.itens_novos) as novos
    from oportunidades.leituras x
    where x.fonte_id = f.id and x.iniciada_em > now() - interval '7 days'
  ) l on true
  left join lateral (
    select min(x.iniciada_em) as primeira, max(x.iniciada_em) filter (where x.situacao = 'erro') as ultimo_erro
    from oportunidades.leituras x
    where x.fonte_id = f.id
  ) h on true
  left join lateral (
    select count(*) filter (where x.situacao = 'publicada') as publicadas,
      count(*) filter (where x.situacao = 'em_moderacao') as em_moderacao,
      count(*) filter (where x.ultimo_resultado = 'quebrado') as quebrados,
      count(*) filter (where x.ultimo_resultado = 'incerto') as incertos
    from oportunidades.oportunidades x
    where x.fonte_id = f.id and x.situacao in ('publicada', 'em_moderacao')
  ) o on true
  order by f.situacao, f.nome
$$;

revoke all on function oportunidades.painel_fontes() from public, anon, authenticated;
grant execute on function oportunidades.painel_fontes() to service_role;

comment on function oportunidades.painel_fontes() is 'Situação de cada fonte: leituras, erros, oportunidades, links e dias seguidos sem falha.';

-- O que espera uma pessoa: moderação com o motivo, notícias na fila e o que buscaram sem encontrar.
create function oportunidades.pendencias()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'moderacao', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'fonte', f.nome, 'link', x.link_oficial, 'motivo', x.motivo_moderacao) order by x.criado_em)
      from oportunidades.oportunidades x join oportunidades.fontes f on f.id = x.fonte_id
      where x.situacao = 'em_moderacao'
    ), '[]'::jsonb),
    'noticias_na_fila', (select count(*) from oportunidades.noticias n where n.situacao = 'em_fila'),
    'buscas_sem_resultado', coalesce((
      select jsonb_agg(jsonb_build_object('termo', b.termo, 'vezes', b.vezes) order by b.vezes desc, b.termo)
      from (
        select x.termo, sum(x.vezes) as vezes
        from oportunidades.buscas_sem_resultado x
        where x.dia > (now() at time zone 'America/Sao_Paulo')::date - 30
        group by x.termo
        order by vezes desc, x.termo
        limit 30
      ) b
    ), '[]'::jsonb)
  )
$$;

revoke all on function oportunidades.pendencias() from public, anon, authenticated;
grant execute on function oportunidades.pendencias() to service_role;

comment on function oportunidades.pendencias() is 'O que espera uma pessoa: moderação, notícias na fila e buscas sem resultado dos últimos 30 dias.';

create function oportunidades.pausar_fonte(p_fonte uuid)
returns void
language sql
set search_path = ''
as $$
  update oportunidades.fontes set situacao = 'pausada' where id = p_fonte
$$;

create function oportunidades.retomar_fonte(p_fonte uuid)
returns void
language sql
set search_path = ''
as $$
  update oportunidades.fontes
  set situacao = 'ativa', falhas_seguidas = 0, proxima_leitura_em = now()
  where id = p_fonte
$$;

revoke all on function oportunidades.pausar_fonte(uuid) from public, anon, authenticated;
revoke all on function oportunidades.retomar_fonte(uuid) from public, anon, authenticated;
grant execute on function oportunidades.pausar_fonte(uuid) to service_role;
grant execute on function oportunidades.retomar_fonte(uuid) to service_role;

-- O que a `vigiar` avisa. Fonte pausada à mão não é problema: só a pausa automática, depois de falhas.
-- A coleta e a conferência parada aparecem pelos dados: leitura atrasada e conferência vencida há horas.
create function oportunidades.problemas_do_sistema()
returns text[]
language sql
stable
set search_path = ''
as $$
  select array(
    select p.texto from (
      select 1 as ordem, f.nome as chave,
        'A fonte "' || f.nome || '" foi pausada depois de ' || f.falhas_seguidas || ' falhas seguidas. Último erro: ' || coalesce(left(f.ultimo_erro, 300), 'não registrado') as texto
      from oportunidades.fontes f
      where f.situacao = 'pausada' and f.falhas_seguidas >= 3
      union all
      select 2, f.nome, 'A fonte "' || f.nome || '" está com a leitura atrasada há mais de 2 horas. A coleta pode ter parado.'
      from oportunidades.fontes f
      where f.situacao = 'ativa' and f.proxima_leitura_em < now() - interval '2 hours'
      union all
      select 3, f.nome, 'Uma leitura da fonte "' || f.nome || '" começou há mais de 1 hora e não terminou.'
      from oportunidades.leituras l join oportunidades.fontes f on f.id = l.fonte_id
      where l.situacao = 'rodando' and l.iniciada_em < now() - interval '1 hour'
      group by f.nome
      union all
      select 4, '', count(*) || ' oportunidades estão com a conferência de link vencida há mais de 6 horas. A conferência pode ter parado.'
      from oportunidades.oportunidades o
      where o.situacao in ('publicada', 'em_moderacao')
        and o.prazo >= (now() at time zone 'America/Sao_Paulo')::date
        and coalesce(o.proxima_conferencia_em, o.criado_em) < now() - interval '6 hours'
      having count(*) > 0
    ) p
    order by p.ordem, p.chave
  )
$$;

revoke all on function oportunidades.problemas_do_sistema() from public, anon, authenticated;
grant execute on function oportunidades.problemas_do_sistema() to service_role;

-- Vaga que saiu da fonte e voltou idêntica não passa de novo pelo portão, porque o item já existe.
-- Quem saiu por ter sumido da fonte volta ao estado anterior; o que saiu por outro motivo fica fora.
create function oportunidades.reabrir_voltaram(p_fonte uuid, p_links text[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  reabertas integer;
begin
  update oportunidades.oportunidades o
  set situacao = case when o.publicada_em is not null then 'publicada'::oportunidades.situacao_oportunidade
                      else 'em_moderacao'::oportunidades.situacao_oportunidade end,
      motivo_moderacao = null, proxima_conferencia_em = null, falhas_de_link = 0
  where o.id in (
    select distinct on (x.link_oficial) x.id
    from oportunidades.oportunidades x
    where x.fonte_id = p_fonte
      and x.situacao = 'removida'
      and x.motivo_moderacao = 'Saiu da fonte'
      and x.link_oficial = any (coalesce(p_links, array[]::text[]))
      and not exists (
        select 1 from oportunidades.oportunidades ativa
        where ativa.fonte_id = p_fonte and ativa.link_oficial = x.link_oficial
          and ativa.situacao in ('publicada', 'em_moderacao')
      )
    order by x.link_oficial, x.atualizado_em desc
  );
  get diagnostics reabertas = row_count;
  return reabertas;
end;
$$;

revoke all on function oportunidades.reabrir_voltaram(uuid, text[]) from public, anon, authenticated;
grant execute on function oportunidades.reabrir_voltaram(uuid, text[]) to service_role;

-- Agendamento: todo dia às 8h de Brasília.
create function oportunidades.chamar_vigia()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  endereco text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  senha text := (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET');
begin
  if endereco is null or senha is null then
    raise exception 'Faltam os segredos project_url ou CRON_SECRET no Vault';
  end if;
  return net.http_post(
    url := endereco || '/functions/v1/vigiar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || senha),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function oportunidades.chamar_vigia() from public, anon, authenticated;

comment on function oportunidades.chamar_vigia() is 'Chama a função vigiar. Só o agendador (cron) usa.';

select cron.schedule('oportunidades-vigiar', '0 11 * * *', 'select oportunidades.chamar_vigia()');
