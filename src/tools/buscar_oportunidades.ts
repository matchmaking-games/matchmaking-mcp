import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { toUFSigla } from '../lib/uf-map.js'
import { verificarAssociado } from './verificar_associado.js'

export function registerBuscarOportunidades(server: McpServer): void {
  server.tool(
    'buscar_oportunidades',
    `Busca vagas, editais, eventos, parcerias e oportunidades para a indústria de games brasileira.
Use esta tool sempre que o usuário pedir oportunidades, editais, eventos ou quiser saber o que
está disponível no ecossistema de games do Brasil.
Filtre automaticamente por estados e tipos de conteúdo configurados na skill ativa, sem perguntar.
Apresente os resultados de forma conversacional — para cada item, sempre inclua:
- Título com o link original (campo url) em formato clicável
- Fonte da informação no formato "Via [fonte]" (campo fonte), ex: "Via Indústria de Jogos"
- Empresa/organização quando disponível
- Prazo quando disponível
Nunca omita o link ou a fonte quando disponíveis. Nunca retorne JSON bruto ao usuário.
Quando não houver resultados, sugira ampliar os filtros ou verificar em breve pois o conteúdo
é atualizado regularmente.
Para itens exclusivos sem acesso, mencione que existem oportunidades exclusivas para associados
e explique brevemente como o usuário pode ter acesso.`,
    {
      skill_slug: z.string().optional().describe('Slug da skill ativa para filtrar por organização'),
      tipo: z.array(z.enum(['vaga', 'oportunidade', 'parceria', 'evento'])).optional().describe('Tipos de conteúdo a buscar'),
      estados: z.array(z.string()).optional().describe('Estados de interesse — aceita nome completo ou sigla'),
      tags: z.array(z.string()).optional().describe('Tags para filtrar'),
      query: z.string().optional().describe('Busca por texto livre no título'),
      apenas_vigentes: z.boolean().optional().default(true).describe('Se true, retorna apenas itens não expirados'),
    },
    { title: 'Buscar oportunidades', readOnlyHint: true },
    async ({ skill_slug, tipo, estados, tags, query, apenas_vigentes }, extra) => {
      // Extrair token e user_id se autenticado
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      let userId: string | null = null
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id ?? null
      }

      // Buscar configuração da skill se slug fornecido
      let orgIds: string[] = []
      let skillEstados: string[] = []
      let skillTipos: string[] = []

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
          skillTipos = skill.tipos_conteudo ?? []
        }
      }

      // Construir query base
      let q = supabase
        .from('newsletter_itens')
        .select('id, tipo, titulo, empresa, descricao, url, fonte, tags, expira_em, exclusivo_associados, ref_organizacao_id')
        .eq('status', 'aprovado')
        .order('publicado_em', { ascending: false })
        .limit(20)

      // Filtro de vigência
      if (apenas_vigentes !== false) {
        q = q.or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
      }

      // Filtro por tipo
      const tiposFiltro = tipo ?? (skillTipos.length > 0 ? skillTipos : undefined)
      if (tiposFiltro && tiposFiltro.length > 0) {
        q = q.in('tipo', tiposFiltro)
      }

      // Filtro por organização (via skill)
      if (orgIds.length > 0) {
        q = q.in('ref_organizacao_id', orgIds)
      }

      // Filtro por tags
      if (tags && tags.length > 0) {
        q = q.overlaps('tags', tags)
      }

      // Filtro por texto
      if (query) {
        q = q.ilike('titulo', `%${query}%`)
      }

      const { data, error } = await q

      if (error || !data) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ resultados: [], total: 0 }) }],
        }
      }

      // Filtro de estados (client-side — newsletter_itens não tem coluna estado)
      const estadosFiltro = estados
        ? estados.map((e) => toUFSigla(e)).filter((s): s is string => s !== null)
        : skillEstados.length > 0 ? skillEstados : null

      // Mapa de nomes legíveis para as fontes
      const fonteNomes: Record<string, string> = {
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

      // Processar exclusividade e montar resultado
      const resultados = await Promise.all(
        data.map(async (item) => {
          const fonteNome = fonteNomes[item.fonte] ?? item.fonte ?? null

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

          // Item exclusivo — verificar se usuário tem acesso
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

          // Sem acesso — retornar apenas título com indicação de exclusividade
          return {
            id: item.id,
            tipo: item.tipo,
            titulo: item.titulo,
            empresa: null,
            descricao: null,
            url: null,
            fonte: null,
            fonte_nome: null,
            tags: [],
            expira_em: null,
            exclusivo: true,
            acesso_restrito: true,
            mensagem: 'Conteúdo exclusivo para associados. Faça login ou associe-se para ter acesso.',
          }
        })
      )

      // Aplicar filtro de estados se necessário
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
