import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { toUFSigla, toUFNome } from '../lib/uf-map.js'

// Interfaces para JOINs aninhados — mesmas da versão anterior
interface TipoFuncaoRow { nome: string }
interface VagaTipoFuncaoRow { tipos_funcao: TipoFuncaoRow | TipoFuncaoRow[] | null }
interface EstudioRow { nome: string }

// Tipo unificado para vagas de qualquer fonte
type VagaUnificada = {
  id: string
  titulo: string
  estudio: string | null      // só para vagas da plataforma
  empresa: string | null      // só para vagas externas (newsletter_itens)
  nivel: string | null        // só para vagas da plataforma
  remoto: string | null       // só para vagas da plataforma
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
  gamingera: 'The Gaming Era',
  gogamers: 'GoGamers',
  linkedin: 'LinkedIn',
  workable: 'Workable',
  plataforma_vaga: 'Matchmaking',
}

export function registerBuscarVagas(server: McpServer): void {
  server.tool(
    'buscar_vagas',
    `Busca todas as vagas de emprego abertas na indústria de games brasileira.
Inclui vagas de estúdios cadastrados diretamente na plataforma Matchmaking
e vagas coletadas automaticamente de portais externos como Greenhouse (Wildlife Studios,
Epic Games Brasil), Lever (Fanatee) e Workable (Gazeus Games).
Use sempre que o usuário perguntar sobre vagas, empregos, trabalho ou oportunidades de carreira.
Apresente os resultados de forma conversacional — título, empresa ou estúdio, nível quando
disponível, modalidade e link para candidatura. Nunca retorne JSON bruto.
Se não encontrar resultados com os filtros dados, tente ampliar:
- Remova o filtro de estado (a maioria das vagas externas não tem estado cadastrado)
- Remova o filtro de nível (só funciona para vagas da plataforma)
- Tente buscar sem filtros para ver o catálogo completo
Se o usuário estiver logado na Matchmaking, sugira buscar_vagas_para_mim para
resultados personalizados com base no perfil dele.`,
    {
      estado: z.string().optional().describe('Estado de interesse — aceita nome completo ou sigla. Atenção: vagas externas podem não ter estado cadastrado'),
      area: z.string().optional().describe('Área ou função. Ex: "programação", "arte", "design", "produção", "narrativa"'),
      nivel: z.enum(['iniciante', 'junior', 'pleno', 'senior', 'lead']).optional().describe('Nível da vaga — só aplicado a vagas da plataforma'),
      remoto: z.boolean().optional().describe('true para remotas, false para presenciais — só aplicado a vagas da plataforma'),
      query: z.string().optional().describe('Busca por texto livre no título'),
    },
    { title: 'Buscar vagas', readOnlyHint: true },
    async ({ estado, area, nivel, remoto, query }) => {
      const estadoSigla = estado ? toUFSigla(estado) : null
      const agora = new Date().toISOString()

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

      // ── Query 1: tabela vagas (estúdios cadastrados na Matchmaking) ──────
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
        .limit(15)

      if (estadoSigla) vq = vq.eq('estado', estadoSigla)
      if (nivel) vq = vq.eq('nivel', nivel)
      if (remoto === true) vq = vq.eq('remoto', 'remoto')
      else if (remoto === false) vq = vq.neq('remoto', 'remoto')
      if (query) vq = vq.ilike('titulo', `%${query}%`)

      const { data: vagasData } = await vq

      const vagasFiltradas = (vagasData ?? []).filter((v) => {
        if (!area) return true
        return getAreas(v.vaga_tipos_funcao).some((n) =>
          n.toLowerCase().includes(area.toLowerCase())
        )
      })

      const vagasDaPlataforma: VagaUnificada[] = vagasFiltradas.map((v) => ({
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
        .limit(15)

      if (query) nq = nq.ilike('titulo', `%${query}%`)

      const { data: newsData } = await nq

      const vagasExternas: VagaUnificada[] = (newsData ?? [])
        .filter((item) => {
          // Filtro por área via tags
          if (area) {
            const temArea = (item.tags ?? []).some((tag: string) =>
              tag.toLowerCase().includes(area.toLowerCase())
            )
            if (!temArea) return false
          }
          // Filtro por estado via tags (aproximado)
          if (estadoSigla) {
            const temEstado = (item.tags ?? []).some((tag: string) =>
              tag.toUpperCase() === estadoSigla
            )
            if (!temEstado) return false
          }
          return true
        })
        .map((item) => ({
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

      // ── Mesclar, ordenar por data e limitar ──────────────────────────────
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
          text: JSON.stringify({ vagas: todas, total: todas.length }),
        }],
      }
    }
  )
}
