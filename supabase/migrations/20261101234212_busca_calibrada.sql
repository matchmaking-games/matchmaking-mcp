-- Busca calibrada: entende frases inteiras, ordena por relevância, corrige erros de digitação e
-- avisa quando um termo é amplo demais. Medida com o catálogo e as perguntas de
-- supabase/tests/32_calibragem_da_busca.sql.
--
-- Como a frase é lida:
--   1. sem acentos e em minúsculas, palavra por palavra;
--   2. palavra desconhecida (4 letras ou mais, que não está no vocabulário nem em nenhuma oportunidade
--      aberta) é trocada pela palavra conhecida mais próxima, a uma letra de distância (duas, em
--      palavras de 8 letras ou mais). Palavras curtas como "ui" e "ux" nunca são trocadas;
--   3. o trecho mais longo que for um termo conhecido vence: "designer de som" é uma função, "são paulo"
--      é um estado, "game jam" é um tipo, "vaga" é um tipo, "de" e "quero" são ignorados;
--   4. cada termo que sobra vira um conceito, com seus equivalentes (sinônimos do vocabulário único e
--      termos gerais como estágio/intern);
--   5. vale a oportunidade que tem todos os conceitos; se nenhuma tem, valem as que têm parte deles, e a
--      resposta avisa. Termo no título vale 3, na descrição vale 1. Com termo de função ("programador"),
--      vagas vêm antes de eventos e cursos; o prazo só desempata.

-- Termos da busca que não são habilidades nem funções: palavras ignoradas, tipos, estados,
-- abrangência e grupos de equivalentes em português e inglês. Cada termo tem um só papel.
create table oportunidades.termos_de_busca (
  termo text primary key check (termo ~ '^[a-z0-9]+( [a-z0-9]+)*$' and char_length(termo) <= 60),
  grupo text check (grupo ~ '^[a-z_]+$'),
  tipo oportunidades.tipo_item,
  uf text check (uf ~ '^[A-Z]{2}$'),
  abrangencia oportunidades.abrangencia,
  ignorar boolean not null default false,
  constraint termos_de_busca_um_papel check (num_nonnulls(grupo, tipo, uf, abrangencia) + ignorar::integer = 1)
);

comment on table oportunidades.termos_de_busca is
  'Termos que a busca entende além do vocabulário único: palavras ignoradas, tipos, estados, abrangência e equivalentes.';

alter table oportunidades.termos_de_busca enable row level security;
revoke all on table oportunidades.termos_de_busca from anon, authenticated;
grant select, insert, update, delete on table oportunidades.termos_de_busca to service_role;

insert into oportunidades.termos_de_busca (termo, ignorar)
select unnest(array[
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'pro', 'por', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'as', 'os', 'ou', 'que', 'qual', 'quais', 'eu', 'me', 'mim', 'meu', 'minha',
  'quero', 'queria', 'gostaria', 'procuro', 'procurando', 'busco', 'buscando', 'preciso', 'tem', 'ha', 'existe',
  'algum', 'alguma', 'alguns', 'algumas', 'mostre', 'mostra', 'liste', 'lista', 'encontre', 'ache', 'todas', 'todos',
  'oportunidade', 'oportunidades', 'aberta', 'abertas', 'aberto', 'abertos', 'nova', 'novas', 'novo', 'novos',
  'area', 'of', 'for', 'in', 'the', 'and', 'an', 'at', 'with'
]), true;

