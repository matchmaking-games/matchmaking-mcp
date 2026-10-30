import { describe, expect, it } from 'vitest'
import { descreverRegiao, formatarData, formatarOportunidade } from '../src/ferramentas.js'
import type { OportunidadeVitrine } from '../src/vitrine.js'

const evento: OportunidadeVitrine = {
  id: 'o-2',
  titulo: '[Exemplo] Encontro de estúdios do Nordeste em Recife',
  tipo: 'evento',
  link_oficial: 'https://matchmaking.games',
  prazo: '2027-02-10',
  natureza_prazo: 'data_do_evento',
  abrangencia: 'estado',
  ufs: ['PE'],
  publico: 'empresa',
  descricao: 'Oportunidade fictícia.',
  valor: null,
  publico_especifico: 'Estúdios',
  fonte: 'Exemplos',
}

describe('formatação', () => {
  it('mostra datas no formato brasileiro', () => {
    expect(formatarData('2026-12-15')).toBe('15/12/2026')
  })

  const regioes: Array<[Pick<OportunidadeVitrine, 'abrangencia' | 'ufs'>, string]> = [
    [{ abrangencia: 'estado', ufs: ['SP', 'RJ'] }, 'SP, RJ'],
    [{ abrangencia: 'nacional', ufs: null }, 'todo o Brasil'],
    [{ abrangencia: 'remoto', ufs: null }, 'remoto, para todo o Brasil'],
    [{ abrangencia: 'internacional', ufs: null }, 'internacional, aberta a quem mora no Brasil'],
  ]

  it.each(regioes)('descreve a região %o', (oportunidade, esperado) => {
    expect(descreverRegiao(oportunidade)).toBe(esperado)
  })

  it('mostra um evento com data, público, fonte e link', () => {
    expect(formatarOportunidade(evento, 2)).toBe(
      [
        '2. [Exemplo] Encontro de estúdios do Nordeste em Recife',
        '   Tipo: evento · Região: PE · Quem pode participar: empresas (com CNPJ)',
        '   Data: 10/02/2027 · Fonte: Exemplos',
        '   Público: Estúdios',
        '   Oportunidade fictícia.',
        '   Link oficial: https://matchmaking.games',
      ].join('\n'),
    )
  })
})
