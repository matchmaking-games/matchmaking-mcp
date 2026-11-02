// Abre um link e diz se ele funciona. Só "quebrado" tem consequência; na dúvida, a resposta é "incerto",
// porque tirar do ar uma oportunidade viva é pior do que manter um link por mais alguns dias.

export type ResultadoLink = 'abre' | 'quebrado' | 'incerto'

// Abre o endereço sem seguir redirecionamentos: cada salto passa pela checagem de endereço seguro.
export type Abrir = (url: string) => Promise<Response>

const MAXIMO_DE_REDIRECIONAMENTOS = 5

function segmentos(caminho: string): string[] {
  return caminho.split('/').filter(Boolean)
}

// O site mandou para uma página mais genérica que a pedida: é assim que muitos respondem a uma página que
// não existe mais. A vaga fechada no Greenhouse vai para a lista de vagas, com "?error=true".
export function paginaMaisGenerica(original: string, final: string): boolean {
  const a = new URL(original)
  const b = new URL(final)
  if (b.searchParams.get('error') === 'true') return true
  const pedida = segmentos(a.pathname)
  const recebida = segmentos(b.pathname)
  return recebida.length < pedida.length && recebida.every((parte, indice) => parte === pedida[indice])
}

export function classificarResposta(original: string, status: number, final: string): ResultadoLink {
  if (status === 404 || status === 410) return 'quebrado'
  if (status >= 200 && status < 300) return paginaMaisGenerica(original, final) ? 'quebrado' : 'abre'
  // 401, 403 e 429 costumam ser bloqueio de robôs; 5xx, instabilidade.
  return 'incerto'
}

// Os links vêm de fontes externas: nunca seguimos para endereços internos.
export function enderecoSeguro(url: string): boolean {
  try {
    const { protocol, hostname, port } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (port !== '' && port !== '80' && port !== '443') return false
    const host = hostname.toLowerCase()
    if (!host.includes('.') || /\.(local|internal|localhost)$/.test(host)) return false
    // Endereço escrito só com números (IPv4) ou entre colchetes (IPv6).
    if (/^[\d.]+$/.test(host) || host.startsWith('[')) return false
    return true
  } catch {
    return false
  }
}

function dominioInexistente(erro: unknown): boolean {
  const textos = [erro, (erro as { cause?: unknown } | null)?.cause].map((parte) => (parte instanceof Error ? parte.message : String(parte)))
  return textos.some((texto) => /dns error|failed to lookup|name or service not known|no such host|enotfound/i.test(texto))
}

export interface LinkConferido {
  resultado: ResultadoLink
  resposta?: Response
}

export async function conferirLink(url: string, abrir: Abrir): Promise<LinkConferido> {
  let atual = url
  try {
    for (let salto = 0; salto <= MAXIMO_DE_REDIRECIONAMENTOS; salto++) {
      if (!enderecoSeguro(atual)) return { resultado: 'incerto' }
      const resposta = await abrir(atual)
      const destino = resposta.headers.get('location')
      if (resposta.status >= 300 && resposta.status < 400 && destino) {
        await resposta.body?.cancel()
        atual = new URL(destino, atual).toString()
        continue
      }
      const resultado = classificarResposta(url, resposta.status, atual)
      if (resultado !== 'abre') await resposta.body?.cancel()
      return { resultado, resposta: resultado === 'abre' ? resposta : undefined }
    }
    return { resultado: 'incerto' }
  } catch (erro) {
    return { resultado: dominioInexistente(erro) ? 'quebrado' : 'incerto' }
  }
}
