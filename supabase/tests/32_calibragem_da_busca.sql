-- Calibragem da busca: um catálogo fixo de oportunidades fictícias e variadas, e perguntas de
-- verdade com o gabarito do que deve aparecer. Mede em quantas perguntas o resultado certo vem
-- entre os 3 primeiros, como recomendam as referências de avaliação de busca.
-- O catálogo só existe dentro deste teste (tudo é desfeito no fim) e nunca vai para o banco do dev.
--
-- Uma pergunta acerta quando:
--   - o 1º resultado está no gabarito;
--   - com até 3 esperados, todos aparecem entre os 3 primeiros; com mais, os 3 primeiros são todos do gabarito;
--   - pergunta sem gabarito (negativa) não traz nada.
begin;
set local timezone = 'America/Sao_Paulo';

\ir dados/vocabulario.sql

insert into oportunidades.fontes (id, nome, leitor) values ('00000000-0000-4000-8000-0000000000c1', 'Catálogo de teste', 'teste');

create temp table catalogo (codigo text primary key, titulo text, tipo oportunidades.tipo_item, abrangencia oportunidades.abrangencia,
  ufs text[], descricao text, dias integer, publico oportunidades.publico default 'pessoa');

insert into catalogo (codigo, titulo, tipo, abrangencia, ufs, descricao, dias) values
  ('v-ui', 'UI Designer', 'vaga', 'estado', '{SP}', 'Buscamos designer para criar interfaces de jogos mobile.', 20),
  ('v-audio', 'Audio Design Intern', 'vaga', 'estado', '{SP}', 'Join our audio team to create sound effects and music. You will also work on UI sounds and ambience.', 5),
  ('v-level', 'Level Designer Pleno', 'vaga', 'remoto', null, 'Criação de fases para jogo de plataforma 2D.', 15),
  ('v-gamedes', 'Game Designer Sênior', 'vaga', 'estado', '{RJ}', 'Balanceamento e sistemas de economia.', 12),
  ('v-env', 'Environment Artist', 'vaga', 'remoto', null, 'Modelagem de cenários em Unreal Engine 5.', 18),
  ('v-char', 'Artista de Personagens 3D', 'vaga', 'estado', '{PR}', 'Modelagem e texturização de personagens no Blender e ZBrush.', 9),
  ('v-concept', 'Concept Artist Júnior', 'vaga', 'estado', '{SP}', 'Ilustração de criaturas e ambientes.', 25),
  ('v-2d', 'Artista 2D para jogo indie', 'vaga', 'remoto', null, 'Pixel art e animação de sprites.', 7),
  ('v-unity', 'Desenvolvedor Unity', 'vaga', 'estado', '{SP}', 'Programação de gameplay em C# para mobile.', 14),
  ('v-unreal', 'Unreal Engine Developer', 'vaga', 'estado', '{MG}', 'Gameplay programmer with Blueprints and C++.', 16),
  ('v-gameplay', 'Gameplay Programmer', 'vaga', 'internacional', null, 'Remote-friendly studio in Canada. C++ and engine experience.', 11),
  ('v-qa', 'QA Tester', 'vaga', 'estado', '{SP}', 'Testes funcionais e de regressão em jogos de console.', 8),
  ('v-qa-intern', 'QA Intern', 'vaga', 'estado', '{SP}', 'Internship for quality assurance on mobile games.', 6),
  ('v-data-eng', 'Associate Data Engineer', 'vaga', 'estado', '{SP}', 'Build data pipelines for game analytics.', 10),
  ('v-data-sci', 'Senior Data Scientist', 'vaga', 'estado', '{SP}', 'Machine learning models for marketing.', 10),
  ('v-producer', 'Produtor de Jogos', 'vaga', 'estado', '{RS}', 'Gestão de cronograma e equipe.', 13),
  ('v-pm', 'Product Manager', 'vaga', 'estado', '{SP}', 'Own the roadmap of a live game.', 10),
  ('v-community', 'Community Manager', 'vaga', 'remoto', null, 'Gestão das redes sociais e do Discord do jogo.', 17),
  ('v-social-intern', 'Social Media Intern', 'vaga', 'estado', '{SP}', 'Create content for the social channels of our games.', 6),
  ('v-hr', 'Senior HRBP', 'vaga', 'estado', '{SP}', 'People team partner for game studios.', 10),
  ('v-sound', 'Sound Designer', 'vaga', 'remoto', null, 'Efeitos sonoros e ambiência para jogos de terror.', 19),
  ('v-composer', 'Compositor para trilha de RPG', 'vaga', 'remoto', null, 'Projeto freelance de trilha sonora orquestral.', 21),
  ('v-narr', 'Narrative Designer', 'vaga', 'internacional', null, 'Write branching dialogue for an RPG.', 22),
  ('v-tech-art', 'Technical Artist', 'vaga', 'estado', '{SP}', 'Shaders, ferramentas e otimização de pipeline.', 23),
  ('v-ux', 'UX Researcher', 'vaga', 'estado', '{SP}', 'Pesquisa com jogadores e testes de usabilidade.', 24),
  ('v-acct', 'Accounting and Reporting Manager', 'vaga', 'estado', '{SP}', 'Lead accounting for a game company.', 10),
  ('e-spcine', 'Edital Spcine de desenvolvimento de games 2026', 'edital_fomento', 'estado', '{SP}', 'Fomento para produção de jogos eletrônicos por empresas paulistas.', 30),
  ('e-pnab', 'PNAB Rio: chamada para jogos digitais', 'edital_fomento', 'estado', '{RJ}', 'Apoio a projetos de games de pessoas físicas e MEI.', 28),
  ('e-nacional', 'Linha de financiamento para jogos', 'edital_fomento', 'nacional', null, 'Recursos para desenvolvimento de jogos independentes.', 40),
  ('j-gjp', 'GameJamPlus 26/27', 'game_jam', 'internacional', null, 'Game jam global e gratuita, com sede no Brasil.', 17),
  ('j-terror', 'Brasil Game Jam de Terror', 'game_jam', 'nacional', null, 'Maratona online de 48 horas para criar jogos de terror.', 4),
  ('ev-feira', 'Feira de games: área de estúdios independentes', 'evento', 'estado', '{SP}', 'Espaço para estúdios indie exporem seus jogos.', 35),
  ('ev-meetup', 'Encontro de desenvolvedores de Porto Alegre', 'evento', 'estado', '{RS}', 'Palestras e networking para game devs gaúchos.', 9),
  ('f-londres', 'Showcase presencial de jogos em Londres', 'chamada_festival_vitrine', 'internacional', null, 'Conecta desenvolvedores a jornalistas.', 26),
  ('f-mostra', 'Festival de jogos independentes', 'chamada_festival_vitrine', 'nacional', null, 'Inscrições de jogos para a mostra competitiva.', 27),
  ('c-start', 'Start Gamedev', 'curso_capacitacao', 'remoto', null, 'Curso online para iniciantes criarem o primeiro jogo.', 15),
  ('c-blender', 'Oficina de modelagem 3D no Blender', 'curso_capacitacao', 'estado', '{PE}', 'Curso presencial gratuito em Recife.', 12),
  ('m-mentorias', 'Mentorias para devs de games', 'mentoria', 'remoto', null, 'Mentorias gratuitas com profissionais da indústria.', 60),
  ('a-acel', 'Programa de aceleração para estúdios de games', 'aceleracao_incubacao', 'nacional', null, 'Aceleradora com investimento e mentoria para estúdios em estágio inicial.', 45),
  ('p-pub', 'Chamada de publisher para jogos indie', 'chamada_publisher', 'internacional', null, 'Publisher procura jogos de ação para PC e console.', 33),
  ('t-co', 'Co-desenvolvimento: estúdio procura parceiro de arte', 'terceirizacao_codesenvolvimento', 'nacional', null, 'Terceirização de arte 3D para jogo mobile.', 29);

