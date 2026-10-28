import { describe, expect, it } from 'vitest'
import { criarVerificador, extrairToken, lerUsuarioDosClaims } from '../src/autenticacao.js'
import { ErroConfiguracao, emissorDoSupabase, lerConfiguracao } from '../src/config.js'

const EMISSOR = 'https://exemplo.supabase.co/auth/v1'

const claims = {
  iss: EMISSOR,
  sub: '00000000-0000-4000-8000-000000000001',
  role: 'authenticated',
  exp: 4102444800,
  client_id: 'cliente-1',
  is_anonymous: true,
  scope: 'openid email',
}

describe('lerUsuarioDosClaims', () => {
  it('reconhece um visitante conectado por um aplicativo', () => {
    expect(lerUsuarioDosClaims(claims, EMISSOR)).toEqual({
      id: claims.sub,
      visitante: true,
      clientId: 'cliente-1',
      escopos: ['openid', 'email'],
      expiraEm: 4102444800,
    })
  })

  it('reconhece uma conta', () => {
    expect(lerUsuarioDosClaims({ ...claims, is_anonymous: false }, EMISSOR)?.visitante).toBe(false)
  })

  it('reconhece o visitante pelo método de login quando is_anonymous não vem', () => {
    const semMarcador = { ...claims, is_anonymous: undefined }

    expect(lerUsuarioDosClaims({ ...semMarcador, amr: [{ method: 'anonymous', timestamp: 1 }] }, EMISSOR)?.visitante).toBe(true)
    expect(lerUsuarioDosClaims({ ...semMarcador, amr: ['anonymous'] }, EMISSOR)?.visitante).toBe(true)
    expect(lerUsuarioDosClaims({ ...semMarcador, amr: [{ method: 'password', timestamp: 1 }] }, EMISSOR)?.visitante).toBe(false)
  })

  const recusados: Array<[string, Record<string, unknown>]> = [
    ['sem client_id (sessão do site)', { client_id: undefined }],
    ['de outro emissor', { iss: 'https://outro.supabase.co/auth/v1' }],
    ['com papel anon', { role: 'anon' }],
    ['sem identificação', { sub: '' }],
  ]

  it.each(recusados)('recusa acesso %s', (_caso, mudanca) => {
    expect(lerUsuarioDosClaims({ ...claims, ...mudanca }, EMISSOR)).toBeNull()
  })
})

describe('criarVerificador', () => {
  it('aceita um acesso conferido', async () => {
    const verificar = criarVerificador(async () => claims, EMISSOR)
    expect((await verificar('token'))?.clientId).toBe('cliente-1')
  })

  it('trata acesso recusado pelo Supabase como inválido', async () => {
    const verificar = criarVerificador(async () => null, EMISSOR)
    expect(await verificar('token')).toBeNull()
  })

  it('trata acesso malformado, que faz o Supabase lançar erro, como inválido', async () => {
    const verificar = criarVerificador(async () => {
      throw new SyntaxError('Unexpected token')
    }, EMISSOR)
    expect(await verificar('abc.def.ghi')).toBeNull()
  })
})

describe('extrairToken', () => {
  function comCabecalho(valor?: string): Request {
    return new Request('https://exemplo.org/mcp', { headers: valor ? { authorization: valor } : {} })
  }

  it('lê o acesso no formato Bearer', () => {
    expect(extrairToken(comCabecalho('Bearer abc.def.ghi'))).toBe('abc.def.ghi')
  })

  it.each([undefined, 'Basic abc', 'Bearer'])('ignora %s', (valor) => {
    expect(extrairToken(comCabecalho(valor))).toBeNull()
  })
})

describe('lerConfiguracao', () => {
  it('lê as variáveis e tira a barra do fim do endereço', () => {
    const config = lerConfiguracao({ SUPABASE_URL: 'https://exemplo.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })

    expect(config.supabaseUrl).toBe('https://exemplo.supabase.co')
    expect(emissorDoSupabase(config)).toBe(EMISSOR)
  })

  const incompletas: Array<[string, Record<string, string | undefined>]> = [
    ['sem variáveis', {}],
    ['sem a chave', { SUPABASE_URL: 'https://exemplo.supabase.co' }],
    ['com endereço sem https', { SUPABASE_URL: 'http://exemplo.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'x' }],
  ]

  it.each(incompletas)('recusa configuração %s', (_caso, ambiente) => {
    expect(() => lerConfiguracao(ambiente)).toThrow(ErroConfiguracao)
  })
})
