import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DIAS_SEM_PRAZO,
  lerCsv,
  lerPlanilha,
  lerPrazo,
  lerRegiao,
} from '../../supabase/functions/_shared/leitores/planilha.ts'
import type { Buscar } from '../../supabase/functions/_shared/leitores/tipos.ts'

const HOJE = '2026-10-31'
const URL_PLANILHA = 'https://docs.google.com/spreadsheets/d/e/2PACX-teste/pub?output=csv'
const CABECALHO = 'Título,Tipo,Link oficial,Prazo,Região,Quem pode participar,Descrição'
const MODELO = readFileSync(new URL('../../modelos/planilha-de-oportunidades.csv', import.meta.url), 'utf8')

function buscarCom(corpo: string, status = 200): Buscar {
  return async () => ({ ok: status === 200, status, text: async () => corpo, json: async () => ({}) })
}

describe('lerCsv', () => {
  it('lida com aspas, vírgulas e quebras de linha dentro do campo', () => {
    expect(lerCsv('﻿a,"b, c","d ""e""\nf"\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"\nf'],
      ['1', '2', '3'],
    ])
  })
})

describe('lerPrazo e lerRegiao', () => {
  it('lê dia/mês/ano e recusa datas que não existem', () => {
    expect(lerPrazo('5/1/2027')).toBe('2027-01-05')
    expect(lerPrazo('2026-12-15')).toBe('2026-12-15')
    expect(lerPrazo('  ')).toBeNull()
    expect(() => lerPrazo('31/02/2027')).toThrow('não é uma data que existe')
    expect(() => lerPrazo('dezembro')).toThrow('dia/mês/ano')
  })

  it('lê siglas de estado e as abrangências do modelo', () => {
    expect(lerRegiao('sp, RJ')).toEqual({ abrangencia: 'estado', ufs: ['SP', 'RJ'] })
    expect(lerRegiao('Nacional')).toEqual({ abrangencia: 'nacional' })
    expect(lerRegiao('remoto')).toEqual({ abrangencia: 'remoto' })
    expect(() => lerRegiao('Sudeste')).toThrow('não reconhecida')
  })
})

describe('lerPlanilha', () => {
  it('monta o candidato de uma linha completa, com os nomes do modelo', async () => {
    const csv = `${CABECALHO}\nGame jam de verão,Game jam,https://e.org/jam,15/12/2026,Nacional,Pessoas,Online e gratuita`
    const [item] = await lerPlanilha({ url: URL_PLANILHA }, buscarCom(csv), HOJE)
    expect(item?.id_externo).toBe('https://e.org/jam')
    expect(item?.candidato).toEqual({
      titulo: 'Game jam de verão',
      tipo: 'game_jam',
      link_oficial: 'https://e.org/jam',
      prazo: '2026-12-15',
      natureza_prazo: 'encerramento_inscricoes',
      abrangencia: 'nacional',
      publico: 'pessoa',
      descricao: 'Online e gratuita',
    })
  })

  it('linha sem prazo fica aberta com prazo de conferência', async () => {
    const csv = `${CABECALHO}\nMentoria contínua,Mentoria,https://e.org/m,,SP,Empresas,`
    const [item] = await lerPlanilha({ url: URL_PLANILHA }, buscarCom(csv), HOJE)
    expect(item?.candidato?.natureza_prazo).toBe('aberta_sem_data')
    expect(item?.candidato?.prazo).toBe('2026-11-14')
    expect(DIAS_SEM_PRAZO).toBe(14)
  })

  it('linha mal preenchida é recusada com motivo, sem derrubar as outras', async () => {
    const csv = [
      CABECALHO,
      'Boa,Evento,https://e.org/ok,10/12/2026,Remoto,Ambos,',
      'Tipo errado,Bolsa,https://e.org/b,10/12/2026,Remoto,Ambos,',
      'Sem link,Evento,e.org/x,10/12/2026,Remoto,Ambos,',
      ',,,,,,',
    ].join('\n')
    const itens = await lerPlanilha({ url: URL_PLANILHA }, buscarCom(csv), HOJE)
    expect(itens).toHaveLength(3)
    expect(itens[1]?.problema).toBe('Linha 3: Tipo "Bolsa" fora da lista do modelo')
    expect(itens[2]?.problema).toContain('Linha 4: O link oficial')
  })

  it('o modelo só tem linhas de exemplo, que são ignoradas; sem elas, todas as linhas são válidas', async () => {
    await expect(lerPlanilha({ url: URL_PLANILHA }, buscarCom(MODELO), HOJE)).rejects.toThrow('nenhuma linha válida')
    const semPrefixo = MODELO.replace(/Exemplo: /g, '')
    const itens = await lerPlanilha({ url: URL_PLANILHA }, buscarCom(semPrefixo), HOJE)
    expect(itens).toHaveLength(3)
    expect(itens.every((item) => item.candidato)).toBe(true)
  })

  it('protege o índice quando a planilha some, esvazia ou muda de formato', async () => {
    await expect(lerPlanilha({ url: URL_PLANILHA }, buscarCom(`${CABECALHO}\n`), HOJE)).rejects.toThrow('nenhuma linha válida')
    await expect(lerPlanilha({ url: URL_PLANILHA }, buscarCom('<!DOCTYPE html><html>'), HOJE)).rejects.toThrow('publicada como CSV')
    await expect(lerPlanilha({ url: URL_PLANILHA }, buscarCom('Nome,Data\nx,y'), HOJE)).rejects.toThrow('colunas do modelo')
    await expect(lerPlanilha({ url: URL_PLANILHA }, buscarCom('', 404), HOJE)).rejects.toThrow('404')
  })

  it('só lê planilhas do Google', async () => {
    await expect(lerPlanilha({ url: 'https://outro.site/planilha.csv' }, buscarCom(''), HOJE)).rejects.toThrow('url')
  })
})
