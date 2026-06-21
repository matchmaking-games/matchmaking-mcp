# Como Contribuir

Obrigado pelo interesse em contribuir com o Matchmaking MCP. Este documento explica como funciona o processo de contribuição, quais tipos de contribuição existem e o que esperar em cada etapa.

---

## Tipos de contribuição

Existem dois tipos de contribuição com processos distintos.

### 1. Contribuição técnica (código)

Inclui novas ferramentas (tools), correções de bugs, melhorias de performance, documentação técnica e testes.

**Processo:**

1. Abra uma [Discussion](../../discussions) descrevendo o que você quer construir antes de escrever código. Isso evita trabalho duplicado e garante alinhamento com a direção do projeto.
2. Aguarde feedback. O mantenedor principal ou um Revisor Técnico vai responder com aprovação, ajustes na proposta ou explicação de por que não faz sentido no momento.
3. Com a proposta aprovada, faça um fork do repositório e abra um Pull Request com sua implementação.
4. O PR será revisado por um Revisor Técnico, que dará parecer sobre qualidade e segurança.
5. A aprovação final e o merge são feitos pelo mantenedor principal.

**Critérios de aceitação de código:**
- Escrito em TypeScript, sem `@ts-nocheck` e sem `as any`
- Sem dependências externas não justificadas em Discussion prévia
- Tools novas devem seguir o guia em [docs/conversational-guide.md](docs/conversational-guide.md)
- Nenhuma credencial ou dado sensível no código
- CI passando (typecheck + lint)

### 2. Contribuição de conteúdo (editais, eventos, oportunidades)

Inclui submissão de editais de fomento, eventos, game jams e oportunidades regionais para a base de dados.

**Processo:**

1. Acesse o painel de curadoria em [matchmaking.games/curadoria](https://matchmaking.games/curadoria) com sua conta Matchmaking.
2. Preencha o formulário com título, descrição, link oficial, tipo, região e data de validade.
3. O conteúdo entra com status `pendente` e não aparece publicamente até aprovação.
4. Um Revisor de Conteúdo valida a legitimidade da fonte e a relevância para o ecossistema.
5. A aprovação final é feita pelo mantenedor principal ou por um Revisor de Conteúdo autorizado.

**Critérios de aceitação de conteúdo:**
- Fonte verificável e link oficial funcionando
- Relevante para profissionais ou estúdios da indústria de games
- Dentro do prazo de validade
- Sem conteúdo promocional disfarçado de oportunidade
- Sem links encurtados ou redirecionamentos suspeitos

---

## Papéis

**Mantenedor principal** — Lucas Pimenta. Responsável pela direção do projeto, aprovações finais e merges. Palavra final em qualquer decisão.

**Revisor Técnico** — Desenvolvedor convidado com experiência comprovada. Faz triagem e análise de Pull Requests de código. Emite parecer técnico, mas não tem poder de merge. O convite é feito pelo mantenedor principal com base em contribuições consistentes e demonstradas.

**Revisor de Conteúdo** — Representante de associação parceira ou membro reconhecido da comunidade. Valida submissões de editais, eventos e oportunidades. Emite parecer de legitimidade, mas não publica diretamente. O convite é feito pelo mantenedor principal.

---

## O que não aceitamos

- Ferramentas que escrevam ou deletem dados sem autorização explícita do mantenedor
- Conteúdo que não seja diretamente relacionado à indústria de games
- Pull Requests sem Discussion prévia aprovada (exceto bugfixes e documentação)
- Código que introduza dependências de serviços pagos sem discussão
- Qualquer forma de coleta de dados pessoais não prevista na arquitetura existente
- `@ts-nocheck` ou `as any` — o projeto mantém tipagem completa via `database.types.ts`

---

## Regras inegociáveis

- Nunca inclua credenciais, IDs de projeto, tokens ou qualquer segredo no código
- Nunca hardcode URLs de ambiente (dev, staging, prod) — use variáveis de ambiente
- O arquivo `.env` nunca deve ser commitado

---

## Dúvidas?

Abra uma [Discussion](../../discussions) com a tag `Q&A`.
Para assuntos privados: lucas.pimenta@matchmaking.games
