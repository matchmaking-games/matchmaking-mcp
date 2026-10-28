-- Oportunidades fictícias para testar a conexão do MCP no ambiente de dev.
-- Nunca aplicar na produção. Pode rodar mais de uma vez: não duplica nada.
insert into oportunidades.fontes (nome, leitor, endereco, confianca)
select 'Exemplos da Matchmaking (dados fictícios)', 'exemplo', 'https://matchmaking.games', 'confiavel'
where not exists (select 1 from oportunidades.fontes where leitor = 'exemplo');

insert into oportunidades.oportunidades (
  fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico,
  descricao, niveis, valor, publico_especifico, situacao, publicada_em
)
select
  f.id,
  v.titulo,
  v.tipo::oportunidades.tipo_item,
  v.link_oficial,
  v.prazo::date,
  v.natureza_prazo::oportunidades.natureza_prazo,
  v.abrangencia::oportunidades.abrangencia,
  v.ufs::text[],
  v.publico::oportunidades.publico,
  v.descricao,
  v.niveis::oportunidades.nivel[],
  v.valor,
  v.publico_especifico,
  'publicada',
  now()
from oportunidades.fontes f
cross join (
  values
    (
      '[Exemplo] Edital de fomento a jogos independentes de São Paulo', 'edital_fomento',
      'https://matchmaking.games', '2026-12-15', 'encerramento_inscricoes', 'estado', '{SP}', 'ambos',
      'Oportunidade fictícia, usada só para testar a conexão do MCP.', null, 'Até R$ 50 mil por projeto', null
    ),
    (
      '[Exemplo] Vaga remota de Game Designer pleno', 'vaga',
      'https://matchmaking.games', '2026-12-31', 'encerramento_inscricoes', 'remoto', null, 'pessoa',
      'Oportunidade fictícia, usada só para testar a conexão do MCP.', '{pleno}', null, null
    ),
    (
      '[Exemplo] Game jam nacional de jogos educativos', 'game_jam',
      'https://matchmaking.games', '2027-01-20', 'data_do_evento', 'nacional', null, 'pessoa',
      'Oportunidade fictícia, usada só para testar a conexão do MCP.', null, null, 'Estudantes e profissionais'
    ),
    (
      '[Exemplo] Encontro de estúdios do Nordeste em Recife', 'evento',
      'https://matchmaking.games', '2027-02-10', 'data_do_evento', 'estado', '{PE}', 'ambos',
      'Oportunidade fictícia, usada só para testar a conexão do MCP.', null, null, null
    )
) as v (
  titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico,
  descricao, niveis, valor, publico_especifico
)
where f.leitor = 'exemplo'
  and not exists (select 1 from oportunidades.oportunidades o where o.fonte_id = f.id);
