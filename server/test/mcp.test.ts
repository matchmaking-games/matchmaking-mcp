import { describe, expect, it } from 'vitest'
import type { Usuario } from '../src/autenticacao.js'
import { tratarRequisicaoMcp, type DependenciasMcp } from '../src/mcp.js'
import { ErroVitrine, type FiltrosVitrine, type OportunidadeVitrine } from '../src/vitrine.js'

interface RespostaJsonRpc {
  result?: {
    serverInfo?: { name: string }
    tools?: { name: string; annotations?: { readOnlyHint?: boolean } }[]
    content?: { type: string; text: string }[]
    isError?: boolean
  }
  error?: { code: number; message: string }
}

const visitante: Usuario = { id: 'u-1', visitante: true, clientId: 'cliente-1', escopos: [], expiraEm: 4102444800 }
const conta: Usuario = { ...visitante, id: 'u-2', visitante: false }

const exemplo: OportunidadeVitrine = {
  id: 'o-1',
  titulo: '[Exemplo] Edital de fomento a jogos independentes de São Paulo',
  tipo: 'edital_fomento',
  link_oficial: 'https://matchmaking.games',
  prazo: '2026-12-15',
  natureza_prazo: 'encerramento_inscricoes',
  abrangencia: 'estado',
  ufs: ['SP'],
  publico: 'ambos',
  descricao: null,
  valor: 'Até R$ 50 mil por projeto',
  publico_especifico: null,
  fonte: 'Exemplos da Matchmaking (dados fictícios)',
}

function dependencias(
  usuario: Usuario | null,
  consultas: FiltrosVitrine[] = [],
  resultado: OportunidadeVitrine[] | Error = [exemplo],
): DependenciasMcp {
  return {
    verificarToken: async (token) => (token === 'valido' ? usuario : null),
    consultarVitrine: async (_token, filtros) => {
      consultas.push(filtros)
      if (resultado instanceof Error) throw resultado
      return resultado
    },
  }
}

function requisicao(corpo: unknown, token?: string, metodo = 'POST'): Request {
  const cabecalhos: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (token) cabecalhos.authorization = `Bearer ${token}`
  return new Request('https://mcp-dev.matchmaking.games/mcp', {
    method: metodo,
    headers: cabecalhos,
    body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
  })
}

const INICIALIZAR = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1.0.0' } },
}

function chamarFerramenta(nome: string, argumentos: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: nome, arguments: argumentos } }
}

async function lerJsonRpc(resposta: Response): Promise<RespostaJsonRpc> {
  return (await resposta.json()) as RespostaJsonRpc
}

