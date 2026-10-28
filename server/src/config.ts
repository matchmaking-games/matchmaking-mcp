// Configuração do servidor, lida das variáveis de ambiente da Vercel.
import { z } from 'zod'

const ambienteSchema = z.object({
  SUPABASE_URL: z.url({ protocol: /^https$/ }),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export interface Configuracao {
  supabaseUrl: string
  supabaseChavePublica: string
}

export class ErroConfiguracao extends Error {}

export function lerConfiguracao(ambiente: Record<string, string | undefined> = process.env): Configuracao {
  const lido = ambienteSchema.safeParse(ambiente)
  if (!lido.success) {
    throw new ErroConfiguracao('Configuração incompleta: defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.')
  }
  return {
    supabaseUrl: lido.data.SUPABASE_URL.replace(/\/+$/, ''),
    supabaseChavePublica: lido.data.SUPABASE_PUBLISHABLE_KEY,
  }
}

// Endereço do servidor de autorização (OAuth 2.1) do Supabase, que emite os acessos.
export function emissorDoSupabase(config: Configuracao): string {
  return `${config.supabaseUrl}/auth/v1`
}
