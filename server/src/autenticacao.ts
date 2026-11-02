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

// `publico`: o endereço deste servidor. O acesso precisa ter sido emitido para ele.
export type VerificarToken = (token: string, publico: string) => Promise<Usuario | null>

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1),
  role: z.literal('authenticated'),
  exp: z.number(),
  // Só acessos emitidos pelo servidor OAuth para um aplicativo conectado têm client_id.
  // Assim, uma sessão do site nunca serve de acesso ao MCP.
  client_id: z.string().min(1),
  is_anonymous: z.boolean().optional(),
  // Métodos de login usados na sessão; o visitante entra pelo método "anonymous".
  amr: z.array(z.union([z.string(), z.object({ method: z.string() })])).optional(),
  scope: z.string().optional(),
})

export function lerUsuarioDosClaims(claims: unknown, emissor: string, publico: string): Usuario | null {
  const lido = claimsSchema.safeParse(claims)
  if (!lido.success || lido.data.iss !== emissor) return null
  if (![lido.data.aud].flat().includes(publico)) return null
  const metodos = (lido.data.amr ?? []).map((entrada) => (typeof entrada === 'string' ? entrada : entrada.method))
  return {
    id: lido.data.sub,
    visitante: lido.data.is_anonymous === true || metodos.includes('anonymous'),
    clientId: lido.data.client_id,
    escopos: (lido.data.scope ?? '').split(' ').filter((escopo) => escopo.length > 0),
    expiraEm: lido.data.exp,
  }
}

// Devolve os claims de um acesso com assinatura e validade conferidas, ou null.
export type ObterClaims = (token: string) => Promise<unknown>

// Qualquer falha ao conferir (acesso malformado, rede, chave) conta como acesso inválido.
export function criarVerificador(obterClaims: ObterClaims, emissor: string): VerificarToken {
  return async (token, publico) => {
    try {
      const claims = await obterClaims(token)
      return claims ? lerUsuarioDosClaims(claims, emissor, publico) : null
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