insert into oportunidades.oportunidades (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico, situacao, publicada_em, descricao)
select '00000000-0000-4000-8000-0000000000c1', titulo, tipo, 'https://catalogo.test/' || codigo, current_date + dias,
  'encerramento_inscricoes', abrangencia, ufs, publico, 'publicada', now(), descricao
from catalogo;

-- As perguntas, em 5 grupos de 6, mais 2 negativas. `esperados` vazio = não deve trazer nada.
create temp table perguntas (n integer primary key, grupo text, texto text, uf text, esperados text[]);

insert into perguntas values
  (1, 'direta', 'level designer', null, '{v-level}'),
  (2, 'direta', 'ui', 'SP', '{v-ui}'),
  (3, 'direta', 'unity', null, '{v-unity}'),
  (4, 'direta', 'game jam', null, '{j-terror,j-gjp}'),
  (5, 'direta', 'concept artist', null, '{v-concept}'),
  (6, 'direta', 'community manager', null, '{v-community}'),
  (7, 'português', 'estágio', null, '{v-audio,v-qa-intern,v-social-intern}'),
  (8, 'português', 'artista de cenário', null, '{v-env}'),
  (9, 'português', 'designer de som', null, '{v-sound}'),
  (10, 'português', 'design de som', null, '{v-audio,v-sound}'),
  (11, 'português', 'programador', null, '{v-gameplay,v-unity,v-unreal}'),
  (12, 'português', 'gerente de produto', null, '{v-pm}'),
  (13, 'digitação', 'level desinger', null, '{v-level}'),
  (14, 'digitação', 'unreal engnie', null, '{v-unreal}'),
  (15, 'digitação', 'artsta de cenario', null, '{v-env}'),
  (16, 'digitação', 'comunity manager', null, '{v-community}'),
  (17, 'digitação', 'progamador', null, '{v-gameplay,v-unity,v-unreal}'),
  (18, 'digitação', 'mentorai', null, '{m-mentorias}'),
  (19, 'frase', 'quero uma vaga de UI em São Paulo', null, '{v-ui}'),
  (20, 'frase', 'editais de games em SP', null, '{e-spcine,e-nacional}'),
  (21, 'frase', 'game jam de terror', null, '{j-terror}'),
  (22, 'frase', 'curso de blender em Recife', null, '{c-blender}'),
  (23, 'frase', 'vaga remota de artista', null, '{v-env,v-2d}'),
  (24, 'frase', 'evento para game devs em Porto Alegre', null, '{ev-meetup}'),
  (25, 'ambígua', 'artista', null, '{v-env,v-char,v-concept,v-2d,v-tech-art}'),
  (26, 'ambígua', 'designer', null, '{v-ui,v-level,v-gamedes,v-sound,v-narr}'),
  (27, 'ambígua', 'dados', null, '{v-data-eng,v-data-sci}'),
  (28, 'ambígua', 'som', null, '{v-sound,v-audio}'),
  (29, 'ambígua', 'produtor', null, '{v-producer}'),
  (30, 'ambígua', 'intern', null, '{v-audio,v-qa-intern,v-social-intern}'),
  (31, 'negativa', 'futebol', null, '{}'),
  (32, 'negativa', 'uil', null, '{}');

