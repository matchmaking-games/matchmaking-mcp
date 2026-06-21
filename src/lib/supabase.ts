import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis de ambiente obrigatórias ausentes: SUPABASE_URL e SUPABASE_ANON_KEY'
  )
}

/**
 * Cliente público — usa anon key, respeita RLS.
 * Usar para todas as tools públicas (sem autenticação).
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Cliente autenticado com JWT do usuário.
 * Usar para tools que requerem identidade do usuário logado.
 */
export function supabaseAsUser(token: string) {
  return createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
