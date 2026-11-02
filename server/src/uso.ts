// Conta cada chamada de ferramenta, sempre com o acesso da própria pessoa e sem o conteúdo da chamada.
import { createClient } from '@supabase/supabase-js'
import type { Configuracao } from './config.js'

// Diz se a pessoa ainda está dentro do limite do dia.
export type RegistrarUso = (token: string, ferramenta: string) => Promise<boolean>

export function criarRegistroDeUso(config: Configuracao): RegistrarUso {
  return async (token, ferramenta) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseChavePublica, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const { data, error } = await supabase.schema('vitrine').rpc('registrar_uso', { p_ferramenta: ferramenta })
    if (error) throw new Error(error.message)
    return data === true
  }
}
