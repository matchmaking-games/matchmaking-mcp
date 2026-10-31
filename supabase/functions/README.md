# Funções

Funções do Supabase (coleta de fontes, filtro, alertas). Cada função fica numa
pasta própria com o nome dela.

## coletar

Chamada pelo agendador do banco. Lê as fontes com leitura vencida, uma por vez, guarda os
itens como chegaram, passa todos pelo portão de qualidade e registra cada leitura.
A cada leitura, o que sumiu da fonte sai do índice e as vagas sem prazo que continuam lá
ganham de novo o prazo de conferência (14 dias).
Só aceita chamadas com a senha `CRON_SECRET` (a mesma do Vault). Publicar com `verify_jwt = false`.

Leitores disponíveis: `greenhouse` (configuração `{"board": "..."}`) e `rss` (configuração
`{"url": "https://.../feed/"}`). O RSS abre cada notícia nova e pede à IA (Gemini, segredo
`GEMINI_API_KEY`, chave do plano pago) para dizer se é uma oportunidade para quem faz jogos;
o que fica de fora é guardado como `descartado`, com o motivo, e não conta contra a fonte.
Num feed, sair da lista só quer dizer que a notícia ficou velha, então o RSS não fecha as ausentes.

Os leitores ficam em `_shared/leitores/`, um arquivo por tipo de fonte, e são testados pelos
testes do servidor (`server/test/leitor-*.test.ts`).
