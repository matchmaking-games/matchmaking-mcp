import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabase, supabaseAsUser } from '../lib/supabase.js'
import { toUFNome } from '../lib/uf-map.js'

interface TipoFuncaoRow { nome: string }
interface VagaTipoFuncaoRow { tipos_funcao: TipoFuncaoRow | TipoFuncaoRow[] | null }
interface EstudioRow { nome: string }

type VagaUnificada = {
  id: string
  titulo: string
  estudio: string | null
  empresa: string | null
  nivel: string | null
  remoto: string | null
  estado: string | null
  areas: string[]
  descricao_resumida: string | null
  url_candidatura: string | null
  fonte: string | null
  fonte_nome: string | null
  criada_em: string | null
}

const FONTE_NOMES: Record<string, string> = {
  wildlifestudios: 'Wildlife Studios',
  epicgames: 'Epic Games Brasil',
  fanatee: 'Fanatee',
  gazeus: 'Gazeus Games',
  idj: 'Indústria de Jogos',
  linkedin: 'LinkedIn',
  workable: 'Workable',
  plataforma_vaga: 'Matchmaking',
}

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

export function registerBuscarVagasParaMim(server: McpServer): void {
  server.tool(
    'buscar_vagas_para_mim',
    `Busca vagas de emprego personalizadas com base no perfil do usuário autenticado.
Usa automaticamente o estado e as habilidades cadastradas na Matchmaking para
filtrar vagas relevantes — sem precisar perguntar nada ao usuário.
Cobre tanto vagas da plataforma quanto vagas externas (Wildlife, Epic, Fanatee, Gazeus).
Requer login. Se não estiver autenticado, informe que é necessário fazer login em
matchmaking.games e sugira usar buscar_vagas para ver o catálogo sem personalização.
Se a resposta contiver requer_autenticacao: true, peça ao usuário que faça login.
Apresente os resultados de forma conversacional, destacando por que cada vaga é
relevante para o perfil — mencione a habilidade ou área que combina com a vaga.
Se não encontrar vagas compatíveis com o perfil, informe e sugira:
- Completar o perfil com mais habilidades em matchmaking.games
- Usar buscar_vagas sem filtros para ver o catálogo completo`,
    {},
    { title: 'Vagas para o meu perfil', readOnlyHint: true },
    async (_args, extra) => {
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      if (!token) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              requer_autenticacao: true,
              mensagem: 'Para buscar vagas personalizadas, faça login em matchmaking.games e reconecte o MCP. Sem login, use buscar_vagas para ver todas as vagas disponíveis.',
              vagas: [],
              total: 0,
            }),
          }],
        }
      }

      const client = supabaseAsUser(token)
      const { data: { user } } = await client.auth.getUser()

      if (!user) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              requer_autenticacao: true,
              mensagem: 'Token inválido ou expirado. Faça login novamente em matchmaking.games.',
              vagas: [],
              total: 0,
            }),
          }],
        }
      }

      // Buscar perfil e habilidades
      const { data: perfil } = await client
        .from('users')
        .select('estado')
        .eq('id', user.id)
        .single()

      const estadoSigla = perfil?.estado ?? null

      const { data: habilidades } = await client
        .from('user_habilidades')
        .select('habilidades ( nome )')
        .eq('user_id', user.id)
        .limit(15)

      const nomesHabilidades: string[] = (habilidades ?? []).flatMap((h: unknown) => {
        const row = h as { habilidades: { nome: string } | { nome: string }[] | null }
        const hab = Array.isArray(row.habilidades) ? row.habilidades[0] : row.habilidades
        return hab?.nome ? [hab.nome] : []
      })

      const agora = new Date().toISOString()

      // ── Query 1: vagas da plataforma ─────────────────────────────────────
      let vq = supabase
        .from('vagas')
        .select(`
          id, titulo, nivel, remoto, estado, criada_em, contato_candidatura, descricao,
          estudios!estudio_id ( nome ),
          vaga_tipos_funcao ( tipos_funcao ( nome ) )
        `)
        .eq('ativa', true)
        .or(`expira_em.is.null,expira_em.gt.${agora}`)
        .order('criada_em', { ascending: false })
        .limit(10)

      if (estadoSigla) vq = vq.eq('estado', estadoSigla)

      const { data: vagasData } = await vq

      const vagasDaPlataforma: VagaUnificada[] = (vagasData ?? [])
        .filter((v) => {
          if (nomesHabilidades.length === 0) return true
          return getAreas(v.vaga_tipos_funcao).some((area) =>
            nomesHabilidades.some((hab) =>
              area.toLowerCase().includes(hab.toLowerCase()) ||
              hab.toLowerCase().includes(area.toLowerCase())
            )
          )
        })
        .map((v) => ({
          id: v.id,
          titulo: v.titulo,
          estudio: getNomeEstudio(v.estudios),
          empresa: null,
          nivel: v.nivel,
          remoto: v.remoto,
          estado: v.estado ? toUFNome(v.estado) : null,
          areas: getAreas(v.vaga_tipos_funcao),
          descricao_resumida: v.descricao ? v.descricao.substring(0, 300) : null,
          url_candidatura: v.contato_candidatura ?? null,
          fonte: 'matchmaking',
          fonte_nome: 'Matchmaking',
          criada_em: v.criada_em ?? null,
        }))

      // ── Query 2: newsletter_itens tipo='vaga' (portais externos) ─────────
      let nq = supabase
        .from('newsletter_itens')
        .select('id, titulo, empresa, descricao, url, fonte, tags, criado_em')
        .eq('status', 'aprovado')
        .eq('tipo', 'vaga')
        .or(`expira_em.is.null,expira_em.gt.${agora}`)
        .order('publicado_em', { ascending: false })
        .limit(10)

      if (nomesHabilidades.length > 0) {
        nq = nq.overlaps('tags', nomesHabilidades.map((n) => n.toLowerCase()))
      }

      const { data: newsData } = await nq

      const vagasExternas: VagaUnificada[] = (newsData ?? []).map((item) => ({
        id: item.id,
        titulo: item.titulo,
        estudio: null,
        empresa: item.empresa ?? null,
        nivel: null,
        remoto: null,
        estado: null,
        areas: item.tags ?? [],
        descricao_resumida: item.descricao ? item.descricao.substring(0, 300) : null,
        url_candidatura: item.url,
        fonte: item.fonte ?? null,
        fonte_nome: item.fonte ? (FONTE_NOMES[item.fonte] ?? item.fonte) : null,
        criada_em: item.criado_em ?? null,
      }))

      // ── Mesclar e ordenar ────────────────────────────────────────────────
      const todas: VagaUnificada[] = [...vagasDaPlataforma, ...vagasExternas]
        .sort((a, b) => {
          if (!a.criada_em) return 1
          if (!b.criada_em) return -1
          return b.criada_em.localeCompare(a.criada_em)
        })
        .slice(0, 20)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            vagas: todas,
            total: todas.length,
            personalizado: true,
            estado_filtrado: estadoSigla ? toUFNome(estadoSigla) : null,
            habilidades_usadas: nomesHabilidades,
          }),
        }],
      }
    }
  )
}
