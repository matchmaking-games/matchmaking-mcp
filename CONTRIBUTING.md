# Como Contribuir

Obrigado pelo interesse em contribuir com o Matchmaking MCP. Este documento explica os tipos de contribuição e o que esperar em cada etapa.

---

## Tipos de contribuição

### 1. Leitores de fonte

A contribuição mais valiosa. Um leitor de fonte busca as oportunidades de um lugar (o portal de editais de um estado, a agenda de uma associação, o sistema de vagas de um estúdio) e as entrega no contrato mínimo do índice. Cada leitor novo abre uma caixa para toda uma região.

Leitores rodam com o mínimo de permissão: leem a fonte e gravam apenas itens brutos, nunca dados de pessoas.

*O guia com modelo pronto para escrever um leitor será publicado junto com a primeira versão do índice.*

### 2. Código do servidor

Melhorias nas ferramentas do MCP, correções, testes e documentação técnica.

### 3. Conteúdo

Indicar fontes e oportunidades. Todo conteúdo passa pelas checagens automáticas de qualidade e, enquanto a fonte estiver em observação, por moderação.

### 4. Moderação

Moderadores voluntários, por exemplo um por associação parceira, cuidam das oportunidades da sua região. O convite é feito pelo mantenedor principal.

---

## Processo para código

1. Abra uma [Discussion](../../discussions) descrevendo o que você quer construir antes de escrever código. Correções de bug e documentação podem ir direto para o PR.
2. Com a proposta alinhada, faça um fork e abra um Pull Request para a branch `next`.
3. Os testes automáticos rodam em todo PR e precisam passar.
4. O PR passa por revisão em três camadas: testes automáticos, revisão do mantenedor com apoio de IA e um revisor técnico externo.
5. A aprovação final e o merge são do mantenedor principal.

**Critérios de aceitação:**
- TypeScript estrito, sem `@ts-nocheck` e sem `as any`
- Testes para o que mudou
- Dados vindos de fora validados com Zod
- Sem dependências novas não justificadas na Discussion
- Conteúdo de fontes externas é tratado como dado, nunca como instrução para o assistente

**Regras para o banco (`supabase/`):**
- Toda tabela nova tem RLS ligado e GRANTs explícitos para `anon` e `authenticated`
- Funções `SECURITY DEFINER` usam `SET search_path = ''` e nomes completos (`schema.tabela`)
- `ALTER TYPE ... ADD VALUE` fica numa migration própria

---

## Papéis

**Mantenedor principal**: Lucas Pimenta. Direção do projeto, aprovações finais e merges.

**Revisor técnico**: desenvolvedor experiente convidado. Analisa PRs de código e dá parecer sobre qualidade e segurança, sem poder de merge.

**Moderador**: representante de associação parceira ou membro reconhecido da comunidade. Valida fontes e oportunidades da sua região.

---

## O que não aceitamos

- Ferramentas que gravem dados sem confirmação da pessoa
- Conteúdo que não seja do setor de games
- Coleta de dados pessoais fora do que a arquitetura prevê
- Código que dependa de serviços pagos sem discussão prévia

---

## Regras inegociáveis

- Nunca inclua credenciais, IDs de projeto, tokens ou qualquer segredo no código
- Nunca fixe URLs de ambiente no código; use variáveis de ambiente
- O arquivo `.env` nunca é comitado

---

## Dúvidas?

Abra uma [Discussion](../../discussions) com a tag `Q&A`.
Para assuntos privados: lucas.pimenta@matchmaking.games
