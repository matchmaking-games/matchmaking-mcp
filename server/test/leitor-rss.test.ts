import { describe, expect, it } from 'vitest'
import type { Classificacao, Classificar } from '../../supabase/functions/_shared/ia/classificar.ts'
import {
  DIAS_SEM_DATA,
  MAXIMO_POR_LEITURA,
  lerFeed,
  lerRss,
  textoDaPagina,
} from '../../supabase/functions/_shared/leitores/rss.ts'
import type { Buscar } from '../../supabase/functions/_shared/leitores/tipos.ts'

const HOJE = '2026-10-31'
const FEED = 'https://spcine.com.br/feed/'

function item(n: number, link = `https://spcine.com.br/noticia-${n}/`): string {
  return `<item>
    <title>Not&#237;cia &#8220;${n}&#8221;</title>
    <link>${link}</link>
    <guid isPermaLink="false">https://spcine.com.br/?p=${n}</guid>
    <pubDate>Fri, 30 Oct 2026 12:00:00 +0000</pubDate>
    <description><![CDATA[<p>Resumo ${n} &#8211; leia mais</p>]]></description>
  </item>`
}

function feed(...itens: string[]): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Spcine</title>${itens.join('')}</channel></rss>`
}

const PAGINA = `<html><head><script>alert(1)</script></head><body><nav>Menu</nav>
  <article><h1>Edital</h1><p>Inscrições até 30 de novembro.</p><script>x()</script></article><footer>Rodapé</footer></body></html>`

function buscarCom(paginas: Record<string, { status?: number; corpo: string }>): Buscar & { urls: string[] } {
  const urls: string[] = []
  const buscar = async (url: string) => {
    urls.push(url)
    const pagina = paginas[url] ?? { status: 404, corpo: '' }
    const status = pagina.status ?? 200
    return { ok: status === 200, status, text: async () => pagina.corpo, json: async () => JSON.parse(pagina.corpo) }
  }
  return Object.assign(buscar, { urls })
}

const OPORTUNIDADE: Classificacao = {
  classe: 'oportunidade',
  motivo: 'Edital aberto a estúdios de games',
  oportunidade: {
    titulo: 'Edital de games',
    tipo: 'edital_fomento',
    link_oficial: 'https://spcine.com.br/edital',
    prazo: '2026-11-30',
    natureza_prazo: 'encerramento_inscricoes',
    abrangencia: 'estado',
    ufs: ['SP'],
    publico: 'ambos',
    descricao: 'Apoio a jogos independentes.',
  },
}

function classificarCom(respostas: Classificacao[]): Classificar & { textos: string[] } {
  const textos: string[] = []
  let i = 0
  const classificar: Classificar = async (entrada) => {
    textos.push(entrada.texto)
    const resposta = respostas[i++ % respostas.length]
    if (!resposta) throw new Error('sem resposta')
    return resposta
  }
  return Object.assign(classificar, { textos })
}

describe('lerFeed', () => {
  it('lê título, link, id e resumo, desfazendo entidades e CDATA', () => {
    const [primeiro] = lerFeed(feed(item(1)))
    expect(primeiro).toEqual({
      id: 'https://spcine.com.br/?p=1',
      titulo: 'Notícia “1”',
      link: 'https://spcine.com.br/noticia-1/',
      publicado_em: 'Fri, 30 Oct 2026 12:00:00 +0000',
      resumo: 'Resumo 1 – leia mais',
    })
  })
})

describe('textoDaPagina', () => {
  it('fica só com o texto do artigo, sem scripts, menu e rodapé', () => {
    expect(textoDaPagina(PAGINA)).toBe('Edital Inscrições até 30 de novembro.')
  })
})

describe('lerRss', () => {
  it('abre cada notícia nova e monta o candidato a partir da IA', async () => {
    const buscar = buscarCom({ [FEED]: { corpo: feed(item(1)) }, 'https://spcine.com.br/noticia-1/': { corpo: PAGINA } })
    const classificar = classificarCom([OPORTUNIDADE])
    const itens = await lerRss({ url: FEED }, buscar, HOJE, { jaVistos: new Set(), classificar })
    expect(classificar.textos).toEqual(['Edital Inscrições até 30 de novembro.'])
    expect(itens).toHaveLength(1)
    expect(itens[0]?.id_externo).toBe('https://spcine.com.br/?p=1')
    expect(itens[0]?.candidato).toEqual({
      titulo: 'Edital de games',
      tipo: 'edital_fomento',
      link_oficial: 'https://spcine.com.br/edital',
      prazo: '2026-11-30',
      natureza_prazo: 'encerramento_inscricoes',
      abrangencia: 'estado',
      ufs: ['SP'],
      publico: 'ambos',
      descricao: 'Apoio a jogos independentes.',
    })
  })

  it('oportunidade sem data ganha o prazo de conferência', async () => {
    const buscar = buscarCom({ [FEED]: { corpo: feed(item(1)) }, 'https://spcine.com.br/noticia-1/': { corpo: PAGINA } })
    const semData = { ...OPORTUNIDADE, oportunidade: { ...OPORTUNIDADE.oportunidade!, prazo: null, natureza_prazo: null } }
    const [lido] = await lerRss({ url: FEED }, buscar, HOJE, { jaVistos: new Set(), classificar: classificarCom([semData]) })
    expect(lido?.candidato?.prazo).toBe('2026-11-30')
    expect(lido?.candidato?.natureza_prazo).toBe('aberta_sem_data')
    expect(DIAS_SEM_DATA).toBe(30)
  })

  it('notícia e item fora do escopo ficam sem candidato, com motivo', async () => {
    const buscar = buscarCom({
      [FEED]: { corpo: feed(item(1), item(2)) },
      'https://spcine.com.br/noticia-1/': { corpo: PAGINA },
      'https://spcine.com.br/noticia-2/': { corpo: PAGINA },
    })
    const classificar = classificarCom([
      { classe: 'noticia', motivo: 'Resultado de seleção', oportunidade: null },
      { classe: 'fora', motivo: 'Sessão de cinema', oportunidade: null },
    ])
    const itens = await lerRss({ url: FEED }, buscar, HOJE, { jaVistos: new Set(), classificar })
    expect(itens.map((i) => i.candidato)).toEqual([null, null])
    expect(itens[0]?.motivo).toBe('Notícia útil para quem faz jogos, guardada para a área de notícias: Resultado de seleção')
    expect(itens[1]?.motivo).toBe('Fora do escopo: Sessão de cinema')
  })

  it('pula as já vistas, abre só links do próprio site e respeita o máximo por leitura', async () => {
    const itensDoFeed = [item(0), item(99, 'https://outro-site.com/x/')]
    const paginas: Record<string, { corpo: string }> = {}
    for (let n = 1; n <= MAXIMO_POR_LEITURA + 2; n++) {
      itensDoFeed.push(item(n))
      paginas[`https://spcine.com.br/noticia-${n}/`] = { corpo: PAGINA }
    }
    const buscar = buscarCom({ [FEED]: { corpo: feed(...itensDoFeed) }, ...paginas })
    const itens = await lerRss({ url: FEED }, buscar, HOJE, {
      jaVistos: new Set(['https://spcine.com.br/?p=0']),
      classificar: classificarCom([OPORTUNIDADE]),
    })
    expect(itens).toHaveLength(MAXIMO_POR_LEITURA)
    expect(buscar.urls).not.toContain('https://spcine.com.br/noticia-0/')
    expect(buscar.urls).not.toContain('https://outro-site.com/x/')
  })

  it('uma notícia com problema fica para depois; se todas falham, a leitura falha', async () => {
    const buscar = buscarCom({ [FEED]: { corpo: feed(item(1), item(2)) }, 'https://spcine.com.br/noticia-2/': { corpo: PAGINA } })
    const itens = await lerRss({ url: FEED }, buscar, HOJE, { jaVistos: new Set(), classificar: classificarCom([OPORTUNIDADE]) })
    expect(itens.map((i) => i.id_externo)).toEqual(['https://spcine.com.br/?p=2'])

    const tudoQuebrado = buscarCom({ [FEED]: { corpo: feed(item(1)) } })
    await expect(
      lerRss({ url: FEED }, tudoQuebrado, HOJE, { jaVistos: new Set(), classificar: classificarCom([OPORTUNIDADE]) }),
    ).rejects.toThrow('404')
  })

  it('recusa configuração sem url https', async () => {
    await expect(lerRss({ url: 'http://x.org/feed' }, buscarCom({}), HOJE, { jaVistos: new Set(), classificar: classificarCom([]) })).rejects.toThrow('url')
  })
})
