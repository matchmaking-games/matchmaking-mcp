/**
 * Mapa de UFs brasileiras para normalização de estados.
 *
 * Aceita qualquer variação de entrada (sigla, nome completo, sem acento)
 * e normaliza para o formato correto. Usado em todas as tools que recebem
 * ou retornam estado como parâmetro.
 */

const UF_MAP: Record<string, string> = {
  AC: 'Acre',       AL: 'Alagoas',          AP: 'Amapá',
  AM: 'Amazonas',   BA: 'Bahia',            CE: 'Ceará',
  DF: 'Distrito Federal',                   ES: 'Espírito Santo',
  GO: 'Goiás',      MA: 'Maranhão',         MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',                 MG: 'Minas Gerais',
  PA: 'Pará',       PB: 'Paraíba',          PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí',            RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',                RS: 'Rio Grande do Sul',
  RO: 'Rondônia',   RR: 'Roraima',          SC: 'Santa Catarina',
  SP: 'São Paulo',  SE: 'Sergipe',          TO: 'Tocantins',
}

function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Converte qualquer variação de nome de estado para sigla.
 * Retorna null se a entrada não for reconhecida.
 *
 * @example
 * toUFSigla('rio de janeiro') // 'RJ'
 * toUFSigla('MG')             // 'MG'
 * toUFSigla('invalido')       // null
 */
export function toUFSigla(input: string): string | null {
  const upper = input.trim().toUpperCase()
  if (UF_MAP[upper]) return upper
  const norm = normalizeStr(input)
  const entry = Object.entries(UF_MAP).find(([, nome]) => normalizeStr(nome) === norm)
  return entry ? entry[0] : null
}

/**
 * Converte sigla para nome completo.
 * Retorna a própria sigla se não encontrada.
 *
 * @example
 * toUFNome('MG') // 'Minas Gerais'
 * toUFNome('sp') // 'São Paulo'
 */
export function toUFNome(sigla: string): string {
  return UF_MAP[sigla.toUpperCase()] ?? sigla
}

/**
 * Converte array de siglas para nomes completos.
 */
export function toUFNomes(siglas: string[]): string[] {
  return siglas.map(toUFNome)
}

/**
 * Converte array de entradas livres para siglas, filtrando inválidas.
 */
export function toUFSiglas(inputs: string[]): string[] {
  return inputs.flatMap((input) => {
    const sigla = toUFSigla(input)
    return sigla ? [sigla] : []
  })
}
