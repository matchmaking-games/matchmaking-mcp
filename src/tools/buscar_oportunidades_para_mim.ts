import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase, supabaseAsUser } from '../lib/supabase.js'
import { toUFSigla, toUFNome } from '../lib/uf-map.js'
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

// Tipos válidos — vagas são tratadas por buscar_vagas_para_mim
const TIPOS_OPORTUNIDADE = ['oportunidade', 'parceria', 'evento'] as const
type TipoOportunidade = typeof TIPOS_OPORTUNIDADE[number]

export function registerBuscarOportunidadesParaMim(server: McpServer): void {
  server.tool(
    'buscar_oportunidades_para_mim',
    `Busca editais, eventos, game jams e parcerias personalizados com base no perfil do usuário.
NÃO inclui vagas de emprego — para vagas personalizadas, use buscar_vagas_para_mim.
Se autenticado, usa automaticamente o estado e habilidades do perfil da Matchmaking.
Se não autenticado, usa o contexto anônimo fornecido como filtro.
Apresente os resultados de forma conversacional, explicando por que cada item é relevante
para o perfil. Para cada item inclua: título com link clicável, fonte ("Via [fonte]"),
empresa ou organização quando disponível e prazo quando disponível.
Nunca omita o link ou a fonte quando disponíveis. Nunca retorne JSON bruto.
Se a resposta contiver requer_autenticacao: true, informe ao usuário que precisa estar
logado em matchmaking.games para ver oportunidades personalizadas, e sugira usar
buscar_oportunidades para ver o catálogo público.
Nunca apresente resultados genéricos como se fossem personalizados.
Se não encontrar resultados compatíveis, sugira atualizar o perfil em matchmaking.games
ou ampliar os critérios de busca.`,
    {
      skill_slug: z.string().optional().describe('Slug da skill ativa para filtrar por organização'),
      tipo: z.array(z.enum(['oportunidade', 'parceria', 'evento'])).optional().describe('Tipos a buscar — editais, parcerias ou eventos'),
      contexto_anonimo: z.object({
        estado: z.string().optional(),
        area: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }).optional().describe('Usado apenas quando o usuário não está autenticado'),
    },
    { title: 'Oportunidades para mim', readOnlyHint: true },
    async ({ skill_slug, tipo, contexto_anonimo }, extra) => {
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      let userId: string | null = null
      let estadoSigla: string | null = null
      let tagsUsuario: string[] = []

      // ── Autenticação ─────────────────────────────────────────────────────
      if (token) {
        const client = supabaseAsUser(token)
        const { data: { user } } = await client.auth.getUser()

        if (user) {
          userId = user.id

          const { data: perfil } = await client
            .from('users')
            .select('estado')
            .eq('id', userId)
            .single()

          if (perfil?.estado) estadoSigla = perfil.estado

          const { data: habilidades } = await client
            .from('user_habilidades')
            .select('habilidades ( nome )')
            .eq('user_id', userId)
            .limit(15)

          if (habilidades) {
            tagsUsuario = habilidades.flatMap((h: unknown) => {
              const row = h as { habilidades: { nome: string } | { nome: string }[] | null }
              const hab = Array.isArray(row.habilidades) ? row.habilidades[0] : row.habilidades
              return hab?.nome ? [hab.nome.toLowerCase()] : []
            })
          }
        }
      }

      // ── Sem token: verificar contexto anônimo ────────────────────────────
      if (!userId) {
        const temContexto =
          contexto_anonimo?.estado ||
          contexto_anonimo?.area ||
          (contexto_anonimo?.tags && contexto_anonimo.tags.length > 0)

        if (!temContexto) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                requer_autenticacao: true,
                mensagem: 'Para buscar oportunidades personalizadas, faça login em matchmaking.games e reconecte o MCP. Sem login, use buscar_oportunidades para ver o catálogo geral.',
                resultados: [],
                total: 0,
                personalizado: false,
              }),
            }],
          }
        }

        if (contexto_anonimo?.estado) estadoSigla = toUFSigla(contexto_anonimo.estado)
        if (contexto_anonimo?.tags) tagsUsuario = contexto_anonimo.tags
        if (contexto_anonimo?.area) tagsUsuario = [...tagsUsuario, contexto_anonimo.area.toLowerCase()]
      }

      // ── Skill config ─────────────────────────────────────────────────────
      let orgIds: string[] = []
      let skillTipos: TipoOportunidade[] = []

      if (skill_slug) {
        const { data: skill } = await supabase
          .from('mcp_skill_config')
          .select('organizacao_id, tipos_conteudo')
          .eq('slug', skill_slug)
          .eq('ativo', true)
          .single()

        if (skill) {
          orgIds = [skill.organizacao_id]
          skillTipos = (skill.tipos_conteudo ?? []).filter(
            (t: string): t is TipoOportunidade => TIPOS_OPORTUNIDADE.includes(t as TipoOportunidade)
          )
        }
      }

      // Tipos a buscar — nunca inclui 'vaga'
      const tiposFiltro: TipoOportunidade[] = tipo?.length
        ? tipo
        : skillTipos.length > 0
          ? skillTipos
          : [...TIPOS_OPORTUNIDADE]

      // ── Query newsletter_itens ───────────────────────────────────────────
      let q = supabase
        .from('newsletter_itens')
        .select('id, tipo, titulo, empresa, descricao, url, fonte, tags, expira_em, exclusivo_associados, ref_organizacao_id')
        .eq('status', 'aprovado')
        .in('tipo', tiposFiltro)
        .or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
        .order('publicado_em', { ascending: false })
        .limit(20)

      if (orgIds.length > 0) q = q.in('ref_organizacao_id', orgIds)
      if (tagsUsuario.length > 0) q = q.overlaps('tags', tagsUsuario)

      const { data: newsData, error: newsError } = await q

      if (newsError || !newsData) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ resultados: [], total: 0, personalizado: !!userId }) }],
        }
      }

      // ── Processar exclusividade ──────────────────────────────────────────
      const resultados = await Promise.all(
        newsData.map(async (item) => {
          const fonteNome = FONTE_NOMES[item.fonte] ?? item.fonte ?? null

          if (!item.exclusivo_associados) {
            return {
              id: item.id, tipo: item.tipo, titulo: item.titulo,
              empresa: item.empresa ?? null,
              descricao: item.descricao ? item.descricao.substring(0, 300) : null,
              url: item.url, fonte: item.fonte ?? null, fonte_nome: fonteNome,
              tags: item.tags ?? [], expira_em: item.expira_em ?? null,
              exclusivo: false,
            }
          }

          if (token && userId && item.ref_organizacao_id) {
            const temAcesso = await verificarAssociado(token, userId, item.ref_organizacao_id)
            if (temAcesso) {
              return {
                id: item.id, tipo: item.tipo, titulo: item.titulo,
                empresa: item.empresa ?? null,
                descricao: item.descricao ? item.descricao.substring(0, 300) : null,
                url: item.url, fonte: item.fonte ?? null, fonte_nome: fonteNome,
                tags: item.tags ?? [], expira_em: item.expira_em ?? null,
                exclusivo: true,
              }
            }
          }

          return {
            id: item.id, tipo: item.tipo, titulo: item.titulo,
            empresa: null, descricao: null, url: null,
            fonte: null as string | null, fonte_nome: null as string | null,
            tags: [], expira_em: null, exclusivo: true, acesso_restrito: true,
            mensagem: 'Conteúdo exclusivo para associados. Faça login ou associe-se para ter acesso.',
          }
        })
      )

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            resultados,
            total: resultados.length,
            personalizado: !!userId,
            estado_filtrado: estadoSigla ? toUFNome(estadoSigla) : null,
          }),
        }],
      }
    }
  )
}
