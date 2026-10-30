-- Fila de coleta, registro de leituras e portão de qualidade.
-- Os leitores de fonte (próxima etapa) gravam itens brutos com um "candidato" já no formato
-- do contrato mínimo; o portão confere cada candidato antes de ele virar oportunidade.

-- Cada fonte é lida de tempos em tempos, uma por vez.
alter table oportunidades.fontes
  add column intervalo_minutos integer not null default 360 check (intervalo_minutos between 15 and 10080),
  add column proxima_leitura_em timestamptz not null default now();

alter table oportunidades.itens_brutos
  add column candidato jsonb check (candidato is null or jsonb_typeof(candidato) = 'object');

comment on column oportunidades.itens_brutos.candidato is
  'Item no formato do contrato mínimo, montado pelo leitor. O portão de qualidade confere antes de publicar.';

create type oportunidades.situacao_leitura as enum ('rodando', 'sucesso', 'erro');

-- Registro de cada leitura: quando, quantos itens e qual erro.
create table oportunidades.leituras (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references oportunidades.fontes (id) on delete cascade,
  situacao oportunidades.situacao_leitura not null default 'rodando',
  iniciada_em timestamptz not null default now(),
  terminada_em timestamptz,
  itens_lidos integer not null default 0 check (itens_lidos >= 0),
  itens_novos integer not null default 0 check (itens_novos >= 0),
  erro text check (char_length(erro) <= 2000)
);

comment on table oportunidades.leituras is 'Registro de cada leitura de fonte, para o painel de fontes e para a confiança.';

create index leituras_fonte_idx on oportunidades.leituras (fonte_id, iniciada_em desc);

alter table oportunidades.leituras enable row level security;
revoke all on table oportunidades.leituras from anon, authenticated;
grant select, insert, update, delete on table oportunidades.leituras to service_role;

-- Reserva a próxima fonte com leitura vencida e abre o registro da leitura.
-- "skip locked" impede que duas execuções peguem a mesma fonte.
create function oportunidades.reservar_proxima_fonte()
returns table (leitura_id uuid, fonte_id uuid, leitor text, endereco text, configuracao jsonb)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  f record;
  nova_leitura uuid;
begin
  select id, leitor, endereco, configuracao, intervalo_minutos into f
  from oportunidades.fontes
  where situacao = 'ativa' and proxima_leitura_em <= now()
  order by proxima_leitura_em
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update oportunidades.fontes
  set proxima_leitura_em = now() + make_interval(mins => f.intervalo_minutos)
  where id = f.id;

  insert into oportunidades.leituras (fonte_id) values (f.id) returning id into nova_leitura;

  return query select nova_leitura, f.id, f.leitor, f.endereco, f.configuracao;
end;
$$;

-- Toda fonte começa em observação. Ela passa a publicar sozinha depois de um histórico bom
-- e volta para observação se a qualidade cair.
create function oportunidades.avaliar_confianca(p_fonte uuid)
returns oportunidades.confianca_fonte
language plpgsql
set search_path = ''
as $$
declare
  atual oportunidades.confianca_fonte;
  leituras_boas integer;
  processados integer;
  rejeitados integer;
  recusados_na_moderacao integer;
  taxa_rejeicao numeric;
  nova oportunidades.confianca_fonte;
begin
  select confianca into atual from oportunidades.fontes where id = p_fonte;

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
  if atual = 'observacao'
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

