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
  conferida_em: z.string().nullish(),
})

export type OportunidadeVitrine = z.infer<typeof oportunidadeVitrineSchema>

// O que a busca entendeu da frase: palavras corrigidas, termos amplos, filtros tirados do texto e se os
// resultados têm todos os termos ou só parte deles.
export const interpretacaoSchema = z.object({
  termos: z.array(z.string()),
  correcoes: z.array(z.object({ de: z.string(), para: z.string() })),
  ambiguos: z.array(z.object({ termo: z.string(), opcoes: z.array(z.string()) })),
  tipo_do_texto: z.enum(TIPOS_OPORTUNIDADE).nullable(),
  uf_do_texto: z.string().nullable(),
  abrangencia_do_texto: z.enum(ABRANGENCIAS).nullable(),
  modo: z.enum(['sem_texto', 'todos_os_termos', 'parcial', 'nenhum']),
})

export type Interpretacao = z.infer<typeof interpretacaoSchema>

export const pesquisaSchema = z.object({
  interpretacao: interpretacaoSchema,
  resultados: z.array(oportunidadeVitrineSchema),
})

export type Pesquisa = z.infer<typeof pesquisaSchema>

export interface FiltrosVitrine {
  tipo?: (typeof TIPOS_OPORTUNIDADE)[number]
  uf?: (typeof UFS)[number]
  texto?: string
  limite: number
}

export type ConsultarVitrine = (token: string, filtros: FiltrosVitrine) => Promise<Pesquisa>

export class ErroVitrine extends Error {}

export function criarConsultaVitrine(config: Configuracao): ConsultarVitrine {
  return async (token, filtros) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseChavePublica, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    // A busca roda no banco, com os filtros aplicados antes do limite (no máximo 20 itens).
    const { data, error } = await supabase.schema('vitrine').rpc('pesquisar_oportunidades', {
      p_tipo: filtros.tipo ?? null,
      p_uf: filtros.uf ?? null,
      p_texto: filtros.texto ?? null,
      p_limite: filtros.limite,
    })
    if (error) throw new ErroVitrine(error.message)
    return pesquisaSchema.parse(data)
  }
}
