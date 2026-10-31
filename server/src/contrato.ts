// Contrato mínimo de uma oportunidade. Espelha as regras do banco
// (supabase/migrations) para recusar um item antes de ele chegar lá.
import { z } from 'zod'

export const TIPOS_OPORTUNIDADE = [
  'vaga',
  'edital_fomento',
  'game_jam',
  'evento',
  'chamada_festival_vitrine',
  'curso_capacitacao',
  'mentoria',
  'aceleracao_incubacao',
  'chamada_publisher',
  'terceirizacao_codesenvolvimento',
] as const

// Lista fechada completa. Notícias ficam numa área própria, fora das oportunidades.
export const TIPOS = [...TIPOS_OPORTUNIDADE, 'noticia'] as const

export const ABRANGENCIAS = ['estado', 'nacional', 'remoto', 'internacional'] as const

export const PUBLICOS = ['pessoa', 'empresa', 'ambos'] as const

export const NATUREZAS_PRAZO = ['encerramento_inscricoes', 'data_do_evento', 'vaga_aberta', 'aberta_sem_data'] as const

export const NIVEIS = ['iniciante', 'junior', 'pleno', 'senior', 'lead'] as const

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export const oportunidadeSchema = z
  .strictObject({
    // Contrato mínimo
    titulo: z.string().trim().min(3).max(200),
    tipo: z.enum(TIPOS_OPORTUNIDADE),
    link_oficial: z.url({ protocol: /^https?$/ }).max(2000),
    prazo: z.iso.date(),
    natureza_prazo: z.enum(NATUREZAS_PRAZO),
    abrangencia: z.enum(ABRANGENCIAS),
    ufs: z.array(z.enum(UFS)).min(1).max(27).optional(),
    publico: z.enum(PUBLICOS),

    // Opcionais
    descricao: z.string().trim().max(2000).optional(),
    niveis: z.array(z.enum(NIVEIS)).min(1).optional(),
    valor: z.string().trim().max(200).optional(),
    publico_especifico: z.string().trim().max(200).optional(),
  })
  .refine((oportunidade) => (oportunidade.abrangencia === 'estado') === (oportunidade.ufs !== undefined), {
    error: 'Informe os estados (ufs) só quando a abrangência for "estado".',
    path: ['ufs'],
  })

export type Oportunidade = z.infer<typeof oportunidadeSchema>
