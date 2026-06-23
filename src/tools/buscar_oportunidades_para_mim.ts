import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabaseAsUser } from '../lib/supabase.js'
import { toUFSigla } from '../lib/uf-map.js'
import { verificarAssociado } from './verificar_associado.js'
import { supabase } from '../lib/supabase.js'

export function registerBuscarOportunidadesParaMim(server: McpServer): void {
  server.tool(
    'buscar_oportunidades_para_mim',
    `Busca oportunidades personalizadas com base no perfil do usuário autenticado.
Se o usuário estiver autenticado, usa automaticamente seu estado, habilidades e preferências
cadastradas na Matchmaking — sem precisar perguntar nada.
Se não estiver autenticado, usa o contexto anônimo fornecido como filtro.
Apresente os resultados de forma conversacional, destacando por que cada oportunidade
é relevante para o perfil do usuário. Para cada item, sempre inclua:
- Título com o link original (campo url) em formato clicável
- Fonte da informação no formato "Via [fonte]" (campo fonte_nome), ex: "Via Indústria de Jogos"
- Prazo quando disponível
Nunca omita o link ou a fonte quando disponíveis. Nunca retorne JSON bruto ao usuário.
Quando não houver resultados compatíveis, sugira atualizar o perfil ou ampliar os critérios.`,
    {
      skill_slug: z.string().optional().describe('Slug da skill ativa para filtrar por organização'),
      tipo: z.array(z.enum(['vaga', 'oportunidade', 'parceria', 'evento'])).optional(),
      contexto_anonimo: z.object({
        estado: z.string().optional(),
        area: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }).optional().describe('Usado apenas quando o usuário não está autenticado'),
    },
    { title: 'Buscar oportunidades para mim', readOnlyHint: true },
    async ({ skill_slug, tipo, contexto_anonimo }, extra) => {
      // Extrair token
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      let userId: string | null = null
      let estadoSigla: string | null = null
      let tagsUsuario: string[] = []

      if (token) {
        const client = supabaseAsUser(token)
        const { data: { user } } = await client.auth.getUser()

        if (user) {
          userId = user.id

          // Buscar perfil para derivar filtros
          const { data: perfil } = await client
            .from('users')
            .select('estado, tipo_trabalho_preferido, tipo_contrato_preferido')
            .eq('id', userId)
            .single()

          if (perfil?.estado) estadoSigla = perfil.estado

          // Buscar habilidades para derivar tags
          const { data: habilidades } = await client
            .from('user_habilidades')
            .select('habilidades ( nome )')
            .eq('user_id', userId)
            .limit(10)

          if (habilidades) {
            tagsUsuario = habilidades.flatMap((h: unknown) => {
              const row = h as { habilidades: { nome: string } | { nome: string }[] | null }
              const hab = Array.isArray(row.habilidades) ? row.habilidades[0] : row.habilidades
              return hab?.nome ? [hab.nome.toLowerCase()] : []
            })
          }
        }
      }

      // Se não autenticado, usar contexto anônimo
      if (!userId && contexto_anonimo) {
        if (contexto_anonimo.estado) {
          estadoSigla = toUFSigla(contexto_anonimo.estado)
        }
        if (contexto_anonimo.tags) {
          tagsUsuario = contexto_anonimo.tags
        }
      }

      // Buscar configuração da skill se fornecida
      let orgIds: string[] = []
      let skillTipos: string[] = []

      if (skill_slug) {
        const { data: skill } = await supabase
          .from('mcp_skill_config')
          .select('organizacao_id, tipos_conteudo')
          .eq('slug', skill_slug)
          .eq('ativo', true)
          .single()

        if (skill) {
          orgIds = [skill.organizacao_id]
          skillTipos = skill.tipos_conteudo ?? []
        }
      }

      // Construir query de oportunidades
      let q = supabase
        .from('newsletter_itens')
        .select('id, tipo, titulo, empresa, descricao, url, fonte, tags, expira_em, exclusivo_associados, ref_organizacao_id')
        .eq('status', 'aprovado')
        .or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
        .order('publicado_em', { ascending: false })
        .limit(20)

      const tiposFiltro = tipo ?? (skillTipos.length > 0 ? skillTipos : undefined)
      if (tiposFiltro && tiposFiltro.length > 0) q = q.in('tipo', tiposFiltro)
      if (orgIds.length > 0) q = q.in('ref_organizacao_id', orgIds)
      if (tagsUsuario.length > 0) q = q.overlaps('tags', tagsUsuario)

      const { data, error } = await q

      if (error || !data) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ resultados: [], total: 0 }) }],
        }
      }

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

      // Processar exclusividade
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

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            resultados,
            total: resultados.length,
            personalizado: !!userId,
            estado_filtrado: estadoSigla,
          }),
        }],
      }
    }
  )
}
