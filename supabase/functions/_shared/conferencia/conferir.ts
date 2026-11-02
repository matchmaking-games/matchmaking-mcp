// Confere uma oportunidade: o link, o link da notícia quando ele é a reserva e, para quem não tem data e
// veio de notícia, se as inscrições continuam abertas. Devolve o que o banco precisa para aplicar as regras.
import type { VerificarAbertura } from '../ia/verificar-abertura.ts'
import { textoDaPagina } from '../leitores/rss.ts'
import { conferirLink, type Abrir, type ResultadoLink } from './link.ts'

// Notícia antiga sem data não prova que algo continua aberto: não vai para a IA e não é renovada.
export const DIAS_MAXIMOS_DA_NOTICIA = 90

export interface ItemAConferir {
  id: string
  titulo: string
  descricao: string | null
  link_oficial: string
  falhas_de_link: number
  link_noticia: string | null
  publicada_na_fonte_em: string | null
  reler: boolean
}

export interface Conferencia {
  link: ResultadoLink
  noticiaAbre: boolean
  abertura: 'aberta' | 'encerrada' | 'incerta' | null
  detalhe: string | null
}

export function noticiaAntiga(publicadaEm: string | null, hojeISO: string): boolean {
  if (!publicadaEm) return false
  const publicada = new Date(publicadaEm).getTime()
  if (Number.isNaN(publicada)) return false
  return new Date(`${hojeISO}T12:00:00Z`).getTime() - publicada > DIAS_MAXIMOS_DA_NOTICIA * 86_400_000
}

export async function conferirOportunidade(
  item: ItemAConferir,
  dependencias: { abrir: Abrir; verificar: VerificarAbertura; hojeISO: string },
): Promise<Conferencia> {
  const { resultado, resposta } = await conferirLink(item.link_oficial, dependencias.abrir)
  const conferencia: Conferencia = { link: resultado, noticiaAbre: false, abertura: null, detalhe: null }

  if (resultado === 'quebrado' && item.falhas_de_link >= 1 && item.link_noticia && item.link_noticia !== item.link_oficial) {
    const noticia = await conferirLink(item.link_noticia, dependencias.abrir)
    await noticia.resposta?.body?.cancel()
    conferencia.noticiaAbre = noticia.resultado === 'abre'
  }

  if (resultado !== 'abre' || !resposta) return conferencia
  if (!item.reler) {
    await resposta.body?.cancel()
    return conferencia
  }
  if (noticiaAntiga(item.publicada_na_fonte_em, dependencias.hojeISO)) {
    await resposta.body?.cancel()
    return { ...conferencia, abertura: 'incerta', detalhe: `Notícia com mais de ${DIAS_MAXIMOS_DA_NOTICIA} dias` }
  }

  try {
    const texto = textoDaPagina(await resposta.text())
    if (!texto) return { ...conferencia, abertura: 'incerta', detalhe: 'Página sem texto para ler' }
    const { situacao, motivo } = await dependencias.verificar({
      titulo: item.titulo,
      descricao: item.descricao,
      link: item.link_oficial,
      texto,
      hojeISO: dependencias.hojeISO,
    })
    return { ...conferencia, abertura: situacao, detalhe: motivo }
  } catch (erro) {
    return { ...conferencia, abertura: 'incerta', detalhe: erro instanceof Error ? erro.message : String(erro) }
  }
}
