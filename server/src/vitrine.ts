// Leitura da vitrine do índice, sempre com o acesso da própria pessoa (as regras do banco valem).
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

const COLUNAS =
  'id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico, descricao, valor, publico_especifico, fonte'

// Trata a palavra buscada como texto literal, nunca como curinga.
export function escaparTextoBusca(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)
}

export function criarConsultaVitrine(config: Configuracao): ConsultarVitrine {
  return async (token, filtros) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseChavePublica, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    let consulta = supabase.schema('vitrine').from('oportunidades').select(COLUNAS)
    if (filtros.tipo) consulta = consulta.eq('tipo', filtros.tipo)
    // Vaga remota e oportunidade nacional valem para todos os estados.
    if (filtros.uf) consulta = consulta.or(`abrangencia.in.(nacional,remoto),ufs.cs.{${filtros.uf}}`)
    if (filtros.texto) consulta = consulta.ilike('titulo', `%${escaparTextoBusca(filtros.texto)}%`)

    const { data, error } = await consulta.order('prazo', { ascending: true }).limit(filtros.limite)
    if (error) throw new ErroVitrine(error.message)
    return z.array(oportunidadeVitrineSchema).parse(data)
  }
}
