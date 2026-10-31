// Leitor de planilha do Google publicada na web como CSV (modelo em modelos/planilha-de-oportunidades.csv).
// Configuração da fonte: { "url": "https://docs.google.com/spreadsheets/.../pub?output=csv" }.
// A planilha é a lista inteira da fonte: linha apagada sai do índice, e linha sem prazo fica aberta
// enquanto estiver lá. Sem IA: cada coluna é lida por regra, e linha mal preenchida é recusada com motivo.
import type { Abrangencia, Buscar, Candidato, ItemLido } from './tipos.ts'

// Linha sem prazo fica aberta por este tempo, renovado a cada leitura enquanto a linha existir.
export const DIAS_SEM_PRAZO = 14

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Nome mostrado no modelo (normalizado) → código do contrato. O código também é aceito.
const TIPOS: Record<string, string> = {
  vaga: 'vaga',
  'edital ou fomento': 'edital_fomento',
  'game jam': 'game_jam',
  evento: 'evento',
  'chamada de festival ou vitrine': 'chamada_festival_vitrine',
  'curso ou capacitacao': 'curso_capacitacao',
  mentoria: 'mentoria',
  'aceleracao ou incubacao': 'aceleracao_incubacao',
  'chamada de publisher': 'chamada_publisher',
  'terceirizacao ou co-desenvolvimento': 'terceirizacao_codesenvolvimento',
}
for (const codigo of Object.values(TIPOS)) TIPOS[codigo] = codigo

const PUBLICOS: Record<string, Candidato['publico']> = {
  pessoa: 'pessoa', pessoas: 'pessoa',
  empresa: 'empresa', empresas: 'empresa', estudio: 'empresa', estudios: 'empresa',
  ambos: 'ambos', 'pessoas e empresas': 'ambos',
}

const ABRANGENCIAS: Record<string, Abrangencia> = {
  nacional: 'nacional', brasil: 'nacional',
  remoto: 'remoto', online: 'remoto',
  internacional: 'internacional',
}

const COLUNAS = {
  titulo: 'titulo',
  tipo: 'tipo',
  link: 'link oficial',
  prazo: 'prazo',
  regiao: 'regiao',
  publico: 'quem pode participar',
  descricao: 'descricao',
} as const

// CSV conforme a RFC 4180: campos entre aspas podem ter vírgulas, quebras de linha e aspas dobradas.
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let entreAspas = false
  const t = texto.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entreAspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') {
        entreAspas = false
      } else {
        campo += c
      }
    } else if (c === '"') {
      entreAspas = true
    } else if (c === ',') {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas
}

// Prazo em dia/mês/ano (ou ano-mês-dia). Devolve null para vazio e lança erro para data inválida.
export function lerPrazo(valor: string): string | null {
  const texto = valor.trim()
  if (!texto) return null
  let ano: number, mes: number, dia: number
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (br) [dia, mes, ano] = [Number(br[1]), Number(br[2]), Number(br[3])]
  else if (iso) [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else throw new Error(`Prazo "${texto}" fora do formato dia/mês/ano`)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new Error(`Prazo "${texto}" não é uma data que existe`)
  }
  return data.toISOString().slice(0, 10)
}

export function lerRegiao(valor: string): { abrangencia: Abrangencia; ufs?: string[] } {
  const texto = normalizar(valor)
  const abrangencia = ABRANGENCIAS[texto]
  if (abrangencia) return { abrangencia }
  const siglas = valor.split(/[,;/]| e /).map((parte) => parte.trim().toUpperCase()).filter(Boolean)
  if (siglas.length > 0 && siglas.every((sigla) => UFS.has(sigla))) return { abrangencia: 'estado', ufs: [...new Set(siglas)] }
  throw new Error(`Região "${valor.trim()}" não reconhecida: use siglas de estado, Nacional, Remoto ou Internacional`)
}

function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

function linkValido(valor: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(valor).protocol)
  } catch {
    return false
  }
}

