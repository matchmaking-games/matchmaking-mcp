-- Busca com dois filtros novos, aplicados no banco antes do limite: quem pode participar e prazo.
-- A função antiga sai porque, com os novos argumentos opcionais, as duas ficariam ambíguas.
drop function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer);

create function vitrine.pesquisar_oportunidades(
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
      o.publico, o.descricao, o.valor, o.publico_especifico, o.conferida_em, f.nome as fonte,
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
      order by x.acertos desc, x.pontos desc, (v_papel and x.tipo = 'vaga') desc, x.prazo, x.id
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
      'conferida_em', e.conferida_em
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

comment on function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer, oportunidades.publico, integer) is
  'Busca única do MCP: entende frases, filtra no banco antes de limitar e devolve o que entendeu.';

revoke all on function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer, oportunidades.publico, integer) from public, anon;
grant execute on function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer, oportunidades.publico, integer) to authenticated, service_role;
