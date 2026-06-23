import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabase } from '../lib/supabase.js'
import { toUFNomes } from '../lib/uf-map.js'

export function registerListarSkills(server: McpServer): void {
  server.tool(
    'listar_skills',
    `Lista todas as associações e organizações parceiras que têm uma skill ativa na Matchmaking.
Use esta tool quando o usuário perguntar quais associações participam, quais organizações estão
disponíveis, ou quiser saber o que o assistente cobre.
Apresente os resultados de forma conversacional — não liste como uma tabela ou JSON bruto.
Para cada skill, mencione o nome, os estados que cobre e os tipos de conteúdo disponíveis.
Sugira ao usuário perguntar sobre uma skill específica para ver mais detalhes.`,
    {},
    { title: 'Listar skills disponíveis', readOnlyHint: true },
    async () => {
      const { data, error } = await supabase
        .from('mcp_skill_config')
        .select(`
          slug,
          nome_publico,
          descricao,
          estados,
          tags_foco,
          tipos_conteudo,
          organizacoes!organizacao_id ( nome )
        `)
        .eq('ativo', true)
        .order('nome_publico')

      if (error || !data || data.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ skills: [], total: 0 }),
          }],
        }
      }

      const skills = data.map((s) => ({
        slug: s.slug,
        nome_publico: s.nome_publico,
        descricao: s.descricao ?? null,
        estados: toUFNomes(s.estados ?? []),
        tags_foco: s.tags_foco ?? [],
        tipos_conteudo: s.tipos_conteudo ?? [],
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ skills, total: skills.length }),
        }],
      }
    }
  )
}