export function mapearLinha(celulas: Record<string, string>, numero: number, hojeISO: string): ItemLido {
  const titulo = (celulas.titulo ?? '').trim()
  const link = (celulas.link ?? '').trim()
  // O número da linha fica fora do conteúdo guardado: inserir uma linha acima não muda os itens de baixo.
  const conteudo = { ...celulas }
  const id_externo = link || `linha-${numero}`

  if (/^exemplo\s*:/i.test(titulo)) {
    return { id_externo, conteudo, candidato: null, motivo: 'Linha de exemplo do modelo' }
  }

  try {
    if (titulo.length < 3) throw new Error('Falta o título')
    if (!linkValido(link)) throw new Error('O link oficial precisa começar com https:// (ou http://)')
    const tipo = TIPOS[normalizar(celulas.tipo ?? '')]
    if (!tipo) throw new Error(`Tipo "${(celulas.tipo ?? '').trim()}" fora da lista do modelo`)
    const publico = PUBLICOS[normalizar(celulas.publico ?? '')]
    if (!publico) throw new Error(`"Quem pode participar" deve ser Pessoas, Empresas ou Ambos`)
    const regiao = lerRegiao(celulas.regiao ?? '')
    const prazo = lerPrazo(celulas.prazo ?? '')
    const descricao = (celulas.descricao ?? '').trim().slice(0, 500)

    const candidato: Candidato = {
      titulo: titulo.slice(0, 200),
      tipo,
      link_oficial: link,
      prazo: prazo ?? somarDias(hojeISO, DIAS_SEM_PRAZO),
      natureza_prazo: prazo ? 'encerramento_inscricoes' : 'aberta_sem_data',
      abrangencia: regiao.abrangencia,
      ...(regiao.ufs ? { ufs: regiao.ufs } : {}),
      publico,
      ...(descricao ? { descricao } : {}),
    }
    return { id_externo, conteudo, candidato }
  } catch (erro) {
    return { id_externo, conteudo, candidato: null, problema: `Linha ${numero}: ${erro instanceof Error ? erro.message : String(erro)}` }
  }
}

export async function lerPlanilha(configuracao: unknown, buscar: Buscar, hojeISO: string): Promise<ItemLido[]> {
  const url = (configuracao as { url?: unknown } | null)?.url
  if (typeof url !== 'string' || !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) {
    throw new Error('Configuração da fonte sem "url" de planilha publicada do Google')
  }

  const resposta = await buscar(url)
  if (!resposta.ok) throw new Error(`A planilha respondeu ${resposta.status}`)
  const texto = await resposta.text()
  if (/^\s*<(!doctype|html)/i.test(texto)) throw new Error('A planilha não está publicada como CSV')

  const [cabecalho = [], ...linhas] = lerCsv(texto)
  const nomes = cabecalho.map(normalizar)
  const posicao = Object.fromEntries(Object.entries(COLUNAS).map(([chave, nome]) => [chave, nomes.indexOf(nome)]))
  const faltando = Object.entries(COLUNAS).filter(([chave]) => chave !== 'descricao' && posicao[chave] === -1).map(([, nome]) => nome)
  if (faltando.length > 0) throw new Error(`A planilha não tem as colunas do modelo: ${faltando.join(', ')}`)

  const itens = linhas.flatMap((celulas, i) => {
    if (celulas.every((celula) => !celula.trim())) return []
    const porColuna = Object.fromEntries(
      Object.keys(COLUNAS).map((chave) => [chave, posicao[chave] === -1 ? '' : (celulas[posicao[chave]!] ?? '')]),
    )
    return [mapearLinha(porColuna, i + 2, hojeISO)]
  })

  // Proteção: sem nenhuma linha válida, a leitura falha e nada sai do índice.
  if (!itens.some((item) => item.candidato)) throw new Error('A planilha não tem nenhuma linha válida')
  return itens
}
