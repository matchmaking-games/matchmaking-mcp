// Metadados do recurso protegido (RFC 9728): dizem ao assistente onde a pessoa entra.
import { emissorDoSupabase, type Configuracao } from './config.js'

export const CAMINHO_MCP = '/mcp'
export const CAMINHO_METADADOS = '/.well-known/oauth-protected-resource'

// Endereço público pelo qual o assistente chegou ao servidor.
export function origemPublica(request: Request): string {
  const url = new URL(request.url)
  const primeiro = (valor: string | null) => valor?.split(',')[0]?.trim() || null
  const host = primeiro(request.headers.get('x-forwarded-host')) ?? url.host
  const protocolo = primeiro(request.headers.get('x-forwarded-proto')) ?? url.protocol.replace(':', '')
  return `${protocolo}://${host}`
}

export function urlDoRecurso(request: Request): string {
  return `${origemPublica(request)}${CAMINHO_MCP}`
}

export function urlDosMetadados(request: Request): string {
  return `${origemPublica(request)}${CAMINHO_METADADOS}`
}

export function metadadosDoRecurso(request: Request, config: Configuracao) {
  return {
    resource: urlDoRecurso(request),
    authorization_servers: [emissorDoSupabase(config)],
    bearer_methods_supported: ['header'],
    resource_name: 'Matchmaking',
    resource_documentation: 'https://github.com/matchmaking-games/matchmaking-mcp',
  }
}