describe('acesso ao /mcp', () => {
  it('sem acesso responde 401 e aponta para os metadados', async () => {
    const resposta = await tratarRequisicaoMcp(requisicao(INICIALIZAR), dependencias(visitante))

    expect(resposta.status).toBe(401)
    expect(resposta.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://mcp-dev.matchmaking.games/.well-known/oauth-protected-resource"',
    )
    expect(resposta.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate')
  })

  it('com acesso inválido responde 401 invalid_token', async () => {
    const resposta = await tratarRequisicaoMcp(requisicao(INICIALIZAR, 'falso'), dependencias(visitante))

    expect(resposta.status).toBe(401)
    expect(resposta.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('responde ao pré-voo do navegador sem pedir acesso', async () => {
    const resposta = await tratarRequisicaoMcp(requisicao(undefined, undefined, 'OPTIONS'), dependencias(null))

    expect(resposta.status).toBe(204)
    expect(resposta.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('com acesso válido recusa GET, porque não há sessão', async () => {
    const resposta = await tratarRequisicaoMcp(requisicao(undefined, 'valido', 'GET'), dependencias(visitante))

    expect(resposta.status).toBe(405)
  })
})

describe('ferramentas', () => {
  it('inicializa e lista as duas ferramentas, só de leitura', async () => {
    const inicio = await lerJsonRpc(await tratarRequisicaoMcp(requisicao(INICIALIZAR, 'valido'), dependencias(visitante)))
    expect(inicio.result?.serverInfo?.name).toBe('matchmaking')

    const lista = await lerJsonRpc(
      await tratarRequisicaoMcp(requisicao({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'valido'), dependencias(visitante)),
    )
    expect(lista.result?.tools?.map((ferramenta) => ferramenta.name)).toEqual(['o_que_posso_fazer', 'buscar_oportunidades'])
    expect(lista.result?.tools?.every((ferramenta) => ferramenta.annotations?.readOnlyHint === true)).toBe(true)
  })

  it('o_que_posso_fazer diz quando a pessoa é visitante', async () => {
    const resposta = await lerJsonRpc(
      await tratarRequisicaoMcp(requisicao(chamarFerramenta('o_que_posso_fazer'), 'valido'), dependencias(visitante)),
    )
    expect(resposta.result?.content?.[0]?.text).toContain('visitante')
    expect(resposta.result?.content?.[0]?.text).not.toContain('fictíc')
    expect(resposta.result?.content?.[0]?.text).toContain('Environment Artist')
  })

  it('o_que_posso_fazer diz quando a pessoa entrou com a conta', async () => {
    const resposta = await lerJsonRpc(
      await tratarRequisicaoMcp(requisicao(chamarFerramenta('o_que_posso_fazer'), 'valido'), dependencias(conta)),
    )
    expect(resposta.result?.content?.[0]?.text).toContain('com a sua conta')
  })

  it('buscar_oportunidades repassa os filtros e mostra link e fonte', async () => {
    const consultas: FiltrosVitrine[] = []
    const resposta = await lerJsonRpc(
      await tratarRequisicaoMcp(
        requisicao(chamarFerramenta('buscar_oportunidades', { uf: 'SP', limite: 3 }), 'valido'),
        dependencias(visitante, consultas),
      ),
    )

    expect(consultas).toEqual([{ tipo: undefined, uf: 'SP', texto: undefined, limite: 3 }])
    const texto = resposta.result?.content?.[0]?.text ?? ''
    expect(texto).toContain('Inscrições até 15/12/2026')
    expect(texto).toContain('Fonte: Exemplos da Matchmaking')
    expect(texto).toContain('Link oficial: https://matchmaking.games')
  })

  it('buscar_oportunidades usa 5 resultados quando o limite não vem', async () => {
    const consultas: FiltrosVitrine[] = []
    await tratarRequisicaoMcp(requisicao(chamarFerramenta('buscar_oportunidades'), 'valido'), dependencias(visitante, consultas))

    expect(consultas[0]?.limite).toBe(5)
  })

  it('buscar_oportunidades avisa quando não há resultados', async () => {
    const resposta = await lerJsonRpc(
      await tratarRequisicaoMcp(requisicao(chamarFerramenta('buscar_oportunidades'), 'valido'), dependencias(visitante, [], [])),
    )
    expect(resposta.result?.content?.[0]?.text).toContain('Não encontrei')
  })

  it('buscar_oportunidades recusa estado inexistente', async () => {
    const consultas: FiltrosVitrine[] = []
    const resposta = await lerJsonRpc(
      await tratarRequisicaoMcp(
        requisicao(chamarFerramenta('buscar_oportunidades', { uf: 'XX' }), 'valido'),
        dependencias(visitante, consultas),
      ),
    )

    expect(resposta.error !== undefined || resposta.result?.isError === true).toBe(true)
    expect(consultas).toEqual([])
  })

  it('buscar_oportunidades devolve um erro amigável quando a vitrine falha', async () => {
    const resposta = await lerJsonRpc(
      await tratarRequisicaoMcp(
        requisicao(chamarFerramenta('buscar_oportunidades'), 'valido'),
        dependencias(visitante, [], new ErroVitrine('schema must be one of the following')),
      ),
    )

    expect(resposta.result?.isError).toBe(true)
    expect(resposta.result?.content?.[0]?.text).toContain('Não consegui consultar')
  })
})
