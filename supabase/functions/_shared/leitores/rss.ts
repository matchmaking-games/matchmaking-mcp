// Leitor de RSS: lê o feed de um site, abre cada notícia nova e pede à IA para dizer se é uma
// oportunidade para quem faz jogos. Configuração da fonte: { "url": "<endereço do feed>" }.
// Um feed só mostra as notícias mais recentes, então sair do feed não quer dizer que a oportunidade
// encerrou: para fontes de RSS, a coleta não fecha as ausentes.
import type { Classificar } from '../ia/classificar.ts'
import type { Buscar, Candidato, ItemLido } from './tipos.ts'

// Oportunidade sem data informada fica aberta por este tempo, até ser conferida de novo.
export const DIAS_SEM_DATA = 30

// Notícias novas lidas por vez (cada uma abre uma página e chama a IA). O resto fica para a próxima leitura.
export const MAXIMO_POR_LEITURA = 8

const LIMITE_TEXTO = 8000

// Primeira camada do filtro, sem IA: palavras no título que indicam conteúdo para quem joga, não para
// quem faz jogos. A lista é curta de propósito, porque perder uma notícia importante é pior do que
// gastar uma chamada de IA; a auditoria semanal confere o que estas regras descartam.
export const PALAVRAS_IGNORADAS = [
  'review', 'reviews', 'trailer', 'gameplay', 'promocao', 'desconto', 'cupom', 'ofertas',
  'discount', 'detonado', 'walkthrough', 'tier list', 'unboxing',
]

export interface ContextoRss {
  jaVistos: Set<string>
  classificar: Classificar
  // Horário (em milissegundos) a partir do qual não se começa outra notícia.
  ate?: number
  // Notícias registradas nos últimos dias, para a IA apontar a mesma história.
  recentes?: Array<{ id: string; titulo: string }>
}

export interface ItemDoFeed {
  id: string
  titulo: string
  link: string
  publicado_em?: string
  resumo?: string
}

export function decodificar(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Devolve a palavra que faz o título ser ignorado, ou null.
export function palavraIgnorada(titulo: string, extras: string[] = []): string | null {
  const texto = ` ${normalizar(titulo).replace(/[^a-z0-9]+/g, ' ')} `
  return [...PALAVRAS_IGNORADAS, ...extras.map(normalizar)].find((palavra) => texto.includes(` ${palavra} `)) ?? null
}

function dataISO(texto: string | undefined): string | null {
  if (!texto) return null
  const data = new Date(texto)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

function semTags(html: string): string {
  return decodificar(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function campo(xml: string, tag: string): string | undefined {
  const encontrado = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return encontrado?.[1] !== undefined ? decodificar(encontrado[1]).trim() : undefined
}

export function lerFeed(xml: string): ItemDoFeed[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].flatMap(([, item = '']) => {
    const link = campo(item, 'link')
    const titulo = campo(item, 'title')
    if (!link || !titulo) return []
    const resumo = campo(item, 'description')
    return [{
      id: campo(item, 'guid') || link,
      titulo: semTags(titulo),
      link,
      publicado_em: campo(item, 'pubDate'),
      resumo: resumo ? semTags(resumo) : undefined,
    }]
  })
}

// Texto principal de uma página: o <article> (ou <main>, ou o <body>), sem scripts, menus e rodapés.
export function textoDaPagina(html: string): string {
  const limpo = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
  const parte =
    /<article\b[\s\S]*?<\/article>/i.exec(limpo)?.[0] ??
    /<main\b[\s\S]*?<\/main>/i.exec(limpo)?.[0] ??
    /<body\b[\s\S]*<\/body>/i.exec(limpo)?.[0] ??
    limpo
  return semTags(parte).slice(0, LIMITE_TEXTO)
}

function mesmoSite(link: string, feed: string): boolean {
  try {
    const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')
    return new URL(link).protocol === 'https:' && host(link) === host(feed)
  } catch {
    return false
  }
}

function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

export async function lerRss(configuracao: unknown, buscar: Buscar, hojeISO: string, contexto: ContextoRss): Promise<ItemLido[]> {
  const url = (configuracao as { url?: unknown } | null)?.url
  const ignorar = (configuracao as { ignorar?: unknown } | null)?.ignorar
  const extras = Array.isArray(ignorar) ? ignorar.filter((palavra): palavra is string => typeof palavra === 'string') : []
  const recentes = contexto.recentes ?? []
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('Configuração da fonte sem "url" https do feed')

  const resposta = await buscar(url)
  if (!resposta.ok) throw new Error(`O feed respondeu ${resposta.status}`)
  const feed = lerFeed(await resposta.text())
  if (feed.length === 0) throw new Error('O feed não trouxe nenhuma notícia')

  // Só notícias deste mesmo site: o leitor nunca abre endereços de outros lugares citados no feed.
  const novos = feed.filter((item) => !contexto.jaVistos.has(item.id) && mesmoSite(item.link, url)).slice(0, MAXIMO_POR_LEITURA)
  const itens: ItemLido[] = []
  const erros: string[] = []

  for (const item of novos) {
    if (contexto.ate !== undefined && Date.now() > contexto.ate) break
    const palavra = palavraIgnorada(item.titulo, extras)
    if (palavra) {
      itens.push({ id_externo: item.id, conteudo: { feed: item, regra: palavra }, candidato: null, motivo: `Regra por palavra: "${palavra}" no título` })
      continue
    }
    try {
      const pagina = await buscar(item.link)
      if (!pagina.ok) throw new Error(`a página respondeu ${pagina.status}`)
      const texto = textoDaPagina(await pagina.text()) || item.resumo || ''
      const classificacao = await contexto.classificar({
        titulo: item.titulo, link: item.link, publicado_em: item.publicado_em, texto, hojeISO,
        recentes: recentes.map((recente) => recente.titulo),
      })
      const conteudo = { feed: item, texto, ia: classificacao }
      const o = classificacao.oportunidade

      if (classificacao.classe === 'oportunidade' && o) {
        const candidato: Candidato = {
          titulo: o.titulo,
          tipo: o.tipo,
          link_oficial: o.link_oficial,
          prazo: o.prazo ?? somarDias(hojeISO, DIAS_SEM_DATA),
          natureza_prazo: o.prazo ? (o.natureza_prazo ?? 'encerramento_inscricoes') : 'aberta_sem_data',
          abrangencia: o.abrangencia,
          ...(o.ufs ? { ufs: o.ufs } : {}),
          publico: o.publico,
          ...(o.descricao ? { descricao: o.descricao } : {}),
        }
        itens.push({ id_externo: item.id, conteudo, candidato })
      } else if (classificacao.classe === 'noticia' && classificacao.noticia) {
        const n = classificacao.noticia
        itens.push({
          id_externo: item.id,
          conteudo,
          candidato: null,
          noticia: {
            titulo: n.titulo_pt,
            titulo_original: item.titulo,
            link: item.link,
            resumo: n.resumo,
            idioma: n.idioma_original,
            publicada_em: dataISO(item.publicado_em),
            nota: n.nota,
            motivo: classificacao.motivo,
            duplicata_de: n.duplicata ? (recentes[n.duplicata - 1]?.id ?? null) : null,
          },
        })
      } else {
        itens.push({ id_externo: item.id, conteudo, candidato: null, motivo: `Fora do escopo: ${classificacao.motivo}` })
      }
    } catch (erro) {
      erros.push(`${item.link}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  // Uma notícia com problema fica para a próxima leitura; se nenhuma deu certo, a leitura falha.
  if (itens.length === 0 && erros.length > 0) throw new Error(erros.join(' | ').slice(0, 1000))
  return itens
}
