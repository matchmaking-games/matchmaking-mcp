// Busca na vitrine do índice, sempre com o acesso da própria pessoa.
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Configuracao } from './config.js'
import { ABRANGENCIAS, NATUREZAS_PRAZO, PUBLICOS, TIPOS_OPORTUNIDADE, type UFS } from './contrato.js'

export const oportunidadeVitrineSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  tipo: z.enum(TIPOS_OPORTUNIDADE),
  link_oficial: z.string(),
  prazo: z.string(),
  natureza_prazo: z.enum(NATUREZAS_PRAZO),
  abrangencia: z.enum(ABRANGENCIAS),
  ufs: z.array(z.string()).nullable(),
  publico: z.enum(PUBLICOS),
  descricao: z.string().nullable(),
  valor: z.string().nullable(),
  publico_especifico: z.string().nullable(),
  fonte: z.string(),
})

export type OportunidadeVitrine = z.infer<typeof oportunidadeVitrineSchema>

export interface FiltrosVitrine {
  tipo?: (typeof TIPOS_OPORTUNIDADE)[number]
  uf?: (typeof UFS)[number]
  texto?: string
  limite: number
}

export type ConsultarVitrine = (token: string, filtros: FiltrosVitrine) => Promise<OportunidadeVitrine[]>

export class ErroVitrine extends Error {}

export function criarConsultaVitrine(config: Configuracao): ConsultarVitrine {
  return async (token, filtros) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseChavePublica, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    // A busca roda no banco, com os filtros aplicados antes do limite (no máximo 20 itens).
    const { data, error } = await supabase.schema('vitrine').rpc('buscar_oportunidades', {
      p_tipo: filtros.tipo ?? null,
      p_uf: filtros.uf ?? null,
      p_texto: filtros.texto ?? null,
      p_limite: filtros.limite,
    })
    if (error) throw new ErroVitrine(error.message)
    return z.array(oportunidadeVitrineSchema).parse(data)
  }
}
