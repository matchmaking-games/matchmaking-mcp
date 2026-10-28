// Confere o acesso que o Claude, o ChatGPT ou outro assistente apresenta a cada chamada.
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { emissorDoSupabase, type Configuracao } from './config.js'

export interface Usuario {
  id: string
  // Visitante: entrou com "Continuar sem conta" (usuário anônimo do Supabase).
  visitante: boolean
  clientId: string
  escopos: string[]
  expiraEm: number
}

export type VerificarToken = (token: string) => Promise<Usuario | null>

const claimsSchema = z.object({
  iss: z.string(),
  sub: z.string().min(1),
  role: z.literal('authenticated'),
  exp: z.number(),
  // Só acessos emitidos pelo servidor OAuth para um aplicativo conectado têm client_id.
  // Assim, uma sessão do site nunca serve de acesso ao MCP.
  client_id: z.string().min(1),
  is_anonymous: z.boolean().optional(),
  scope: z.string().optional(),
})

export function lerUsuarioDosClaims(claims: unknown, emissor: string): Usuario | null {
  const lido = claimsSchema.safeParse(claims)
  if (!lido.success || lido.data.iss !== emissor) return null
  return {
    id: lido.data.sub,
    visitante: lido.data.is_anonymous === true,
    clientId: lido.data.client_id,
    escopos: (lido.data.scope ?? '').split(' ').filter((escopo) => escopo.length > 0),
    expiraEm: lido.data.exp,
  }
}

// Devolve os claims de um acesso com assinatura e validade conferidas, ou null.
export type ObterClaims = (token: string) => Promise<unknown>

// Qualquer falha ao conferir (acesso malformado, rede, chave) conta como acesso inválido.
export function criarVerificador(obterClaims: ObterClaims, emissor: string): VerificarToken {
  return async (token) => {
    try {
      const claims = await obterClaims(token)
      return claims ? lerUsuarioDosClaims(claims, emissor) : null
    } catch {
      return null
    }
  }
}

// A assinatura e a validade do acesso são conferidas pelo Supabase (chaves públicas do projeto).
export function criarVerificadorSupabase(config: Configuracao): VerificarToken {
  const supabase = createClient(config.supabaseUrl, config.supabaseChavePublica, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  return criarVerificador(async (token) => {
    const { data, error } = await supabase.auth.getClaims(token)
    return error || !data ? null : data.claims
  }, emissorDoSupabase(config))
}

export function extrairToken(request: Request): string | null {
  const encontrado = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  return encontrado?.[1] ?? null
}