do $$
declare
  -- Meta da calibragem e perguntas que já acertavam antes dos ajustes (nenhuma pode passar a errar).
  v_meta numeric := 0;
  v_obrigatorias integer[] := '{}';
  p record;
  v_codigos text[];
  v_top3 text[];
  v_acertou boolean;
  v_acertos integer := 0;
  v_total integer := 0;
  v_falhas integer[] := '{}';
begin
  for p in select * from perguntas order by n loop
    select coalesce(array_agg(substr(r.link_oficial, length('https://catalogo.test/') + 1)), '{}') into v_codigos
    from vitrine.buscar_oportunidades(p_uf => p.uf, p_texto => p.texto, p_limite => 10) r;
    v_top3 := v_codigos[1:3];

    if cardinality(p.esperados) = 0 then
      v_acertou := cardinality(v_codigos) = 0;
    else
      v_acertou := v_codigos[1] = any (p.esperados)
        and case when cardinality(p.esperados) <= 3 then p.esperados <@ v_top3 else v_top3 <@ p.esperados end;
    end if;

    v_total := v_total + 1;
    if v_acertou then v_acertos := v_acertos + 1; else v_falhas := v_falhas || p.n; end if;
    raise notice '% %  [%] "%"%  →  %', case when v_acertou then 'ACERTOU' else 'ERROU  ' end, lpad(p.n::text, 2),
      p.grupo, p.texto, coalesce(' (' || p.uf || ')', ''), coalesce(array_to_string(v_top3, ', '), '(nada)');
  end loop;

  raise notice 'RESULTADO: % de % perguntas (%)', v_acertos, v_total, round(100.0 * v_acertos / v_total) || '%';

  if v_acertos::numeric / v_total < v_meta then
    raise exception 'FALHA: a busca acertou % de % perguntas, abaixo da meta de %', v_acertos, v_total, round(100 * v_meta) || '%';
  end if;
  if v_obrigatorias && v_falhas then
    raise exception 'FALHA: perguntas que acertavam passaram a errar: %', array(select unnest(v_obrigatorias) intersect select unnest(v_falhas));
  end if;
end;
$$;

rollback;
