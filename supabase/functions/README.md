# Funções

Funções do Supabase (coleta de fontes, filtro, alertas). Cada função fica numa
pasta própria com o nome dela.

## coletar

Chamada pelo agendador do banco. Lê as fontes com leitura vencida, uma por vez, guarda os
itens como chegaram, passa todos pelo portão de qualidade e registra cada leitura.
A cada leitura, o que sumiu da fonte sai do índice e as vagas sem prazo que continuam lá
ganham de novo o prazo de conferência (14 dias).
Só aceita chamadas com a senha `CRON_SECRET` (a mesma do Vault). Publicar com `verify_jwt = false`.

Os leitores ficam em `_shared/leitores/`, um arquivo por tipo de fonte, e são testados pelos
testes do servidor (`server/test/leitor-*.test.ts`).
