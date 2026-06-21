# Skills de Associações

Uma **skill** é uma configuração pré-definida do servidor MCP para o contexto de uma associação parceira específica. Quando ativa, ela transforma o assistente de IA em um auxiliar especializado no ecossistema daquela associação — com filtros regionais, tipos de conteúdo priorizados e acesso a conteúdo exclusivo para associados.

---

## O que uma skill define

- **Nome e identidade** — como o assistente se apresenta ("Assistente da Abring")
- **Estados cobertos** — filtra conteúdo por região automaticamente
- **Tipos de conteúdo** — prioriza vagas, editais, eventos ou game jams conforme o foco da associação
- **Tags de foco** — fomento, empregabilidade, educação, eventos, networking, esports, indie, acessibilidade, VR/AR, game jams
- **Conteúdo exclusivo** — itens visíveis apenas para associados ativos verificados
- **Mensagem de boas-vindas** — texto de abertura personalizado para o contexto da associação

---

## Como o conteúdo exclusivo funciona

Cada item de conteúdo no banco de dados pode ser marcado como exclusivo para associados de uma organização específica. O servidor verifica automaticamente se o usuário autenticado é um associado ativo antes de exibir esse conteúdo. Se não for associado, o título do item aparece com uma mensagem explicando que o conteúdo completo requer associação — nenhum item é oculto completamente, garantindo transparência.

---

## Para associações que querem participar

Se a sua associação tem editais, eventos ou oportunidades que os membros da
comunidade deveriam conhecer — mas que ficam perdidos em planilhas, grupos de
WhatsApp ou newsletters que ninguém abre — uma skill pode mudar isso.

Com uma skill da sua associação ativa, qualquer associado que usar o assistente
recebe automaticamente o conteúdo curado por vocês, filtrado para o contexto
regional, sem precisar procurar em lugar nenhum.

O que sua associação precisa fazer é simples: contribuir com o conteúdo regional
que vocês já conhecem. A infraestrutura, a curadoria nacional e a tecnologia
são responsabilidade da Matchmaking.

Para saber mais sobre como participar: contato@matchmaking.games

---

## Para desenvolvedores

Skills são registros na tabela `mcp_skill_config` do Supabase. Cada skill tem um `slug` único (ex: `"abring"`, `"abragames-editais"`) que é passado como parâmetro para a tool `get_contexto_skill`.

Uma organização pode ter múltiplas skills com focos diferentes — por exemplo, uma skill focada em editais e outra em eventos.
