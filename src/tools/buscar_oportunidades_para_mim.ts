import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase, supabaseAsUser } from '../lib/supabase.js'
import { toUFSigla, toUFNome } from '../lib/uf-map.js'
import { verificarAssociado } from './verificar_associado.js'

// Interfaces para extrair dados dos JOINs aninhados — mesmo padrão de buscar_vagas.ts
interface TipoFuncaoRow { nome: string }
interface VagaTipoFuncaoRow { tipos_funcao: TipoFuncaoRow | TipoFuncaoRow[] | null }
interface EstudioRow { nome: string }

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

// Mapa de nomes legíveis para as fontes
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
Quando não houver resultados compatíveis, sugira atualizar o perfil ou ampliar os critérios.
Se a resposta contiver requer_autenticacao: true, informe ao usuário que precisa estar
logado em matchmaking.games para ver oportunidades personalizadas, e sugira usar
buscar_oportunidades para ver o catálogo público enquanto isso.
Nunca apresente resultados genéricos como se fossem personalizados.
Quando houver vagas_emprego na resposta, apresente-as separadamente como
"Vagas de emprego para o seu perfil", com título, estúdio, nível e link para candidatura.`,
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
      // ── 1. Extrair token ─────────────────────────────────────────────────
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      let userId: string | null = null
      let estadoSigla: string | null = null
      let tagsUsuario: string[] = []
      let nomesHabilidades: string[] = []

      // ── 2. Tentar autenticar ─────────────────────────────────────────────
      if (token) {
        const client = supabaseAsUser(token)
        const { data: { user } } = await client.auth.getUser()

        if (user) {
          userId = user.id

          // Buscar estado do perfil
          const { data: perfil } = await client
            .from('users')
            .select('estado, tipo_trabalho_preferido, tipo_contrato_preferido')
            .eq('id', userId)
            .single()

          if (perfil?.estado) estadoSigla = perfil.estado

          // Buscar habilidades para filtrar newsletter_itens por tags
          // e vagas por área (tipos_funcao)
          const { data: habilidades } = await client
            .from('user_habilidades')
            .select('habilidades ( nome )')
            .eq('user_id', userId)
            .limit(15)

          if (habilidades) {
            nomesHabilidades = habilidades.flatMap((h: unknown) => {
              const row = h as { habilidades: { nome: string } | { nome: string }[] | null }
              const hab = Array.isArray(row.habilidades) ? row.habilidades[0] : row.habilidades
              return hab?.nome ? [hab.nome] : []
            })
            tagsUsuario = nomesHabilidades.map((n) => n.toLowerCase())
          }
        }
      }

      // ── 3. Sem token: usar contexto anônimo ou pedir autenticação ────────
      if (!userId) {
        const temContexto =
          contexto_anonimo?.estado ||
          contexto_anonimo?.area ||
          (contexto_anonimo?.tags && contexto_anonimo.tags.length > 0)

        if (!temContexto) {
          // Sem token e sem contexto — não há como personalizar
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                requer_autenticacao: true,
                mensagem: 'Para buscar oportunidades personalizadas, faça login em matchmaking.games e reconecte o MCP. Sem login, você ainda pode usar buscar_oportunidades para ver o catálogo geral.',
                resultados: [],
                vagas_emprego: [],
                total: 0,
                personalizado: false,
              }),
            }],
          }
        }

        // Usar contexto anônimo como filtros
        if (contexto_anonimo?.estado) {
          estadoSigla = toUFSigla(contexto_anonimo.estado)
        }
        if (contexto_anonimo?.tags) {
          tagsUsuario = contexto_anonimo.tags
        }
        // area também vira tag de busca para filtrar newsletter_itens
        if (contexto_anonimo?.area) {
          tagsUsuario = [...tagsUsuario, contexto_anonimo.area.toLowerCase()]
        }
      }

      // ── 4. Buscar configuração da skill se fornecida ─────────────────────
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

      // ── 5. Query de newsletter_itens (oportunidades, editais, eventos) ───
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

      const { data: newsData, error: newsError } = await q

      // ── 6. Query de vagas da plataforma (quando autenticado) ─────────────
      // Usa as habilidades do perfil para filtrar por área (client-side,
      // mesmo padrão de buscar_vagas.ts)
      let vagasEmprego: Record<string, unknown>[] = []

      if (userId) {
        let vq = supabase
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
          .limit(10)

        // Filtro geográfico pelo estado do perfil
        if (estadoSigla) vq = vq.eq('estado', estadoSigla)

        const { data: vagasData } = await vq

        if (vagasData) {
          // Filtro client-side por área (mesmo padrão de buscar_vagas.ts)
          const vagasFiltradas = nomesHabilidades.length > 0
            ? vagasData.filter((v) =>
                getAreas(v.vaga_tipos_funcao).some((area) =>
                  nomesHabilidades.some((hab) =>
                    area.toLowerCase().includes(hab.toLowerCase()) ||
                    hab.toLowerCase().includes(area.toLowerCase())
                  )
                )
              )
            : vagasData  // sem habilidades: retorna todas do estado

          vagasEmprego = vagasFiltradas.map((v) => ({
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
        }
      }

      // ── 7. Processar resultados de newsletter_itens ──────────────────────
      const resultados = newsError || !newsData
        ? []
        : await Promise.all(
            newsData.map(async (item) => {
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

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            resultados,
            vagas_emprego: vagasEmprego,
            total: resultados.length + vagasEmprego.length,
            personalizado: !!userId,
            estado_filtrado: estadoSigla ? toUFNome(estadoSigla) : null,
          }),
        }],
      }
    }
  )
}