insert into oportunidades.termos_de_busca (termo, tipo)
select v.termo, v.tipo::oportunidades.tipo_item
from (values
  ('vaga', 'vaga'), ('vagas', 'vaga'), ('emprego', 'vaga'), ('empregos', 'vaga'), ('job', 'vaga'), ('jobs', 'vaga'), ('trabalho', 'vaga'),
  ('edital', 'edital_fomento'), ('editais', 'edital_fomento'), ('fomento', 'edital_fomento'),
  ('chamada publica', 'edital_fomento'), ('chamadas publicas', 'edital_fomento'),
  ('game jam', 'game_jam'), ('game jams', 'game_jam'), ('gamejam', 'game_jam'), ('jam', 'game_jam'), ('jams', 'game_jam'),
  ('hackathon', 'game_jam'), ('hackathons', 'game_jam'),
  ('evento', 'evento'), ('eventos', 'evento'), ('feira', 'evento'), ('feiras', 'evento'), ('meetup', 'evento'),
  ('meetups', 'evento'), ('conferencia', 'evento'), ('conferencias', 'evento'), ('encontro', 'evento'), ('encontros', 'evento'),
  ('festival', 'chamada_festival_vitrine'), ('festivais', 'chamada_festival_vitrine'), ('showcase', 'chamada_festival_vitrine'),
  ('showcases', 'chamada_festival_vitrine'), ('vitrine', 'chamada_festival_vitrine'), ('vitrines', 'chamada_festival_vitrine'),
  ('mostras', 'chamada_festival_vitrine'),
  ('curso', 'curso_capacitacao'), ('cursos', 'curso_capacitacao'), ('capacitacao', 'curso_capacitacao'),
  ('capacitacoes', 'curso_capacitacao'), ('oficina', 'curso_capacitacao'), ('oficinas', 'curso_capacitacao'),
  ('workshop', 'curso_capacitacao'), ('workshops', 'curso_capacitacao'), ('treinamento', 'curso_capacitacao'),
  ('treinamentos', 'curso_capacitacao'),
  ('mentoria', 'mentoria'), ('mentorias', 'mentoria'), ('mentor', 'mentoria'), ('mentores', 'mentoria'),
  ('mentoring', 'mentoria'), ('mentorship', 'mentoria'),
  ('aceleracao', 'aceleracao_incubacao'), ('aceleradora', 'aceleracao_incubacao'), ('aceleradoras', 'aceleracao_incubacao'),
  ('incubadora', 'aceleracao_incubacao'), ('incubadoras', 'aceleracao_incubacao'), ('incubacao', 'aceleracao_incubacao'),
  ('publisher', 'chamada_publisher'), ('publishers', 'chamada_publisher'), ('publicadora', 'chamada_publisher'),
  ('publicadoras', 'chamada_publisher'),
  ('terceirizacao', 'terceirizacao_codesenvolvimento'), ('outsourcing', 'terceirizacao_codesenvolvimento'),
  ('codesenvolvimento', 'terceirizacao_codesenvolvimento'), ('co desenvolvimento', 'terceirizacao_codesenvolvimento')
) as v (termo, tipo);

insert into oportunidades.termos_de_busca (termo, abrangencia)
select v.termo, v.abrangencia::oportunidades.abrangencia
from (values
  ('remoto', 'remoto'), ('remota', 'remoto'), ('remotos', 'remoto'), ('remotas', 'remoto'), ('remote', 'remoto'),
  ('home office', 'remoto'), ('trabalho remoto', 'remoto'),
  ('internacional', 'internacional'), ('internacionais', 'internacional'), ('exterior', 'internacional'),
  ('nacional', 'nacional'), ('nacionais', 'nacional')
) as v (termo, abrangencia);

-- Estados, capitais e siglas. Ficam de fora as siglas e nomes que são palavras comuns
-- ("to", "se", "es", "para", "natal", "palmas", "vitoria").
insert into oportunidades.termos_de_busca (termo, uf)
select v.termo, v.uf
from (values
  ('acre', 'AC'), ('rio branco', 'AC'), ('ac', 'AC'),
  ('alagoas', 'AL'), ('maceio', 'AL'), ('al', 'AL'),
  ('amapa', 'AP'), ('macapa', 'AP'), ('ap', 'AP'),
  ('amazonas', 'AM'), ('manaus', 'AM'), ('am', 'AM'),
  ('bahia', 'BA'), ('salvador', 'BA'), ('ba', 'BA'),
  ('ceara', 'CE'), ('fortaleza', 'CE'), ('ce', 'CE'),
  ('distrito federal', 'DF'), ('brasilia', 'DF'), ('df', 'DF'),
  ('espirito santo', 'ES'),
  ('goias', 'GO'), ('goiania', 'GO'), ('go', 'GO'),
  ('maranhao', 'MA'), ('sao luis', 'MA'), ('ma', 'MA'),
  ('mato grosso', 'MT'), ('cuiaba', 'MT'), ('mt', 'MT'),
  ('mato grosso do sul', 'MS'), ('campo grande', 'MS'), ('ms', 'MS'),
  ('minas gerais', 'MG'), ('minas', 'MG'), ('belo horizonte', 'MG'), ('mg', 'MG'),
  ('belem', 'PA'), ('pa', 'PA'),
  ('paraiba', 'PB'), ('joao pessoa', 'PB'), ('pb', 'PB'),
  ('parana', 'PR'), ('curitiba', 'PR'), ('pr', 'PR'),
  ('pernambuco', 'PE'), ('recife', 'PE'), ('pe', 'PE'),
  ('piaui', 'PI'), ('teresina', 'PI'), ('pi', 'PI'),
  ('rio de janeiro', 'RJ'), ('rj', 'RJ'),
  ('rio grande do norte', 'RN'), ('rn', 'RN'),
  ('rio grande do sul', 'RS'), ('porto alegre', 'RS'), ('rs', 'RS'),
  ('rondonia', 'RO'), ('porto velho', 'RO'), ('ro', 'RO'),
  ('roraima', 'RR'), ('rr', 'RR'),
  ('santa catarina', 'SC'), ('florianopolis', 'SC'), ('floripa', 'SC'), ('sc', 'SC'),
  ('sao paulo', 'SP'), ('campinas', 'SP'), ('sp', 'SP'),
  ('sergipe', 'SE'), ('aracaju', 'SE'),
  ('tocantins', 'TO')
) as v (termo, uf);

