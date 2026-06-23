import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { toUFNomes } from '../lib/uf-map.js'

export function registerGetContextoSkill(server: McpServer): void {
  server.tool(
    'get_contexto_skill',
    `Chame esta tool automaticamente no início de cada conversa quando
um skill_slug estiver configurado no cliente MCP — antes de qualquer mensagem sua.
Use o campo mensagem_boas_vindas como abertura da conversa.
Apresente-se como o assistente da associação usando nome_publico — nunca mencione
"MCP", "skill", "tool" ou qualquer termo técnico ao usuário.
Use descricao, estados e tags_foco para entender o contexto e filtrar suas respostas
automaticamente ao longo de toda a conversa — sem precisar perguntar ao usuário.
Se a skill não for encontrada pelo slug informado, continue normalmente como
assistente geral da Matchmaking sem mencionar o erro ao usuário.`,
    { slug: z.string().describe('Slug da skill. Ex: "abring", "abragames-editais"') },
    { title: 'Obter contexto da skill', readOnlyHint: true },
    async ({ slug }) => {
      const { data, error } = await supabase
        .from('mcp_skill_config')
        .select(`
          slug,
          nome_publico,
          descricao,
          estados,
          tipos_conteudo,
          tags_foco,
          mensagem_boas_vindas,
          organizacoes!organizacao_id ( nome )
        `)
        .eq('slug', slug)
        .eq('ativo', true)
        .single()

      if (error || !data) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ encontrado: false }) }],
          isError: false,
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nome_publico: data.nome_publico,
            descricao: data.descricao ?? null,
            estados: toUFNomes(data.estados ?? []),
            tipos_conteudo: data.tipos_conteudo ?? [],
            tags_foco: data.tags_foco ?? [],
            mensagem_boas_vindas: data.mensagem_boas_vindas ?? null,
          }),
        }],
      }
    }
  )
}
