import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { toUFSigla } from '../lib/uf-map.js'
import { verificarAssociado } from './verificar_associado.js'

const FONTE_NOMES: Record<string, string | null> = {
  idj: 'Indústria de Jogos',
  gamingera: 'The Gaming Era',
  dropsdejogos: 'Drops de Jogos',
  gogamers: 'GoGamers',
  itchio: 'itch.io',
  abragames: 'ABRAGAMES',
  linkedin: 'LinkedIn',
  workable: 'Workable',
  plataforma_vaga: 'Matchmaking',
  plataforma_parceria: 'Matchmaking',
  rss: null,
}

// Tipos que esta tool retorna — vagas de emprego são tratadas por buscar_vagas
const TIPOS_OPORTUNIDADE = ['oportunidade', 'parceria', 'evento'] as const
type TipoOportunidade = typeof TIPOS_OPORTUNIDADE[number]

export function registerBuscarOportunidades(server: McpServer): void {
  server.tool(
    'buscar_oportunidades',
    `Busca editais de fomento, game jams, eventos, parcerias e oportunidades da
indústria de games brasileira — exceto vagas de emprego.
Para vagas de emprego, use buscar_vagas.
Use quando o usuário perguntar sobre editais, game jams, eventos, festivais,
bolsas, fomento, programas de aceleração ou parcerias.
Apresente os resultados de forma conversacional — título com link clicável,
fonte (ex: "Via Indústria de Jogos"), empresa quando disponível e prazo.
Nunca omita o link ou a fonte quando disponíveis. Nunca retorne JSON bruto.
Se não encontrar nada com os filtros dados:
- Informe que o conteúdo é atualizado regularmente
- Sugira ampliar os filtros (remover estado, remover tags específicas)
- Se o usuário claramente quer emprego, redirecione para buscar_vagas
Para usuários logados na Matchmaking, sugira buscar_oportunidades_para_mim
para resultados personalizados pelo perfil.`,
    {
      skill_slug: z.string().optional().describe('Slug da skill ativa para filtrar por organização parceira'),
      tipo: z.array(z.enum(['oportunidade', 'parceria', 'evento'])).optional().describe('Tipos a buscar — editais, eventos ou parcerias'),
      estados: z.array(z.string()).optional().describe('Estados de interesse — aceita nome completo ou sigla'),
      tags: z.array(z.string()).optional().describe('Tags para filtrar. Ex: "fomento", "game jam", "indie"'),
      query: z.string().optional().describe('Busca por texto livre no título'),
      apenas_vigentes: z.boolean().optional().default(true).describe('Se true, retorna apenas itens não expirados'),
    },
    { title: 'Buscar oportunidades', readOnlyHint: true },
    async ({ skill_slug, tipo, estados, tags, query, apenas_vigentes }, extra) => {
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      let userId: string | null = null
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id ?? null
      }

      // Buscar configuração da skill
      let orgIds: string[] = []
      let skillEstados: string[] = []
      let skillTipos: TipoOportunidade[] = []

      if (skill_slug) {
        const { data: skill } = await supabase
          .from('mcp_skill_config')
          .select('organizacao_id, estados, tipos_conteudo')
          .eq('slug', skill_slug)
          .eq('ativo', true)
          .single()

        if (skill) {
          orgIds = [skill.organizacao_id]
          skillEstados = skill.estados ?? []
          // Filtrar apenas tipos válidos (excluir 'vaga' se vier da skill config)
          skillTipos = (skill.tipos_conteudo ?? []).filter(
            (t): t is TipoOportunidade => TIPOS_OPORTUNIDADE.includes(t as TipoOportunidade)
          )
        }
      }

      // Determinar tipos a buscar — nunca inclui 'vaga'
      const tiposFiltro: TipoOportunidade[] = tipo?.length
        ? tipo
        : skillTipos.length > 0
          ? skillTipos
          : [...TIPOS_OPORTUNIDADE]

      let q = supabase
        .from('newsletter_itens')
        .select('id, tipo, titulo, empresa, descricao, url, fonte, tags, expira_em, exclusivo_associados, ref_organizacao_id')
        .eq('status', 'aprovado')
        .in('tipo', tiposFiltro)
        .order('publicado_em', { ascending: false })
        .limit(20)

      if (apenas_vigentes !== false) {
        q = q.or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
      }

      if (orgIds.length > 0) q = q.in('ref_organizacao_id', orgIds)
      if (tags && tags.length > 0) q = q.overlaps('tags', tags)
      if (query) q = q.ilike('titulo', `%${query}%`)

      const { data, error } = await q

      if (error || !data) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ resultados: [], total: 0 }) }],
        }
      }

      // Filtro de estados client-side via tags
      const estadosFiltro = estados
        ? estados.map((e) => toUFSigla(e)).filter((s): s is string => s !== null)
        : skillEstados.length > 0 ? skillEstados : null

      const resultados = await Promise.all(
        data.map(async (item) => {
          const fonteNome = FONTE_NOMES[item.fonte] ?? item.fonte ?? null

          if (!item.exclusivo_associados) {
            return {
              id: item.id,
              tipo: item.tipo,
              titulo: item.titulo,
              empresa: item.empresa ?? null,
              descricao: item.descricao ? item.descricao.substring(0, 300) : null,
              url: item.url,
              fonte: item.fonte ?? null,
              fonte_nome: fonteNome,
              tags: item.tags ?? [],
              expira_em: item.expira_em ?? null,
              exclusivo: false,
            }
          }

          if (token && userId && item.ref_organizacao_id) {
            const temAcesso = await verificarAssociado(token, userId, item.ref_organizacao_id)
            if (temAcesso) {
              return {
                id: item.id,
                tipo: item.tipo,
                titulo: item.titulo,
                empresa: item.empresa ?? null,
                descricao: item.descricao ? item.descricao.substring(0, 300) : null,
                url: item.url,
                fonte: item.fonte ?? null,
                fonte_nome: fonteNome,
                tags: item.tags ?? [],
                expira_em: item.expira_em ?? null,
                exclusivo: true,
              }
            }
          }

          return {
            id: item.id,
            tipo: item.tipo,
            titulo: item.titulo,
            empresa: null,
            descricao: null,
            url: null,
            fonte: null as string | null,
            fonte_nome: null as string | null,
            tags: [],
            expira_em: null,
            exclusivo: true,
            acesso_restrito: true,
            mensagem: 'Conteúdo exclusivo para associados. Faça login ou associe-se para ter acesso.',
          }
        })
      )

      const resultadosFiltrados = estadosFiltro
        ? resultados.filter((r) =>
            !r.tags || r.tags.length === 0 ||
            r.tags.some((tag: string) => estadosFiltro.includes(tag.toUpperCase()))
          )
        : resultados

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ resultados: resultadosFiltrados, total: resultadosFiltrados.length }),
        }],
      }
    }
  )
}
