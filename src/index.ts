import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { supabaseAdmin } from './lib/supabase-admin.js'
import { registerGetContextoSkill } from './tools/get_contexto_skill.js'
import { registerListarSkills } from './tools/listar_skills.js'
import { registerBuscarOportunidades } from './tools/buscar_oportunidades.js'
import { registerBuscarVagas } from './tools/buscar_vagas.js'
import { registerGetMeuPerfil } from './tools/get_meu_perfil.js'
import { registerBuscarOportunidadesParaMim } from './tools/buscar_oportunidades_para_mim.js'
import { registerSubmeterOportunidade } from './tools/submeter_oportunidade.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCORSHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function lerBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => { raw += chunk.toString() })
    req.on('end', () => {
      try {
        const contentType = req.headers['content-type'] ?? ''
        if (contentType.includes('application/json')) {
          resolve(JSON.parse(raw) as Record<string, string>)
        } else {
          resolve(Object.fromEntries(new URLSearchParams(raw)))
        }
      } catch {
        reject(new Error('Body inválido'))
      }
    })
    req.on('error', reject)
  })
}

function urlPath(req: IncomingMessage): string {
  return (req.url ?? '/').split('?')[0]
}

// ---------------------------------------------------------------------------
// Factory: cria nova instância do McpServer por request
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'matchmaking-community-mcp',
    version: '0.1.0',
    description:
      'Servidor MCP comunitário da Matchmaking — vagas, editais, eventos e oportunidades para a indústria de games brasileira.',
  })

  registerGetContextoSkill(server)
  registerListarSkills(server)
  registerBuscarOportunidades(server)
  registerBuscarVagas(server)
  registerGetMeuPerfil(server)
  registerBuscarOportunidadesParaMim(server)
  registerSubmeterOportunidade(server)

  return server
}

// ---------------------------------------------------------------------------
// Endpoints OAuth
// ---------------------------------------------------------------------------

async function handleWellKnown(res: ServerResponse): Promise<void> {
  jsonResponse(res, 200, {
    issuer: 'https://mcp.matchmaking.games',
    authorization_endpoint: 'https://mcp.matchmaking.games/authorize',
    token_endpoint: 'https://mcp.matchmaking.games/token',
    registration_endpoint: 'https://mcp.matchmaking.games/register',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code'],
  })
}

async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await lerBody(req)
  jsonResponse(res, 201, {
    client_id: 'matchmaking-community-mcp-public',
    client_secret: null,
    redirect_uris: body['redirect_uris'] ?? [],
    client_name: body['client_name'] ?? 'Matchmaking Community MCP',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  })
}

async function handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url!, 'https://mcp.matchmaking.games')
  const state = url.searchParams.get('state')
  const codeChallenge = url.searchParams.get('code_challenge')
  const redirectUri = url.searchParams.get('redirect_uri')
  const responseType = url.searchParams.get('response_type')

  if (!state || !codeChallenge || !redirectUri || responseType !== 'code') {
    jsonResponse(res, 400, { error: 'invalid_request', error_description: 'Parâmetros obrigatórios ausentes.' })
    return
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await supabaseAdmin
    .from('mcp_community_sessions')
    .insert({ state, code_challenge: codeChallenge, redirect_uri: redirectUri, expires_at: expiresAt })

  if (error) {
    console.error('Erro ao inserir sessão OAuth:', error)
    jsonResponse(res, 500, { error: 'server_error', error_description: 'Erro ao iniciar sessão.' })
    return
  }

  const mcpAuthUrl = new URL('https://matchmaking.games/mcp-auth')
  mcpAuthUrl.searchParams.set('state', state)
  mcpAuthUrl.searchParams.set('code_challenge', codeChallenge)
  mcpAuthUrl.searchParams.set('redirect_uri', redirectUri)
  mcpAuthUrl.searchParams.set('mcp_mode', 'community')

  res.writeHead(302, { Location: mcpAuthUrl.toString() })
  res.end()
}

async function handleOAuthCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await lerBody(req)
  const { state, user_id, access_token } = body

  if (!state || !user_id || !access_token) {
    jsonResponse(res, 400, { error: 'invalid_request', error_description: 'state, user_id e access_token são obrigatórios.' })
    return
  }

  const { data: sessao, error } = await supabaseAdmin
    .from('mcp_community_sessions')
    .select('*')
    .eq('state', state)
    .is('auth_code', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !sessao) {
    jsonResponse(res, 400, { error: 'invalid_state', error_description: 'State inválido ou expirado.' })
    return
  }

  const authCode = randomUUID()
  const novaExpiracao = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  await supabaseAdmin
    .from('mcp_community_sessions')
    .update({ auth_code: authCode, user_id, access_token, expires_at: novaExpiracao })
    .eq('id', sessao.id)

  const callbackUrl = new URL(sessao.redirect_uri)
  callbackUrl.searchParams.set('code', authCode)
  callbackUrl.searchParams.set('state', state)

  jsonResponse(res, 200, { redirect_url: callbackUrl.toString() })
}

async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await lerBody(req)

  if (body['grant_type'] !== 'authorization_code') {
    jsonResponse(res, 400, { error: 'unsupported_grant_type' })
    return
  }

  const { code, code_verifier } = body

  if (!code || !code_verifier) {
    jsonResponse(res, 400, { error: 'invalid_request', error_description: 'code e code_verifier são obrigatórios.' })
    return
  }

  const { data: sessao, error } = await supabaseAdmin
    .from('mcp_community_sessions')
    .select('*')
    .eq('auth_code', code)
    .is('usado_em', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !sessao) {
    jsonResponse(res, 400, { error: 'invalid_grant', error_description: 'Código inválido ou expirado.' })
    return
  }

  const hash = createHash('sha256').update(code_verifier).digest('base64url')
  if (hash !== sessao.code_challenge) {
    jsonResponse(res, 400, { error: 'invalid_grant', error_description: 'Verificação PKCE falhou.' })
    return
  }

  if (!sessao.access_token) {
    jsonResponse(res, 500, { error: 'server_error', error_description: 'Token de acesso ausente na sessão.' })
    return
  }

  await supabaseAdmin
    .from('mcp_community_sessions')
    .update({ usado_em: new Date().toISOString() })
    .eq('id', sessao.id)

  jsonResponse(res, 200, {
    access_token: sessao.access_token,
    token_type: 'bearer',
    expires_in: 3600,
  })
}

// ---------------------------------------------------------------------------
// Servidor HTTP principal
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000)

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  setCORSHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const path = urlPath(req)

  try {
    if (req.method === 'GET' && path === '/.well-known/oauth-authorization-server') {
      await handleWellKnown(res)
      return
    }
    if (req.method === 'POST' && path === '/register') {
      await handleRegister(req, res)
      return
    }
    if (req.method === 'GET' && path === '/authorize') {
      await handleAuthorize(req, res)
      return
    }
    if (req.method === 'POST' && path === '/oauth/callback') {
      await handleOAuthCallback(req, res)
      return
    }
    if (req.method === 'POST' && path === '/token') {
      await handleToken(req, res)
      return
    }

    // MCP transport — nova instância por request para evitar "Already connected"
    const server = createMcpServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch (err) {
    console.error('Erro no servidor:', err)
    if (!res.headersSent) {
      jsonResponse(res, 500, { error: 'server_error' })
    }
  }
})

httpServer.listen(PORT, () => {
  console.log(`Matchmaking Community MCP rodando na porta ${PORT}`)
})