-- Fecha o registro da leitura. Três falhas seguidas pausam a fonte.
create function oportunidades.registrar_fim_leitura(
  p_leitura uuid,
  p_erro text default null,
  p_itens_lidos integer default 0,
  p_itens_novos integer default 0
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_fonte uuid;
begin
  update oportunidades.leituras
  set situacao = case when p_erro is null then 'sucesso'::oportunidades.situacao_leitura
                      else 'erro'::oportunidades.situacao_leitura end,
      terminada_em = now(),
      itens_lidos = greatest(p_itens_lidos, 0),
      itens_novos = greatest(p_itens_novos, 0),
      erro = left(p_erro, 2000)
  where id = p_leitura and situacao = 'rodando'
  returning fonte_id into v_fonte;

  if v_fonte is null then
    raise exception 'Leitura % não encontrada ou já encerrada', p_leitura;
  end if;

  if p_erro is null then
    update oportunidades.fontes
    set ultima_leitura_em = now(), falhas_seguidas = 0
    where id = v_fonte;
    perform oportunidades.avaliar_confianca(v_fonte);
  else
    update oportunidades.fontes
    set ultimo_erro = left(p_erro, 2000),
        ultimo_erro_em = now(),
        falhas_seguidas = falhas_seguidas + 1,
        situacao = case when falhas_seguidas + 1 >= 3 then 'pausada'::oportunidades.situacao_fonte else situacao end
    where id = v_fonte;
  end if;
end;
$$;

-- Portão de qualidade: confere os itens pendentes sem IA.
-- Aprovado: vira oportunidade, publicada se a fonte é confiável, em moderação se está em observação.
-- Recusado: fica nas pendências, com o motivo, para a fonte corrigir a linha.
create function oportunidades.processar_pendentes(p_limite integer default 100)
returns table (processados integer, publicados integer, em_moderacao integer, rejeitados integer)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  item record;
  c jsonb;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_situacao oportunidades.situacao_oportunidade;
  v_prazo date;
  v_ufs text[];
  v_existente uuid;
  v_restricao text;
  v_motivo text;
begin
  processados := 0;
  publicados := 0;
  em_moderacao := 0;
  rejeitados := 0;

  for item in
    select i.id, i.fonte_id, i.candidato, f.confianca
    from oportunidades.itens_brutos i
    join oportunidades.fontes f on f.id = i.fonte_id
    where i.situacao = 'pendente'
    order by i.recebido_em
    limit least(greatest(coalesce(p_limite, 100), 1), 1000)
    for update of i skip locked
  loop
    processados := processados + 1;
    c := item.candidato;
    begin
      if c is null then
        raise exception 'O leitor não montou o item no formato do contrato mínimo' using errcode = 'P0001';
      end if;

      v_prazo := (c->>'prazo')::date;
      if v_prazo is null then
        raise exception 'Falta o prazo ou a data' using errcode = 'P0001';
      end if;
      if v_prazo < hoje then
        raise exception 'O prazo já passou (%)', to_char(v_prazo, 'DD/MM/YYYY') using errcode = 'P0001';
      end if;

      v_ufs := case when jsonb_typeof(c->'ufs') = 'array'
                    then array(select upper(jsonb_array_elements_text(c->'ufs')))
                    else null end;
      v_situacao := case when item.confianca = 'confiavel' then 'publicada'::oportunidades.situacao_oportunidade
                         else 'em_moderacao'::oportunidades.situacao_oportunidade end;

      select o.id into v_existente
      from oportunidades.oportunidades o
      where o.fonte_id = item.fonte_id and o.link_oficial = c->>'link_oficial'
        and o.situacao in ('em_moderacao', 'publicada')
      limit 1;

      if v_existente is not null then
        -- A fonte mudou um item que já existe: atualiza no lugar, sem duplicar.
        update oportunidades.oportunidades
        set titulo = c->>'titulo',
            tipo = (c->>'tipo')::oportunidades.tipo_item,
            prazo = v_prazo,
            natureza_prazo = (c->>'natureza_prazo')::oportunidades.natureza_prazo,
            abrangencia = (c->>'abrangencia')::oportunidades.abrangencia,
            ufs = v_ufs,
            publico = (c->>'publico')::oportunidades.publico,
            descricao = c->>'descricao',
            valor = c->>'valor',
            publico_especifico = c->>'publico_especifico',
            item_bruto_id = item.id
        where id = v_existente
        returning situacao into v_situacao;
      else
        insert into oportunidades.oportunidades (
          fonte_id, item_bruto_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs,
          publico, descricao, valor, publico_especifico, situacao, publicada_em
        ) values (
          item.fonte_id, item.id, c->>'titulo', (c->>'tipo')::oportunidades.tipo_item, c->>'link_oficial',
          v_prazo, (c->>'natureza_prazo')::oportunidades.natureza_prazo,
          (c->>'abrangencia')::oportunidades.abrangencia, v_ufs, (c->>'publico')::oportunidades.publico,
          c->>'descricao', c->>'valor', c->>'publico_especifico',
          v_situacao, case when v_situacao = 'publicada' then now() end
        );
      end if;

      update oportunidades.itens_brutos
      set situacao = 'processado', motivo = null, processado_em = now()
      where id = item.id;

      if v_situacao = 'publicada' then
        publicados := publicados + 1;
      else
        em_moderacao := em_moderacao + 1;
      end if;
    exception when others then
      get stacked diagnostics v_restricao = constraint_name, v_motivo = message_text;
      v_motivo := case v_restricao
        when 'oportunidades_ufs_conforme_abrangencia' then 'Região: os estados não batem com a abrangência, ou há sigla de estado inválida'
        when 'oportunidades_sem_noticia' then 'Notícia não entra como oportunidade'
        when 'oportunidades_titulo_check' then 'O título precisa ter de 3 a 200 caracteres'
        when 'oportunidades_link_oficial_check' then 'O link oficial precisa começar com http:// ou https://'
        else v_motivo
      end;
      update oportunidades.itens_brutos
      set situacao = 'rejeitado', motivo = left(v_motivo, 2000), processado_em = now()
      where id = item.id;
      rejeitados := rejeitados + 1;
    end;
  end loop;

  return next;
end;
$$;

-- As funções da fila só rodam com a chave de serviço, usada pelo agendador e pelos leitores.
revoke all on function oportunidades.reservar_proxima_fonte() from public, anon, authenticated;
revoke all on function oportunidades.avaliar_confianca(uuid) from public, anon, authenticated;
revoke all on function oportunidades.registrar_fim_leitura(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function oportunidades.processar_pendentes(integer) from public, anon, authenticated;
grant execute on function oportunidades.reservar_proxima_fonte() to service_role;
grant execute on function oportunidades.avaliar_confianca(uuid) to service_role;
grant execute on function oportunidades.registrar_fim_leitura(uuid, text, integer, integer) to service_role;
grant execute on function oportunidades.processar_pendentes(integer) to service_role;
