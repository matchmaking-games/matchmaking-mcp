// Confere de fora o que uma pessoa usa para entrar e monta o e-mail de aviso.

export type Buscar = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export async function checarLogin(supabaseUrl: string, buscar: Buscar): Promise<string[]> {
  try {
    const resposta = await buscar(`${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`)
    if (!resposta.ok) return [`O servidor de login do Supabase respondeu ${resposta.status}: ninguém consegue conectar o MCP. Confira em Authentication, OAuth Server.`]
    const corpo = (await resposta.json()) as { registration_endpoint?: unknown }
    if (typeof corpo.registration_endpoint !== 'string') {
      return ['O registro dinâmico do login do Supabase está desligado: o Claude e o ChatGPT não conseguem se registrar. Confira em Authentication, OAuth Server.']
    }
    return []
  } catch (erro) {
    return [`Não consegui consultar o servidor de login do Supabase: ${erro instanceof Error ? erro.message : String(erro)}`]
  }
}

export async function checarServidor(mcpUrl: string, buscar: Buscar): Promise<string[]> {
  try {
    const resposta = await buscar(`${mcpUrl}/api/health`)
    if (!resposta.ok) return [`O servidor do MCP (${mcpUrl}) respondeu ${resposta.status}.`]
    const corpo = (await resposta.json()) as { status?: unknown }
    return corpo.status === 'ok' ? [] : [`O servidor do MCP (${mcpUrl}) não disse que está bem.`]
  } catch (erro) {
    return [`Não consegui consultar o servidor do MCP (${mcpUrl}): ${erro instanceof Error ? erro.message : String(erro)}`]
  }
}

export interface Aviso {
  assunto: string
  texto: string
}

export function montarAviso(ambiente: string, problemas: string[]): Aviso {
  const quantos = problemas.length === 1 ? '1 problema' : `${problemas.length} problemas`
  return {
    assunto: `[Matchmaking MCP] ${quantos} em ${ambiente}`,
    texto: [
      `O vigia do MCP encontrou ${quantos} em ${ambiente}:`,
      '',
      ...problemas.map((problema) => `- ${problema}`),
      '',
      'Peça "mostra o painel" ao Claude para ver os detalhes.',
    ].join('\n'),
  }
}

export interface ConfiguracaoEmail {
  chave: string
  de: string
  para: string
}

export type Postar = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>

// Resend: https://resend.com/docs/api-reference/emails/send-email
export async function enviarAviso(aviso: Aviso, email: ConfiguracaoEmail, postar: Postar): Promise<void> {
  const resposta = await postar('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${email.chave}` },
    body: JSON.stringify({ from: email.de, to: [email.para], subject: aviso.assunto, text: aviso.texto }),
  })
  if (!resposta.ok) throw new Error(`O Resend respondeu ${resposta.status}`)
}
