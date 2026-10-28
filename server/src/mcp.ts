// Atende o endereço /mcp: confere o acesso e repassa a conversa às ferramentas.
// Sem sessão guardada no servidor: cada chamada é atendida do zero (cabe na Vercel).
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { extrairToken, type VerificarToken } from './autenticacao.js'
import { criarServidorMcp } from './ferramentas.js'
import { urlDosMetadados } from './metadados.js'
import type { ConsultarVitrine } from './vitrine.js'

export interface DependenciasMcp {
  verificarToken: VerificarToken
  consultarVitrine: ConsultarVitrine
}

export const CABECALHOS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

export function comCors(resposta: Response): Response {
  const cabecalhos = new Headers(resposta.headers)
  for (const [nome, valor] of Object.entries(CABECALHOS_CORS)) cabecalhos.set(nome, valor)
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: cabecalhos })
}

function respostaJson(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): Response {
  return comCors(
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cabecalhos },
    }),
  )
}

// 401 com o endereço dos metadados: é assim que o assistente descobre onde a pessoa entra.
export function respostaNaoAutorizado(request: Request, tokenInvalido: boolean): Response {
  const partes = [`resource_metadata="${urlDosMetadados(request)}"`]
  if (tokenInvalido) partes.push('error="invalid_token"', 'error_description="Acesso expirado ou invalido"')
  return respostaJson(
    401,
    {
      error: tokenInvalido ? 'invalid_token' : 'unauthorized',
      error_description: tokenInvalido ? 'Acesso expirado ou inválido. Conecte de novo.' : 'É preciso entrar para usar este servidor.',
    },
    { 'WWW-Authenticate': `Bearer ${partes.join(', ')}` },
  )
}

export async function tratarRequisicaoMcp(request: Request, dependencias: DependenciasMcp): Promise<Response> {
  if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }))

  const token = extrairToken(request)
  if (!token) return respostaNaoAutorizado(request, false)

  const usuario = await dependencias.verificarToken(token)
  if (!usuario) return respostaNaoAutorizado(request, true)

  // Sem sessão, não há fluxo aberto para GET nem sessão para encerrar com DELETE.
  if (request.method !== 'POST') {
    return respostaJson(405, { error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' })
  }

  const servidor = criarServidorMcp(usuario, token, dependencias.consultarVitrine)
  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await servidor.connect(transporte)
  try {
    const resposta = await transporte.handleRequest(request, {
      authInfo: {
        token,
        clientId: usuario.clientId,
        scopes: usuario.escopos,
        expiresAt: usuario.expiraEm,
        extra: { usuarioId: usuario.id, visitante: usuario.visitante },
      },
    })
    return comCors(resposta)
  } finally {
    await servidor.close()
  }
}
