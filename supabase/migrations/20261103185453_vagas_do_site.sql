-- Vagas e colaborações do site no índice. Uma rotina do próprio banco lê, a cada 30 minutos, só o que
-- está público no site e passa pelo mesmo portão das outras fontes. Não altera nenhuma tabela do site.
--   - Nunca copia contato: o e-mail da candidatura fica no site, e quem se interessa vai pelo link.
--   - "Formar time" fica de fora por decisão do Lucas: não cabe na lista fechada de tipos.
--   - A fonte é a lista inteira: o que sai do site sai do índice na leitura seguinte.
-- Vaga em destaque (paga no site) leva um selo e só desempata: nunca passa de um resultado mais relevante.
--
-- A fonte é cadastrada por ambiente, com { "site": "<endereço do site>" } e leitor "site". A rotina deixa
-- `proxima_leitura_em` em "infinity" para a função `coletar`, que não sabe ler o site, nunca pegar essa fonte.

alter table oportunidades.oportunidades
  add column destaque boolean not null default false;

comment on column oportunidades.oportunidades.destaque is 'Vaga paga em destaque no site: mostra o selo e desempata na busca, sem furar a relevância.';

create function oportunidades.ler_site()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_fonte record;
  v_site text;
  v_leitura uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_links text[] := '{}';
  v_destaques text[] := '{}';
  v_lidos integer := 0;
  v_novos integer := 0;
  v_inseridos integer;
  v_encerradas integer;
  v_reabertas integer;
  r record;
  v_ufs jsonb;
  v_abrangencia text;
  v_conteudo jsonb;
  v_candidato jsonb;
  v_descricao text;