-- Equivalentes em português e inglês para palavras que não são habilidades nem funções.
insert into oportunidades.termos_de_busca (termo, grupo)
select unnest(v.termos), v.grupo
from (values
  ('estagio', array['estagio', 'estagios', 'estagiario', 'estagiaria', 'estagiarios', 'intern', 'interns', 'internship', 'internships']),
  ('junior', array['junior', 'jr']),
  ('pleno', array['pleno', 'plena', 'mid']),
  ('senior', array['senior', 'sr']),
  ('gerente', array['gerente', 'gerentes', 'manager', 'managers', 'gestor', 'gestora']),
  ('analista', array['analista', 'analistas', 'analyst', 'analysts']),
  ('engenheiro', array['engenheiro', 'engenheira', 'engenheiros', 'engineer', 'engineers']),
  ('desenvolvedor', array['desenvolvedor', 'desenvolvedora', 'desenvolvedores', 'developer', 'developers',
    'programador', 'programadora', 'programadores', 'programmer', 'programmers', 'dev', 'devs']),
  ('artista', array['artista', 'artistas', 'artist', 'artists']),
  ('produtor', array['produtor', 'produtora', 'produtores', 'producer', 'producers']),
  ('diretor', array['diretor', 'diretora', 'director']),
  ('lider', array['lider', 'lideranca', 'lead']),
  ('dados', array['dados', 'data']),
  ('cientista', array['cientista', 'scientist']),
  ('suporte', array['suporte', 'support']),
  ('financas', array['financas', 'financeiro', 'finance', 'financial']),
  ('contabilidade', array['contabilidade', 'contador', 'contadora', 'accounting', 'accountant']),
  ('compras', array['compras', 'procurement']),
  ('pessoas', array['pessoas', 'people', 'hrbp']),
  ('som', array['som', 'sons', 'audio', 'sound', 'sonoro', 'sonora']),
  ('musica', array['musica', 'musicas', 'music', 'trilha', 'soundtrack']),
  ('jogo', array['jogo', 'jogos', 'game', 'games', 'videogame', 'videogames']),
  ('estudio', array['estudio', 'estudios', 'studio', 'studios']),
  ('arte', array['arte', 'artes', 'art']),
  ('testador', array['testador', 'testadora', 'testadores', 'tester', 'testers', 'qa']),
  ('roteirista', array['roteirista', 'escritor', 'escritora', 'writer', 'writers']),
  ('animador', array['animador', 'animadora', 'animator', 'animacao', 'animation']),
  ('ilustrador', array['ilustrador', 'ilustradora', 'illustrator', 'ilustracao', 'illustration']),
  ('comunidade', array['comunidade', 'community']),
  ('produto', array['produto', 'product']),
  ('negocios', array['negocios', 'business']),
  ('pesquisa', array['pesquisa', 'pesquisador', 'pesquisadora', 'research', 'researcher']),
  ('celular', array['celular', 'mobile']),
  ('terror', array['terror', 'horror']),
  ('cenario', array['cenario', 'cenarios', 'ambiente', 'ambientes', 'environment', 'environments']),
  ('personagem', array['personagem', 'personagens', 'character', 'characters']),
  ('nivel', array['nivel', 'niveis', 'fase', 'fases', 'level', 'levels']),
  ('narrativa', array['narrativa', 'narrative']),
  ('modelagem', array['modelagem', 'modelador', 'modeladora', 'modeling', 'modelling', 'modeler']),
  ('iniciante', array['iniciante', 'iniciantes', 'beginner', 'beginners']),
  ('gratuito', array['gratuito', 'gratuita', 'gratuitos', 'gratuitas', 'gratis', 'free']),
  ('independente', array['independente', 'independentes', 'indie', 'indies'])
) as v (grupo, termos);

