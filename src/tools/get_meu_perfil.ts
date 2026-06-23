import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabaseAsUser } from '../lib/supabase.js'
import { toUFNome } from '../lib/uf-map.js'

function erroAuth(mensagem: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ erro: mensagem }) }],
    isError: true,
  }
}

export function registerGetMeuPerfil(server: McpServer): void {
  server.tool(
    'get_meu_perfil',
    `Retorna o perfil completo do usuário autenticado: dados pessoais, habilidades, estúdios
e jogos publicados.
Use esta tool quando o usuário pedir para ver seu perfil, suas informações, suas habilidades
ou quiser saber o que está cadastrado sobre ele na Matchmaking.
Apresente as informações de forma conversacional e humanizada — não liste como JSON bruto.
Nunca expor email, telefone ou qualquer dado de contato privado do usuário.
Se o usuário não estiver autenticado, oriente-o a fazer login em matchmaking.games.`,
    {},
    { title: 'Ver meu perfil', readOnlyHint: true },
    async (_args, extra) => {
      // Extrair JWT do header
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      if (!token) {
        return erroAuth('Autenticação necessária. Faça login em matchmaking.games para usar esta função.')
      }

      const client = supabaseAsUser(token)
      const { data: { user }, error: authError } = await client.auth.getUser()

      if (authError || !user) {
        return erroAuth('Token inválido ou expirado. Faça login novamente em matchmaking.games.')
      }

      const userId = user.id

      // Query 1: perfil do usuário
      const { data: perfil } = await client
        .from('users')
        .select(`
          nome_completo,
          slug,
          titulo_profissional,
          bio_curta,
          estado,
          cidade,
          disponivel_para_trabalho,
          tipo_trabalho_preferido,
          tipo_contrato_preferido
        `)
        .eq('id', userId)
        .single()

      // Query 2: habilidades
      const { data: habilidadesRaw } = await client
        .from('user_habilidades')
        .select(`
          nivel,
          anos_experiencia,
          ordem,
          habilidades ( nome, categoria )
        `)
        .eq('user_id', userId)
        .order('ordem')

      // Query 3: estúdios (apenas membros ativos)
      const { data: estudiosRaw } = await client
        .from('estudio_membros')
        .select(`
          role,
          estudios!estudio_id ( nome, estado, especialidades )
        `)
        .eq('user_id', userId)
        .eq('ativo', true)

      // Query 4: jogos
      const { data: jogosRaw } = await client
        .from('jogos')
        .select('titulo, genero, plataformas, ano_lancamento, status')
        .eq('user_id', userId)
        .order('ordem')

      // Processar habilidades
      interface HabilidadeRow {
        nivel: string
        anos_experiencia: number | null
        habilidades: { nome: string; categoria: string } | { nome: string; categoria: string }[] | null
      }

      const habilidades = (habilidadesRaw ?? []).map((h: unknown) => {
        const row = h as HabilidadeRow
        const hab = Array.isArray(row.habilidades) ? row.habilidades[0] : row.habilidades
        return {
          nome: hab?.nome ?? '',
          categoria: hab?.categoria ?? '',
          nivel: row.nivel,
          anos_experiencia: row.anos_experiencia ?? null,
        }
      }).filter((h) => h.nome)

      // Processar estúdios
      interface EstudioMembroRow {
        role: string
        estudios: { nome: string; estado: string | null; especialidades: string[] | null } |
                  { nome: string; estado: string | null; especialidades: string[] | null }[] | null
      }

      const estudios = (estudiosRaw ?? []).map((e: unknown) => {
        const row = e as EstudioMembroRow
        const est = Array.isArray(row.estudios) ? row.estudios[0] : row.estudios
        return {
          nome: est?.nome ?? '',
          estado: est?.estado ? toUFNome(est.estado) : null,
          especialidades: est?.especialidades ?? [],
          role: row.role,
        }
      }).filter((e) => e.nome)

      // Processar jogos
      const jogos = (jogosRaw ?? []).map((j) => ({
        titulo: j.titulo,
        genero: j.genero ?? [],
        plataformas: j.plataformas ?? [],
        ano_lancamento: j.ano_lancamento ?? null,
        status: j.status,
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            usuario: {
              nome: perfil?.nome_completo ?? null,
              slug: perfil?.slug ?? null,
              titulo_profissional: perfil?.titulo_profissional ?? null,
              bio_curta: perfil?.bio_curta ?? null,
              estado: perfil?.estado ? toUFNome(perfil.estado) : null,
              cidade: perfil?.cidade ?? null,
              disponivel_para_trabalho: perfil?.disponivel_para_trabalho ?? false,
              tipo_trabalho_preferido: perfil?.tipo_trabalho_preferido ?? [],
              tipo_contrato_preferido: perfil?.tipo_contrato_preferido ?? [],
            },
            habilidades,
            estudios,
            jogos,
          }),
        }],
      }
    }
  )
}
