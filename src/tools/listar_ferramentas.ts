import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const FERRAMENTAS = [
  {
    nome: 'Buscar oportunidades',
    descricao: 'Encontra editais de fomento, game jams, eventos e parcerias da indústria de games brasileira. Filtre por estado, tipo ou tema.',
  },
  {
    nome: 'Buscar vagas de emprego',
    descricao: 'Lista vagas abertas na indústria de games. Filtre por área (arte, programação, design, produção), nível, modalidade (remoto/presencial) e estado.',
  },
  {
    nome: 'Oportunidades para o meu perfil',
    descricao: 'Busca personalizada baseada no seu perfil da Matchmaking — estado, habilidades e preferências. Requer login para personalização completa.',
  },
  {
    nome: 'Assistentes de associações',
    descricao: 'Lista as associações parceiras da Matchmaking que têm um assistente regional próprio, com conteúdo curado para o ecossistema local.',
  },
  {
    nome: 'Ver meu perfil',
    descricao: 'Exibe seu perfil completo da Matchmaking: dados profissionais, habilidades, estúdios e jogos publicados. Requer login.',
  },
]

export function registerListarFerramentas(server: McpServer): void {
  server.tool(
    'listar_ferramentas',
    `Use quando o usuário perguntar o que você pode fazer, quais funções estão disponíveis,
como você pode ajudar, ou expressões similares como "me ajuda com o quê?" ou "o que você faz?".
Apresente as ferramentas de forma conversacional, em linguagem simples.
Nunca use nomes técnicos como "tool", "MCP" ou nomes internos das funções.
Após listar, pergunte com o que o usuário quer começar.`,
    {},
    { title: 'O que posso fazer', readOnlyHint: true },
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ferramentas: FERRAMENTAS }),
        }],
      }
    }
  )
}
