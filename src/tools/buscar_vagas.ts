import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { toUFSigla, toUFNome } from '../lib/uf-map.js'

interface TipoFuncaoRow { nome: string }
interface VagaTipoFuncaoRow { tipos_funcao: TipoFuncaoRow | TipoFuncaoRow[] | null }
interface EstudioRow { nome: string }

export function registerBuscarVagas(server: McpServer): void {
  server.tool(
    'buscar_vagas',
    `Busca vagas de emprego abertas na indústria de games brasileira.
Use esta tool quando o usuário perguntar sobre vagas, empregos, oportunidades de trabalho
ou quiser saber o que está disponível no mercado de games do Brasil.
Filtre por estado, área, nível e modalidade conforme o usuário pedir.
Apresente os resultados de forma conversacional — mencione título, estúdio, nível, modalidade
e link para candidatura. Nunca retorne JSON bruto ao usuário.
Quando não houver resultados, sugira ampliar os filtros ou verificar em breve.
Se o usuário não especificar filtros, retorne as vagas mais recentes.`,
    {
      estado: z.string().optional().describe('Estado de interesse — aceita nome completo ou sigla. Ex: "São Paulo" ou "SP"'),
      area: z.string().optional().describe('Área ou função. Ex: "programação", "arte", "design", "produção"'),
      nivel: z.enum(['iniciante', 'junior', 'pleno', 'senior', 'lead']).optional().describe('Nível da vaga'),
      remoto: z.boolean().optional().describe('true para vagas remotas, false para presenciais'),
      query: z.string().optional().describe('Busca por texto livre no título da vaga'),
    },
    async ({ estado, area, nivel, remoto, query }) => {
      const estadoSigla = estado ? toUFSigla(estado) : null

      let q = supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          nivel,
          remoto,
          estado,
          criada_em,
          contato_candidatura,
          descricao,
          estudios!estudio_id ( nome ),
          vaga_tipos_funcao (
            tipos_funcao ( nome )
          )
        `)
        .eq('ativa', true)
        .or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
        .order('criada_em', { ascending: false })
        .limit(20)

      if (estadoSigla) q = q.eq('estado', estadoSigla)
      if (nivel) q = q.eq('nivel', nivel)
      if (remoto === true) q = q.eq('remoto', 'remoto')
      else if (remoto === false) q = q.neq('remoto', 'remoto')
      if (query) q = q.ilike('titulo', `%${query}%`)

      const { data, error } = await q

      if (error || !data) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ vagas: [], total: 0 }) }],
        }
      }

      // Helpers para extrair nomes das áreas do JOIN aninhado
      function getNomeEstudio(raw: unknown): string | null {
        const e = raw as EstudioRow | EstudioRow[] | null
        if (!e) return null
        return Array.isArray(e) ? (e[0]?.nome ?? null) : e.nome
      }

      function getAreas(raw: unknown): string[] {
        const vtf = raw as VagaTipoFuncaoRow[] | null
        if (!vtf) return []
        return vtf.flatMap((row) => {
          const tf = row.tipos_funcao
          if (!tf) return []
          if (Array.isArray(tf)) return tf.map((t) => t.nome)
          return [tf.nome]
        })
      }

      // Filtro por área (client-side)
      const vagasFiltradas = area
        ? data.filter((v) =>
            getAreas(v.vaga_tipos_funcao).some((n) =>
              n.toLowerCase().includes(area.toLowerCase())
            )
          )
        : data

      const vagas = vagasFiltradas.map((v) => ({
        id: v.id,
        titulo: v.titulo,
        estudio: getNomeEstudio(v.estudios),
        nivel: v.nivel,
        remoto: v.remoto,
        estado: v.estado ? toUFNome(v.estado) : null,
        areas: getAreas(v.vaga_tipos_funcao),
        descricao_resumida: v.descricao ? v.descricao.substring(0, 300) : null,
        url_candidatura: v.contato_candidatura ?? null,
        criada_em: v.criada_em,
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ vagas, total: vagas.length }),
        }],
      }
    }
  )
}
