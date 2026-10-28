# Matchmaking MCP

Vagas, editais, eventos e parcerias da indústria de games no Brasil, encontrados pelo assistente de IA que você já usa.

O MCP comunitário da [Matchmaking](https://matchmaking.games) abre as caixas fechadas do setor. Oportunidades presas em planilhas, sistemas de vagas, sites e grupos passam a fazer parte de um índice vivo, que qualquer pessoa consulta pelo Claude ou pelo ChatGPT. É gratuito, de código aberto e construído junto com a comunidade.

> **Status:** em construção. Ainda não está disponível para uso.

## Como vai funcionar

- **Um único link.** Ao conectar, você escolhe entrar com sua conta da Matchmaking ou continuar sem conta. Sem conta, você já busca oportunidades; com conta, a busca usa o seu perfil.
- **Oportunidades com prazo e região.** Todo item traz título, tipo, link oficial, prazo ou data, região (estado, nacional, remoto ou internacional) e quem pode participar (pessoa, empresa ou ambos).
- **Fontes conectadas pelas próprias organizações.** Associações e estúdios conectam a planilha, a agenda ou o sistema de vagas que já usam, e o índice se atualiza sozinho.
- **Vocabulário da indústria, em português e inglês.** "Arte conceitual" e "Concept Art" encontram as mesmas oportunidades.

Tipos de oportunidade: vaga; edital ou fomento; game jam; evento; chamada de festival ou vitrine; curso ou capacitação; mentoria; aceleração ou incubação; chamada de publisher; terceirização ou co-desenvolvimento; notícia.

## Estrutura do repositório

| Pasta | O que tem |
| --- | --- |
| `server/` | Servidor do MCP, publicado na Vercel |
| `supabase/migrations/` | Estrutura do banco (índice de oportunidades, fontes, sinônimos) |
| `supabase/functions/` | Funções de coleta, filtro e alertas |

## Contribuindo

Há espaço para quem escreve código, para quem conhece as fontes de oportunidades da sua região e para quem quer ajudar a moderar.

Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um PR e o [GOVERNANCE.md](GOVERNANCE.md) para entender como as decisões são tomadas. Ideias novas começam em [Discussions](../../discussions).

## Licenças

- **Código:** [AGPL v3](LICENSE). Quem roda uma versão modificada como serviço publica as mudanças.
- **Dados do índice:** CC BY-NC-SA 4.0. O uso exige crédito à Matchmaking e à fonte original, não pode ser comercial, e adaptações seguem a mesma licença. Dados de pessoas nunca fazem parte dos dados abertos.

## Sobre

Criado e mantido pela [Matchmaking](https://matchmaking.games), marketplace de talentos da indústria de games no Brasil.