-- "Audio Design" é como muitas vagas em inglês chamam o design de som.
insert into oportunidades.sinonimos (termo, idioma, habilidade_id)
select v.termo, v.idioma, h.id
from (values ('audio design', 'en'), ('design de áudio', 'pt')) as v (termo, idioma)
join public.habilidades h on h.nome = 'Sound Design'
on conflict do nothing;

-- Texto pronto para comparar: sem acentos, em minúsculas e só letras e números separados por espaço.
create function oportunidades.texto_de_busca(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(oportunidades.normalizar_termo(coalesce(p_texto, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

revoke all on function oportunidades.texto_de_busca(text) from public, anon, authenticated;
grant execute on function oportunidades.texto_de_busca(text) to service_role;

-- Quantas letras é preciso trocar, tirar, pôr ou inverter de lugar para ir de uma palavra à outra.
-- Inverter duas letras vizinhas conta como uma ("desinger" está a 1 de "designer").
create function oportunidades.distancia_de_edicao(p_a text, p_b text)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  n integer := char_length(p_a);
  m integer := char_length(p_b);
  d integer[];
  custo integer;
begin
  if n = 0 then return m; end if;
  if m = 0 then return n; end if;
  d := array_fill(0, array[n + 1, m + 1], array[0, 0]);
  for i in 0..n loop d[i][0] := i; end loop;
  for j in 0..m loop d[0][j] := j; end loop;
  for i in 1..n loop
    for j in 1..m loop
      custo := case when substr(p_a, i, 1) = substr(p_b, j, 1) then 0 else 1 end;
      d[i][j] := least(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if i > 1 and j > 1 and substr(p_a, i, 1) = substr(p_b, j - 1, 1) and substr(p_a, i - 1, 1) = substr(p_b, j, 1) then
        d[i][j] := least(d[i][j], d[i - 2][j - 2] + 1);
      end if;
    end loop;
  end loop;
  return d[n][m];
end;
$$;

revoke all on function oportunidades.distancia_de_edicao(text, text) from public, anon, authenticated;
grant execute on function oportunidades.distancia_de_edicao(text, text) to service_role;

-- A busca completa: devolve os resultados e o que ela entendeu da frase, para o assistente explicar
-- correções, pedir detalhe em termo amplo e avisar quando os resultados são parciais.
create function vitrine.pesquisar_oportunidades(
  p_tipo oportunidades.tipo_item default null,
  p_uf text default null,
  p_texto text default null,
  p_limite integer default 5
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
      o.publico, o.descricao, o.valor, o.publico_especifico, f.nome as fonte,
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
      'descricao', e.descricao, 'valor', e.valor, 'publico_especifico', e.publico_especifico, 'fonte', e.fonte
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

revoke all on function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer) from public, anon;
grant execute on function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer) to authenticated, service_role;

comment on function vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer) is
  'Busca de oportunidades publicadas e abertas: entende frases, ordena por relevância, corrige erros de digitação e devolve o que entendeu. No máximo 20 resultados.';

-- A busca antiga passa a usar a nova e devolve só os resultados, na mesma ordem.
create or replace function vitrine.buscar_oportunidades(
  p_tipo oportunidades.tipo_item default null,
  p_uf text default null,
  p_texto text default null,
  p_limite integer default 5
)
returns table (
  id uuid,
  titulo text,
  tipo oportunidades.tipo_item,
  link_oficial text,
  prazo date,
  natureza_prazo oportunidades.natureza_prazo,
  abrangencia oportunidades.abrangencia,
  ufs text[],
  publico oportunidades.publico,
  descricao text,
  valor text,
  publico_especifico text,
  fonte text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select r.id, r.titulo, r.tipo, r.link_oficial, r.prazo, r.natureza_prazo, r.abrangencia, r.ufs,
    r.publico, r.descricao, r.valor, r.publico_especifico, r.fonte
  from jsonb_array_elements(vitrine.pesquisar_oportunidades(p_tipo, p_uf, p_texto, p_limite) -> 'resultados')
    with ordinality as e (item, ordem)
  cross join lateral jsonb_to_record(e.item) as r (
    id uuid, titulo text, tipo oportunidades.tipo_item, link_oficial text, prazo date,
    natureza_prazo oportunidades.natureza_prazo, abrangencia oportunidades.abrangencia, ufs text[],
    publico oportunidades.publico, descricao text, valor text, publico_especifico text, fonte text
  )
  order by e.ordem
$$;