begin
  select f.id, f.configuracao into v_fonte
  from oportunidades.fontes f
  where f.leitor = 'site' and f.situacao = 'ativa'
  limit 1;
  if not found then
    return jsonb_build_object('lidos', 0, 'motivo', 'Sem fonte do site ativa');
  end if;

  v_site := rtrim(v_fonte.configuracao ->> 'site', '/');
  update oportunidades.fontes set proxima_leitura_em = 'infinity' where id = v_fonte.id;
  insert into oportunidades.leituras (fonte_id) values (v_fonte.id) returning id into v_leitura;

  begin
    if v_site !~ '^https?://[^/ ]+$' then
      raise exception 'Configuração da fonte sem "site" válido';
    end if;

    for r in
      -- Mais rigoroso que a regra de leitura do site: rascunho nunca entra, mesmo com "ativa" ligada.
      select
        'vaga:' || v.id::text as id_externo,
        v_site || '/jobs/' || v.slug as link,
        v.titulo,
        'vaga' as tipo,
        (v.expira_em at time zone 'America/Sao_Paulo')::date as prazo,
        v.remoto::text as modalidade,
        v.estado,
        'pessoa' as publico,
        v.descricao,
        coalesce(e.nome, o.nome) as autor,
        case when v.mostrar_salario and v.salario_min is not null and v.salario_max is not null
               then 'R$ ' || v.salario_min || ' a R$ ' || v.salario_max
             when v.mostrar_salario and v.salario_min is not null then 'A partir de R$ ' || v.salario_min
             when v.mostrar_salario and v.salario_max is not null then 'Até R$ ' || v.salario_max
        end as valor,
        v.tipo_publicacao::text = 'destaque' as destaque
      from public.vagas v
      left join public.estudios e on e.id = v.estudio_id
      left join public.organizacoes o on o.id = v.organizacao_id
      where v.ativa and v.status = 'publicada' and v.expira_em > now() and v.slug is not null
      union all
      select
        'colaboracao:' || p.id::text,
        v_site || '/collaborations/' || p.slug,
        p.titulo::text,
        case p.tipo::text
          when 'game_jam' then 'game_jam'
          when 'mentoria' then 'mentoria'
          when 'edital' then 'edital_fomento'
          when 'programa_aceleracao' then 'aceleracao_incubacao'
          when 'evento' then 'evento'
          when 'playtest' then 'evento'
          when 'freelance_pontual' then 'terceirizacao_codesenvolvimento'
        end,
        p.expira_em,
        p.remoto::text,
        p.estado::text,
        'ambos',
        p.descricao,
        coalesce(e.nome, o.nome),
        null::text,
        false
      from public.parcerias p
      left join public.estudios e on e.id = p.estudio_id
      left join public.organizacoes o on o.id = p.organizacao_id
      where p.status = 'ativa' and p.expira_em >= v_hoje and p.slug is not null and p.tipo::text <> 'formar_time'
    loop
      v_lidos := v_lidos + 1;
      v_links := v_links || r.link;
      if r.destaque then v_destaques := v_destaques || r.link; end if;

      if r.modalidade = 'remoto' then
        v_abrangencia := 'remoto'; v_ufs := null;
      elsif upper(coalesce(r.estado, '')) ~ '^[A-Z]{2}$' then
        v_abrangencia := 'estado'; v_ufs := jsonb_build_array(upper(r.estado));
      else
        v_abrangencia := 'nacional'; v_ufs := null;
      end if;

      -- A descrição do site pode ter marcação. O índice guarda um trecho, com quem publicou.
      v_descricao := btrim(regexp_replace(regexp_replace(coalesce(r.descricao, ''), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'));
      v_descricao := nullif(left(btrim(coalesce('Publicada por ' || r.autor || '. ', '') || v_descricao), 500), '');

      v_conteudo := jsonb_build_object(
        'id_externo', r.id_externo, 'titulo', r.titulo, 'tipo', r.tipo, 'prazo', r.prazo,
        'modalidade', r.modalidade, 'estado', r.estado, 'publico', r.publico, 'descricao', v_descricao,
        'valor', r.valor, 'destaque', r.destaque, 'link', r.link
      );
      v_candidato := jsonb_strip_nulls(jsonb_build_object(
        'titulo', left(btrim(r.titulo), 200), 'tipo', r.tipo, 'link_oficial', r.link, 'prazo', r.prazo,
        'natureza_prazo', 'encerramento_inscricoes', 'abrangencia', v_abrangencia, 'ufs', v_ufs,
        'publico', r.publico, 'descricao', v_descricao, 'valor', left(r.valor, 200)
      ));

      insert into oportunidades.itens_brutos (fonte_id, id_externo, conteudo, hash_conteudo, candidato, situacao)
      values (v_fonte.id, r.id_externo, v_conteudo, encode(sha256(convert_to(v_conteudo::text, 'UTF8')), 'hex'), v_candidato, 'pendente')
      on conflict (fonte_id, hash_conteudo) do nothing;
      get diagnostics v_inseridos = row_count;
      v_novos := v_novos + v_inseridos;
    end loop;

    v_encerradas := oportunidades.encerrar_ausentes(v_fonte.id, v_links);
    v_reabertas := oportunidades.reabrir_voltaram(v_fonte.id, v_links);
    perform oportunidades.processar_pendentes(500);

    update oportunidades.oportunidades o
    set destaque = o.link_oficial = any (v_destaques)
    where o.fonte_id = v_fonte.id
      and o.situacao in ('publicada', 'em_moderacao')
      and o.destaque is distinct from (o.link_oficial = any (v_destaques));

    perform oportunidades.registrar_fim_leitura(v_leitura, null, v_lidos, v_novos);
    return jsonb_build_object('lidos', v_lidos, 'novos', v_novos, 'encerradas', v_encerradas, 'reabertas', v_reabertas);
  exception when others then
    perform oportunidades.registrar_fim_leitura(v_leitura, sqlerrm);
    return jsonb_build_object('erro', sqlerrm);
  end;
end;
$$;

revoke all on function oportunidades.ler_site() from public, anon, authenticated;
grant execute on function oportunidades.ler_site() to service_role;

comment on function oportunidades.ler_site() is 'Lê as vagas e colaborações públicas do site para o índice. Só o agendador (cron) usa.';

select cron.schedule('oportunidades-ler-site', '*/30 * * * *', 'select oportunidades.ler_site()');

-- O vigia passa a acusar também a leitura do site parada: como ela não usa a fila, não aparece como atrasada.
create or replace function oportunidades.problemas_do_sistema()
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
      select 2, f.nome, 'A fonte "' || f.nome || '" não é lida há mais de 2 horas. A leitura do site pode ter parado.'
      from oportunidades.fontes f
      where f.situacao = 'ativa' and f.leitor = 'site' and coalesce(f.ultima_leitura_em, f.criado_em) < now() - interval '2 hours'
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

-- O detalhe também mostra o selo.
create or replace function vitrine.ver_oportunidade(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(v)
  from (
    select o.id, o.titulo, o.tipo, o.link_oficial, o.prazo, o.natureza_prazo, o.abrangencia, o.ufs, o.publico,
           o.descricao, o.niveis, o.valor, o.publico_especifico, f.nome as fonte, o.conferida_em, o.destaque
    from oportunidades.oportunidades o
    join oportunidades.fontes f on f.id = o.fonte_id
    where o.id = p_id
      and o.situacao = 'publicada'
      and o.prazo >= (now() at time zone 'America/Sao_Paulo')::date
  ) v
$$;

-- A busca devolve o selo e usa o destaque só como desempate, quando há o que comparar: mesma quantidade de
-- termos, mesmos pontos. Sem termo de busca não há relevância para empatar, então o destaque não muda a ordem.
create or replace function vitrine.pesquisar_oportunidades(
  p_tipo oportunidades.tipo_item default null,
  p_uf text default null,
  p_texto text default null,
  p_limite integer default 5,
  p_publico oportunidades.publico default null,
  p_prazo_em_dias integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_texto text := nullif(oportunidades.texto_de_busca(p_texto), '');
  v_limite integer := least(greatest(coalesce(p_limite, 5), 1), 20);
  v_tokens text[];
  v_dicionario text[];
  v_tipo oportunidades.tipo_item;
  v_uf text;
  v_abrangencia oportunidades.abrangencia;
  v_correcoes jsonb := '[]';
  v_conceitos jsonb := '[]';
  v_ambiguos jsonb := '[]';
  v_amplos jsonb := '[]';
  v_amplo jsonb;
  v_papel boolean := false;
  v_resultados jsonb;
  v_melhor integer;
  v_n integer;
  v_modo text;
  i integer;
  v_tamanho integer;
  v_trecho text;
  v_termo record;
  v_alvos uuid[];
  v_alternativas text[];
  v_palavra text;
  v_troca text;
  v_maximo integer;
  v_opcoes text[];
begin
  if v_texto is not null then
    v_tokens := string_to_array(v_texto, ' ');

    -- Erros de digitação: palavras desconhecidas viram a palavra conhecida mais próxima.
    for i in 1..cardinality(v_tokens) loop
      v_palavra := v_tokens[i];
      continue when char_length(v_palavra) < 4 or v_palavra !~ '^[a-z]+$';
      if v_dicionario is null then
        select array_agg(distinct p) into v_dicionario
        from (
          select unnest(string_to_array(oportunidades.texto_de_busca(s.termo), ' ')) as p from oportunidades.sinonimos s
          union all select unnest(string_to_array(oportunidades.texto_de_busca(h.nome), ' ')) from public.habilidades h
          union all select unnest(string_to_array(oportunidades.texto_de_busca(t.nome), ' ')) from public.tipos_funcao t
          union all select unnest(string_to_array(b.termo, ' ')) from oportunidades.termos_de_busca b
          union all select unnest(string_to_array(oportunidades.texto_de_busca(o.titulo), ' '))
          from oportunidades.oportunidades o where o.situacao = 'publicada' and o.prazo >= v_hoje
        ) palavras
        where p ~ '^[a-z]{3,}$';
      end if;
      continue when v_palavra = any (v_dicionario);
      continue when exists (
        select 1 from oportunidades.oportunidades o
        where o.situacao = 'publicada' and o.prazo >= v_hoje
          and oportunidades.texto_de_busca(o.titulo || ' ' || coalesce(o.descricao, '')) ~ ('(^| )' || v_palavra || '( |$)')
      );
      v_maximo := case when char_length(v_palavra) >= 8 then 2 else 1 end;
      select w into v_troca
      from unnest(v_dicionario) as w
      where abs(char_length(w) - char_length(v_palavra)) <= v_maximo
        and oportunidades.distancia_de_edicao(v_palavra, w) <= v_maximo
      order by oportunidades.distancia_de_edicao(v_palavra, w), abs(char_length(w) - char_length(v_palavra)), w
      limit 1;
      if v_troca is not null then
        v_correcoes := v_correcoes || jsonb_build_object('de', v_palavra, 'para', v_troca);
        v_tokens[i] := v_troca;
      end if;
    end loop;

    -- Leitura da frase: o trecho mais longo que for um termo conhecido vence.
    i := 1;
    while i <= cardinality(v_tokens) loop
      v_tamanho := least(6, cardinality(v_tokens) - i + 1);
      loop
        v_trecho := array_to_string(v_tokens[i:i + v_tamanho - 1], ' ');
        select * into v_termo from oportunidades.termos_de_busca b where b.termo = v_trecho;
        select array_agg(distinct alvo) into v_alvos
        from (
          select coalesce(s.habilidade_id, s.tipo_funcao_id) as alvo from oportunidades.sinonimos s
          where oportunidades.texto_de_busca(s.termo) = v_trecho
          union all select h.id from public.habilidades h where oportunidades.texto_de_busca(h.nome) = v_trecho
          union all select t.id from public.tipos_funcao t where oportunidades.texto_de_busca(t.nome) = v_trecho
        ) alvos;
        exit when v_termo.termo is not null or v_alvos is not null or v_tamanho = 1;
        v_tamanho := v_tamanho - 1;
      end loop;

      if v_termo.termo is not null and v_termo.ignorar then
        null;
      elsif v_termo.tipo is not null then
        v_tipo := coalesce(v_tipo, v_termo.tipo);
      elsif v_termo.uf is not null then
        v_uf := coalesce(v_uf, v_termo.uf);
      elsif v_termo.abrangencia is not null then
        v_abrangencia := coalesce(v_abrangencia, v_termo.abrangencia);
      elsif v_termo.grupo is not null or v_alvos is not null or char_length(v_trecho) >= 2 then
        -- Equivalentes: o próprio termo, o grupo dele e os nomes e sinônimos das habilidades e funções.
        select array_agg(distinct a) into v_alternativas
        from (
          select v_trecho as a
          union all select b.termo from oportunidades.termos_de_busca b where b.grupo = v_termo.grupo
          union all select oportunidades.texto_de_busca(h.nome) from public.habilidades h where h.id = any (v_alvos)
          union all select oportunidades.texto_de_busca(t.nome) from public.tipos_funcao t where t.id = any (v_alvos)
          union all select oportunidades.texto_de_busca(s.termo) from oportunidades.sinonimos s
          where coalesce(s.habilidade_id, s.tipo_funcao_id) = any (v_alvos)
        ) equivalentes
        where a <> '';
        v_conceitos := v_conceitos || jsonb_build_object('termo', v_trecho, 'alternativas', to_jsonb(v_alternativas));

        -- Termo de função ("programador") faz as vagas virem antes; termo que não é função pode ser amplo.
        if exists (select 1 from public.tipos_funcao t where t.id = any (coalesce(v_alvos, '{}'))) then
          v_papel := true;
        else
          v_amplos := v_amplos || jsonb_build_object('termo', v_trecho, 'alternativas', to_jsonb(v_alternativas));
        end if;
      end if;

      i := i + v_tamanho;
    end loop;
  end if;

  -- Termo amplo: aparece em 3 funções ou mais. Só interessa quando a busca é por vagas ou não tem tipo.
  if coalesce(p_tipo, v_tipo) is null or coalesce(p_tipo, v_tipo) = 'vaga' then
    for v_amplo in select value from jsonb_array_elements(v_amplos) loop
      select array_agg(nome order by nome) into v_opcoes
      from (
        select distinct t.nome from public.tipos_funcao t
        left join oportunidades.sinonimos s on s.tipo_funcao_id = t.id
        where exists (
          select 1 from jsonb_array_elements_text(v_amplo -> 'alternativas') a
          where a !~ ' '
            and (oportunidades.texto_de_busca(t.nome) ~ ('(^| )' || a || '( |$)')
              or oportunidades.texto_de_busca(s.termo) ~ ('(^| )' || a || '( |$)'))
        )
      ) funcoes;
      if cardinality(v_opcoes) >= 3 then
        v_ambiguos := v_ambiguos || jsonb_build_object('termo', v_amplo -> 'termo', 'opcoes', to_jsonb(v_opcoes[1:8]));
      end if;
    end loop;
  end if;

  v_n := jsonb_array_length(v_conceitos);
  v_tipo := coalesce(p_tipo, v_tipo);
  v_uf := coalesce(case when p_uf ~* '^[a-z]{2}$' then upper(p_uf) end, v_uf);

  with candidatas as (
    select
      o.id, o.titulo, o.tipo, o.link_oficial, o.prazo, o.natureza_prazo, o.abrangencia, o.ufs,
      o.publico, o.descricao, o.valor, o.publico_especifico, o.conferida_em, o.destaque, f.nome as fonte,
      oportunidades.texto_de_busca(o.titulo) as t_titulo,
      oportunidades.texto_de_busca(coalesce(o.descricao, '')) as t_descricao
    from oportunidades.oportunidades o
    join oportunidades.fontes f on f.id = o.fonte_id
    where o.situacao = 'publicada'
      and o.prazo >= v_hoje
      and (v_tipo is null or o.tipo = v_tipo)
      -- Vaga remota e oportunidade nacional valem para todos os estados.
      and (v_uf is null or o.abrangencia in ('nacional', 'remoto') or v_uf = any (o.ufs))
      and (v_abrangencia is null or o.abrangencia = v_abrangencia)
      -- Quem pode participar: item aberto a ambos serve para pessoa e para empresa.
      and (p_publico is null or o.publico = p_publico or o.publico = 'ambos' or p_publico = 'ambos')
      -- Só conta quem tem data de verdade: as sem data têm no prazo apenas a próxima conferência.
      and (p_prazo_em_dias is null or (
        o.natureza_prazo in ('encerramento_inscricoes', 'data_do_evento') and o.prazo <= v_hoje + p_prazo_em_dias
      ))
  ),
  notas as (
    -- Por conceito: 3 se algum equivalente está no título, 1 se está só na descrição. Palavras inteiras,
    -- aceitando o fim com "s", "es", "er" ou "ers" ("design" encontra "designer"). Os termos só têm
    -- letras, números e espaços, então entram na expressão sem risco.
    select c.id, coalesce(sum(k.peso), 0) as pontos, count(*) filter (where k.peso > 0) as acertos
    from candidatas c
    left join lateral (
      select (
        select max(case
          when c.t_titulo ~ ('(^| )' || a || '(s|es|er|ers)?( |$)') then 3
          when c.t_descricao ~ ('(^| )' || a || '(s|es|er|ers)?( |$)') then 1
          else 0 end)
        from jsonb_array_elements_text(conceito -> 'alternativas') a
      ) as peso
      from jsonb_array_elements(v_conceitos) conceito
    ) k on true
    group by c.id
  ),
  classificadas as (
    select c.*, n.pontos, n.acertos, max(n.acertos) over () as melhor
    from candidatas c join notas n on n.id = c.id
  ),
  escolhidas as (
    select x.*, row_number() over (
      order by x.acertos desc, x.pontos desc, (v_papel and x.tipo = 'vaga') desc, (v_n > 0 and x.destaque) desc, x.prazo, x.id
    ) as ordem
    from classificadas x
    where v_n = 0 or x.acertos = v_n or (x.melhor < v_n and x.acertos >= 1)
    order by ordem
    limit v_limite
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'titulo', e.titulo, 'tipo', e.tipo, 'link_oficial', e.link_oficial, 'prazo', e.prazo,
      'natureza_prazo', e.natureza_prazo, 'abrangencia', e.abrangencia, 'ufs', e.ufs, 'publico', e.publico,
      'descricao', e.descricao, 'valor', e.valor, 'publico_especifico', e.publico_especifico, 'fonte', e.fonte,
      'conferida_em', e.conferida_em, 'destaque', e.destaque
    ) order by e.ordem), '[]'::jsonb),
    max(e.melhor)
  into v_resultados, v_melhor
  from escolhidas e;

  v_modo := case
    when v_n = 0 then 'sem_texto'
    when v_melhor = v_n then 'todos_os_termos'
    when v_melhor >= 1 then 'parcial'
    else 'nenhum' end;

  if jsonb_array_length(v_resultados) = 0 and v_texto is not null then
    insert into oportunidades.buscas_sem_resultado as b (dia, termo, tipo, uf)
    values (v_hoje, left(v_texto, 100), p_tipo, case when p_uf ~* '^[a-z]{2}$' then upper(p_uf) end)
    on conflict on constraint buscas_sem_resultado_unica do update set vezes = b.vezes + 1;
  end if;

  return jsonb_build_object(
    'interpretacao', jsonb_build_object(
      'termos', coalesce((select jsonb_agg(c -> 'termo') from jsonb_array_elements(v_conceitos) c), '[]'::jsonb),
      'correcoes', v_correcoes,
      'ambiguos', v_ambiguos,
      'tipo_do_texto', case when p_tipo is null then v_tipo end,
      'uf_do_texto', case when p_uf is null then v_uf end,
      'abrangencia_do_texto', v_abrangencia,
      'modo', v_modo
    ),
    'resultados', v_resultados
  );
end;
$$;
