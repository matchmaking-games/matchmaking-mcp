import { describe, expect, it } from 'vitest'
import {
  DIAS_DE_CONFERENCIA,
  lerGreenhouse,
  mapearVaga,
  regiaoDaLocalizacao,
  textoSimples,
} from '../../supabase/functions/_shared/leitores/greenhouse.ts'
import type { Buscar } from '../../supabase/functions/_shared/leitores/tipos.ts'

const HOJE = '2026-10-30'

describe('regiaoDaLocalizacao', () => {
  const casos: Array<[string | null, ReturnType<typeof regiaoDaLocalizacao>]> = [
    ['São Paulo', { abrangencia: 'estado', ufs: ['SP'] }],
    ['São Paulo, São Paulo, Brazil', { abrangencia: 'estado', ufs: ['SP'] }],
    ['Florianópolis, Brazil', { abrangencia: 'estado', ufs: ['SC'] }],
    ['Brazil', { abrangencia: 'nacional' }],
    ['Remote - Brazil', { abrangencia: 'remoto' }],
    ['Remote', { abrangencia: 'remoto' }],
    ['Remote - Europe', { abrangencia: 'internacional' }],
    ['Dublin, Ireland', null],
    [null, null],
  ]

  it.each(casos)('lê "%s"', (nome, esperado) => {
    expect(regiaoDaLocalizacao(nome)).toEqual(esperado)
  })
})

describe('textoSimples', () => {
  it('tira o HTML escapado e corta descrições longas', () => {
    expect(textoSimples('&lt;p&gt;&lt;strong&gt;About&lt;/strong&gt; the &amp;amp; role&lt;/p&gt;')).toBe('About the & role')
    const longa = textoSimples(`&lt;p&gt;${'a'.repeat(900)}&lt;/p&gt;`) ?? ''
    expect(longa.length).toBe(500)
    expect(longa.endsWith('…')).toBe(true)
  })
})

describe('mapearVaga', () => {
  const vaga = {
    id: 123,
    title: ' UI Designer ',
    absolute_url: 'https://job-boards.greenhouse.io/wildlifestudios/jobs/123',
    location: { name: 'São Paulo' },
    content: '&lt;p&gt;Venha criar jogos&lt;/p&gt;',
    application_deadline: null,
  }

  it('vaga sem prazo fica aberta com prazo de conferência', () => {
    const item = mapearVaga(vaga, HOJE)
    expect(item.id_externo).toBe('123')
    expect(item.candidato).toEqual({
      titulo: 'UI Designer',
      tipo: 'vaga',
      link_oficial: vaga.absolute_url,
      prazo: '2026-11-13',
      natureza_prazo: 'vaga_aberta',
      abrangencia: 'estado',
      ufs: ['SP'],
      publico: 'pessoa',
      descricao: 'Venha criar jogos',
    })
    expect(DIAS_DE_CONFERENCIA).toBe(14)
  })

  it('usa o prazo quando o Greenhouse informa', () => {
    const item = mapearVaga({ ...vaga, application_deadline: '2026-12-01T23:59:00-03:00' }, HOJE)
    expect(item.candidato?.prazo).toBe('2026-12-01')
    expect(item.candidato?.natureza_prazo).toBe('encerramento_inscricoes')
  })

  it('vaga fora do Brasil e não remota fica sem candidato', () => {
    expect(mapearVaga({ ...vaga, location: { name: 'Dublin, Ireland' } }, HOJE).candidato).toBeNull()
  })
})

describe('lerGreenhouse', () => {
  function buscarCom(status: number, corpo: unknown): Buscar {
    return async () => ({ ok: status === 200, status, json: async () => corpo })
  }

  it('lê as vagas do board configurado', async () => {
    const urls: string[] = []
    const buscar: Buscar = async (url) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => ({ jobs: [{ id: 1, title: 'Vaga', absolute_url: 'https://x.org/1', location: { name: 'Brazil' } }] }) }
    }
    const itens = await lerGreenhouse({ board: 'wildlifestudios' }, buscar, HOJE)
    expect(urls).toEqual(['https://boards-api.greenhouse.io/v1/boards/wildlifestudios/jobs?content=true'])
    expect(itens).toHaveLength(1)
    expect(itens[0]?.candidato?.abrangencia).toBe('nacional')
  })

  it('recusa configuração sem board válido', async () => {
    await expect(lerGreenhouse({ board: '../x' }, buscarCom(200, {}), HOJE)).rejects.toThrow('board')
    await expect(lerGreenhouse({}, buscarCom(200, {}), HOJE)).rejects.toThrow('board')
  })

  it('avisa quando o Greenhouse falha', async () => {
    await expect(lerGreenhouse({ board: 'x' }, buscarCom(404, {}), HOJE)).rejects.toThrow('404')
  })
})
