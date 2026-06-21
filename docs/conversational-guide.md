# Guia de Tom Conversacional

Este documento define como as tools do Matchmaking MCP devem se comunicar com os usuários. É um critério de aceitação obrigatório para qualquer nova tool submetida via PR — tão importante quanto o CI passar.

---

## O princípio central

O servidor não é uma API fria. É um auxiliar que conhece o ecossistema de games brasileiro.

A diferença na prática:

**API fria:**
> Usuário: "Quais editais estão abertos?"
> Servidor: `[{ "titulo": "Edital X", "url": "..." }, ...]`

**Auxiliar:**
> Usuário: "Quais editais estão abertos?"
> Claude (usando a tool): "Encontrei 3 editais com prazo aberto. O mais relevante para quem está em MG é o Edital da Secult, com inscrições até 15 de julho. Quer que eu filtre por área de atuação?"

Essa diferença não está no código da tool — está na `description` dela. A `description` é uma instrução para o Claude sobre quando e como chamar a tool, e como se comunicar depois.

---

## Como escrever uma `description` correta

A description não é documentação técnica. É uma instrução comportamental para o Claude.

**Estrutura recomendada:**

1. Quando chamar — situação que dispara o uso
2. O que fazer antes de chamar — contexto a coletar do usuário, se necessário
3. O que fazer com o resultado — como apresentar, o que sugerir a seguir
4. Casos especiais — erros, ausência de resultado, conteúdo exclusivo

**Exemplo:**

```typescript
server.tool("buscar_vagas", {
  description: `Use quando o usuário estiver buscando emprego na indústria de games.
Antes de chamar, pergunte a área (arte, programação, design, produção, etc.),
nível de experiência e preferência por remoto — se o usuário não informou.
Apresente as vagas com contexto: mencione o estúdio, a modalidade e o nível,
não apenas o título e o link. Se não encontrar nada com os filtros dados,
explique o que poderia ajudar (ex: ampliar para remoto, mudar o estado).`,
  // ...
})
```

---

## Comportamentos esperados do Claude com este servidor

### Perguntar antes de chamar
Se o contexto for insuficiente para uma busca útil, o Claude deve perguntar antes de chamar a tool. Uma busca sem filtros retorna muito ruído — é pior do que perguntar.

### Explicar o que encontrou
O Claude não deve apenas listar resultados. Deve contextualizar: o que é relevante, por que, o que se destaca.

### Sugerir próximos passos
Após retornar resultados, o Claude deve oferecer refinamentos naturais: "quer filtrar por estado?", "posso buscar por nível também?".

### Tratar ausência de resultado
Se a tool não retornar nada, o Claude deve explicar por que (filtro muito restrito, conteúdo expirado, região sem cobertura) e sugerir o que ajudaria.

### Mencionar conteúdo exclusivo com cuidado
Se existir conteúdo exclusivo para associados que o usuário não pode ver, o Claude deve mencionar a existência sem detalhar o conteúdo. A formulação certa é: "existe conteúdo adicional disponível para associados da [Associação]" — nunca ignorar silenciosamente.

---

## O que evitar

- Retornar listas brutas sem contexto
- Chamar tools sem ter contexto mínimo para um resultado útil
- Usar jargão técnico ("MCP", "skill", "anon key") em resposta ao usuário final
- Apresentar erros de autenticação com mensagens técnicas — traduzir para linguagem humana

---

## Checklist para PRs com novas tools

- [ ] A `description` instrui quando chamar (não apenas o que faz)
- [ ] A `description` instrui o que fazer antes de chamar (contexto necessário)
- [ ] A `description` instrui como apresentar os resultados
- [ ] A `description` cobre o caso de ausência de resultado
- [ ] Nenhum jargão técnico exposto ao usuário final nas mensagens de erro
