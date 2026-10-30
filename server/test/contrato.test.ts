import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ABRANGENCIAS,
  NATUREZAS_PRAZO,
  NIVEIS,
  PUBLICOS,
  TIPOS,
  UFS,
  oportunidadeSchema,
} from '../src/contrato.js'

const valida = {
  titulo: 'Edital de fomento a jogos independentes',
  tipo: 'edital_fomento',
  link_oficial: 'https://exemplo.org/edital',
  prazo: '2026-12-15',
  natureza_prazo: 'encerramento_inscricoes',
  abrangencia: 'estado',
  ufs: ['SP', 'RJ'],
  publico: 'ambos',
}

describe('contrato mínimo', () => {
  it('aceita uma oportunidade estadual completa', () => {
    expect(oportunidadeSchema.safeParse(valida).success).toBe(true)
  })

  it('aceita uma vaga remota sem estados', () => {
    const remota = { ...valida, tipo: 'vaga', abrangencia: 'remoto', ufs: undefined, publico: 'pessoa' }
    expect(oportunidadeSchema.safeParse(remota).success).toBe(true)
  })

  const invalidas: Array<[string, Record<string, unknown>]> = [
    ['estado sem ufs', { ufs: undefined }],
    ['nacional com ufs', { abrangencia: 'nacional' }],
    ['UF inexistente', { ufs: ['XX'] }],
    ['tipo notícia', { tipo: 'noticia' }],
    ['tipo fora da lista', { tipo: 'bolsa' }],
    ['link sem http(s)', { link_oficial: 'ftp://exemplo.org/edital' }],
    ['prazo em formato errado', { prazo: '15/12/2026' }],
    ['título curto demais', { titulo: 'ab' }],
    ['quem pode participar fora da lista', { publico: 'estudantes' }],
    ['campo desconhecido', { prioridade: 'alta' }],
  ]

  it.each(invalidas)('recusa %s', (_caso, mudanca) => {
    expect(oportunidadeSchema.safeParse({ ...valida, ...mudanca }).success).toBe(false)
  })

  it.each(['titulo', 'tipo', 'link_oficial', 'prazo', 'natureza_prazo', 'abrangencia', 'publico'])(
    'recusa sem o campo obrigatório %s',
    (campo) => {
      const incompleta: Record<string, unknown> = { ...valida }
      delete incompleta[campo]
      expect(oportunidadeSchema.safeParse(incompleta).success).toBe(false)
    },
  )
})

describe('contrato e banco falam a mesma língua', () => {
  const pasta = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
  const sql = readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .map((arquivo) => readFileSync(join(pasta, arquivo), 'utf8'))
    .join('\n')

  // Valores criados com o tipo e os acrescentados depois com ALTER TYPE ... ADD VALUE.
  function valoresDoEnum(nome: string): string[] {
    const encontrado = new RegExp(String.raw`create type oportunidades\.${nome} as enum \(([^)]*)\)`).exec(sql)
    if (!encontrado?.[1]) throw new Error(`enum ${nome} não encontrado nas migrations`)
    const iniciais = [...encontrado[1].matchAll(/'([^']+)'/g)].map((valor) => valor[1] ?? '')
    const acrescentados = [
      ...sql.matchAll(new RegExp(String.raw`alter type oportunidades\.${nome} add value '([^']+)'`, 'g')),
    ].map((valor) => valor[1] ?? '')
    return [...iniciais, ...acrescentados]
  }

  const enums: Array<[string, readonly string[]]> = [
    ['tipo_item', TIPOS],
    ['abrangencia', ABRANGENCIAS],
    ['publico', PUBLICOS],
    ['natureza_prazo', NATUREZAS_PRAZO],
    ['nivel', NIVEIS],
  ]

  it.each(enums)('o enum %s tem os mesmos valores', (nome, valores) => {
    expect(valoresDoEnum(nome)).toEqual([...valores])
  })

  it('a lista de estados é a mesma', () => {
    const encontrado = /ufs <@ array\[([^\]]*)\]/.exec(sql)
    const ufsDoBanco = [...(encontrado?.[1] ?? '').matchAll(/'([A-Z]{2})'/g)].map((valor) => valor[1])
    expect(ufsDoBanco).toEqual([...UFS])
  })
})
