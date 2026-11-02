import { describe, expect, it } from 'vitest'
import { checarLogin, checarServidor, enviarAviso, montarAviso, type Buscar } from '../../supabase/functions/_shared/vigia/vigia.ts'

const SUPABASE = 'https://projeto.supabase.co'
const MCP = 'https://mcp-dev.matchmaking.games'

function resposta(status: number, corpo: unknown = {}): Buscar {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => corpo })
}

describe('checarLogin', () => {
  it('login ligado, com registro dinâmico, não é problema', async () => {
    expect(await checarLogin(SUPABASE, resposta(200, { registration_endpoint: `${SUPABASE}/auth/v1/oauth/clients/register` }))).toEqual([])
  })

  it('avisa quando o servidor de login está desligado', async () => {
    const [problema] = await checarLogin(SUPABASE, resposta(404, { msg: 'OAuth server is disabled' }))
    expect(problema).toContain('respondeu 404')
  })

  it('avisa quando o registro dinâmico está desligado', async () => {
    const [problema] = await checarLogin(SUPABASE, resposta(200, {}))
    expect(problema).toContain('registro dinâmico')
  })

  it('avisa quando não consegue consultar', async () => {
    const [problema] = await checarLogin(SUPABASE, () => Promise.reject(new Error('tempo esgotado')))
    expect(problema).toContain('tempo esgotado')
  })
})

describe('checarServidor', () => {
  it('confere a resposta de saúde', async () => {
    expect(await checarServidor(MCP, resposta(200, { status: 'ok' }))).toEqual([])
    expect((await checarServidor(MCP, resposta(500)))[0]).toContain('respondeu 500')
    expect(await checarServidor(MCP, resposta(200, { status: 'ruim' }))).toHaveLength(1)
    expect((await checarServidor(MCP, () => Promise.reject(new Error('fora do ar'))))[0]).toContain('fora do ar')
  })
})

describe('aviso', () => {
  it('monta o e-mail com todos os problemas', () => {
    expect(montarAviso('dev', ['Um']).assunto).toBe('[Matchmaking MCP] 1 problema em dev')
    const aviso = montarAviso('dev', ['Um', 'Dois'])
    expect(aviso.assunto).toBe('[Matchmaking MCP] 2 problemas em dev')
    expect(aviso.texto).toContain('- Um\n- Dois')
  })

  it('envia pelo Resend e acusa falha', async () => {
    const chamadas: Array<{ url: string; corpo: unknown; autorizacao: string | undefined }> = []
    await enviarAviso({ assunto: 'A', texto: 'T' }, { chave: 'k', de: 'avisos@x.games', para: 'p@x.games' }, async (url, init) => {
      chamadas.push({ url, corpo: JSON.parse(init.body), autorizacao: init.headers.Authorization })
      return { ok: true, status: 200 }
    })
    expect(chamadas).toEqual([{
      url: 'https://api.resend.com/emails',
      corpo: { from: 'avisos@x.games', to: ['p@x.games'], subject: 'A', text: 'T' },
      autorizacao: 'Bearer k',
    }])

    await expect(enviarAviso({ assunto: 'A', texto: 'T' }, { chave: 'k', de: 'a', para: 'b' }, async () => ({ ok: false, status: 403 }))).rejects.toThrow('403')
  })
})
