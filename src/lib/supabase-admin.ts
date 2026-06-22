import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Variáveis de ambiente obrigatórias ausentes: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY'
  )
}

// Cliente com service role key — usar APENAS nos endpoints OAuth para
// escrever em mcp_community_sessions. Nunca usar nas tools do MCP.
export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})
