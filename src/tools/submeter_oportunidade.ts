import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { supabaseAsUser } from '../lib/supabase.js'
import { toUFSigla } from '../lib/uf-map.js'

function erroAuth(mensagem: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ sucesso: false, erro: mensagem }) }],
    isError: true,
  }
}

function erroPermissao(mensagem: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ sucesso: false, erro: mensagem }) }],
    isError: true,
  }
}

function erroUrl(mensagem: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ sucesso: false, erro: mensagem }) }],
    isError: true,
  }
}

function validarUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'URL inválida. Verifique o formato do link.'
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'URL inválida. Use apenas links http ou https.'
  }

  const hostname = parsed.hostname.toLowerCase()

  const hostsInternos = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1']
  if (hostsInternos.includes(hostname)) {
    return 'URL inválida. Links para redes internas não são permitidos.'
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return 'URL inválida. Links para redes internas não são permitidos.'
  }

  const ipPrivado = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname)
  if (ipPrivado) {
    return 'URL inválida. Links para redes internas não são permitidos.'
  }

  return null // null = válida
}

export function registerSubmeterOportunidade(server: McpServer): void {
  server.tool(
    'submeter_oportunidade',
    `Submete uma nova oportunidade, edital, evento ou parceria para revisão na Matchmaking.
Use esta tool quando um representante de organização parceira quiser publicar conteúdo.
O conteúdo enviado sempre entra como pendente e passa por moderação antes de ser publicado —
isso é intencional e não pode ser alterado.
Confirme com o usuário os dados antes de submeter. Após submeter, informe que o conteúdo
será revisado pela equipe da Matchmaking e publicado em breve.
Nunca submeta conteúdo sem que o usuário tenha confirmado os dados.
Se o usuário não estiver autenticado ou não pertencer a uma organização com skill ativa,
explique o motivo de forma clara e direcione para matchmaking.games.`,
    {
      titulo: z.string().describe('Título da oportunidade'),
      tipo: z.enum(['vaga', 'oportunidade', 'parceria', 'evento']).describe('Tipo do conteúdo'),
      url: z.string().url().describe('Link oficial da oportunidade'),
      descricao: z.string().optional().describe('Descrição da oportunidade'),
      empresa: z.string().optional().describe('Nome da empresa ou organização'),
      tags: z.array(z.string()).optional().describe('Tags para categorização'),
      estados: z.array(z.string()).optional().describe('Estados relacionados — aceita nome completo ou sigla'),
      expira_em: z.string().optional().describe('Data de expiração em formato ISO 8601'),
    },
    { title: 'Submeter oportunidade', destructiveHint: true },
    async ({ titulo, tipo, url, descricao, empresa, tags, estados, expira_em }, extra) => {
      // Extrair JWT
      const headers = extra?.requestInfo?.headers as Record<string, string> | undefined
      const authHeader = headers?.['authorization'] ?? ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()

      if (!token) {
        return erroAuth('Autenticação necessária. Faça login em matchmaking.games para submeter conteúdo.')
      }

      const client = supabaseAsUser(token)
      const { data: { user }, error: authError } = await client.auth.getUser()

      if (authError || !user) {
        return erroAuth('Token inválido ou expirado. Faça login novamente em matchmaking.games.')
      }

      // Verificar se é membro ativo de alguma organização
      const { data: membros, error: membrosError } = await supabase
        .from('organizacao_membros')
        .select('organizacao_id')
        .eq('user_id', user.id)
        .eq('ativo', true)

      if (membrosError || !membros || membros.length === 0) {
        return erroPermissao('Sua conta não está vinculada a nenhuma organização. Entre em contato com a Matchmaking para mais informações.')
      }

      // Verificar se alguma dessas organizações tem skill ativa
      const orgIds = membros.map((m) => m.organizacao_id)

      const { data: skills, error: skillsError } = await supabase
        .from('mcp_skill_config')
        .select('organizacao_id')
        .eq('ativo', true)
        .in('organizacao_id', orgIds)

      if (skillsError || !skills || skills.length === 0) {
        return erroPermissao('Sua organização não tem uma skill ativa na Matchmaking. Entre em contato com a equipe da Matchmaking para ativar.')
      }

      const organizacaoId = skills[0].organizacao_id

      // Validar URL — bloquear protocolos inválidos e hosts internos
      const erroDeUrl = validarUrl(url)
      if (erroDeUrl) {
        return erroUrl(erroDeUrl)
      }

      // Normalizar estados para siglas
      const tagsFinal = [...(tags ?? [])]
      if (estados && estados.length > 0) {
        const siglas = estados
          .map((e) => toUFSigla(e))
          .filter((s): s is string => s !== null)
        tagsFinal.push(...siglas)
      }

      // Inserir com status pendente — NUNCA publicar direto
      const { data: inserido, error: insertError } = await supabase
        .from('newsletter_itens')
        .insert({
          titulo,
          tipo,
          url,
          descricao: descricao ?? null,
          empresa: empresa ?? null,
          tags: tagsFinal,
          ref_organizacao_id: organizacaoId,
          exclusivo_associados: false,
          status: 'pendente',
          fonte: 'plataforma_parceria',
          expira_em: expira_em ?? null,
        })
        .select('id')
        .single()

      if (insertError) {
        // URL duplicada é o erro mais comum
        if (insertError.code === '23505') {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                sucesso: false,
                erro: 'Esta URL já foi submetida anteriormente. Verifique se o conteúdo já está na plataforma.',
              }),
            }],
            isError: true,
          }
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              sucesso: false,
              erro: 'Erro ao submeter o conteúdo. Tente novamente em instantes.',
            }),
          }],
          isError: true,
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            sucesso: true,
            id: inserido?.id ?? null,
            mensagem: 'Conteúdo submetido com sucesso! Ele será revisado pela equipe da Matchmaking e publicado em breve.',
          }),
        }],
      }
    }
  )
}
