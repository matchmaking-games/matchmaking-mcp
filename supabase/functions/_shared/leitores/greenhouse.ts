// Leitor do Greenhouse: lê a página pública de vagas de um estúdio pela API oficial
// (https://developers.greenhouse.io/job-board.html). Configuração da fonte: { "board": "<nome>" }.
import type { Abrangencia, Buscar, Candidato, ItemLido } from './tipos.ts'

// Vagas sem prazo informado ficam abertas por este tempo, renovado a cada leitura.
export const DIAS_DE_CONFERENCIA = 14

const LIMITE_DESCRICAO = 500

interface VagaGreenhouse {
  id: number
  title: string
  absolute_url: string
  location?: { name?: string | null } | null
  content?: string | null
  application_deadline?: string | null
}

const UF_POR_CIDADE: Record<string, string> = {
  'sao paulo': 'SP',
  campinas: 'SP',
  'rio de janeiro': 'RJ',
  florianopolis: 'SC',
  curitiba: 'PR',
  'belo horizonte': 'MG',
  'porto alegre': 'RS',
  recife: 'PE',
  salvador: 'BA',
  fortaleza: 'CE',
  brasilia: 'DF',
  goiania: 'GO',
  manaus: 'AM',
  belem: 'PA',
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Lê o texto de localização da vaga. Devolve null quando a vaga não é para o Brasil nem remota.
export function regiaoDaLocalizacao(nome: string | null | undefined): { abrangencia: Abrangencia; ufs?: string[] } | null {
  const texto = normalizar(nome ?? '')
  const noBrasil = /\bbra[sz]il\b/.test(texto)
  const remota = /\b(remote|remoto|remota|anywhere)\b/.test(texto)
  const ufs = [...new Set(Object.entries(UF_POR_CIDADE).filter(([cidade]) => texto.includes(cidade)).map(([, uf]) => uf))]

  if (remota) return { abrangencia: noBrasil || texto.trim() === 'remote' ? 'remoto' : 'internacional' }
  if (ufs.length > 0) return { abrangencia: 'estado', ufs }
  if (noBrasil) return { abrangencia: 'nacional' }
  return null
}

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

// O Greenhouse devolve a descrição como HTML escapado: desfaz o escape, tira as tags,
// desfaz as entidades do texto e corta para uma descrição curta.
export function textoSimples(html: string | null | undefined): string | undefined {
  if (!html) return undefined
  const texto = decodificarEntidades(decodificarEntidades(html).replace(/<[^>]*>/g, ' '))
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!texto) return undefined
  return texto.length > LIMITE_DESCRICAO ? `${texto.slice(0, LIMITE_DESCRICAO - 1).trimEnd()}…` : texto
}

function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

export function mapearVaga(vaga: VagaGreenhouse, hojeISO: string): ItemLido {
  const regiao = regiaoDaLocalizacao(vaga.location?.name)
  let candidato: Candidato | null = null

  if (regiao) {
    const prazoInformado = vaga.application_deadline ? vaga.application_deadline.slice(0, 10) : null
    candidato = {
      titulo: vaga.title.trim(),
      tipo: 'vaga',
      link_oficial: vaga.absolute_url,
      prazo: prazoInformado ?? somarDias(hojeISO, DIAS_DE_CONFERENCIA),
      natureza_prazo: prazoInformado ? 'encerramento_inscricoes' : 'vaga_aberta',
      abrangencia: regiao.abrangencia,
      ...(regiao.ufs ? { ufs: regiao.ufs } : {}),
      publico: 'pessoa',
      ...(textoSimples(vaga.content) ? { descricao: textoSimples(vaga.content) } : {}),
    }
  }

  return {
    id_externo: String(vaga.id),
    conteudo: vaga,
    candidato,
    ...(candidato ? {} : { motivo: `Vaga fora do Brasil e não remota (${vaga.location?.name ?? 'sem local'})` }),
  }
}

export async function lerGreenhouse(configuracao: unknown, buscar: Buscar, hojeISO: string): Promise<ItemLido[]> {
  const board = (configuracao as { board?: unknown } | null)?.board
  if (typeof board !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(board)) {
    throw new Error('Configuração da fonte sem "board" válido do Greenhouse')
  }

  const resposta = await buscar(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`)
  if (!resposta.ok) throw new Error(`Greenhouse respondeu ${resposta.status}`)

  const corpo = (await resposta.json()) as { jobs?: VagaGreenhouse[] }
  if (!Array.isArray(corpo.jobs)) throw new Error('Resposta do Greenhouse sem lista de vagas')

  return corpo.jobs.map((vaga) => mapearVaga(vaga, hojeISO))
}
