import { describe, expect, it } from 'vitest'
import { metadadosDoRecurso, origemPublica } from '../src/metadados.js'

const config = { supabaseUrl: 'https://exemplo.supabase.co', supabaseChavePublica: 'sb_publishable_x' }

describe('metadados do recurso protegido', () => {
  it('apontam para o servidor de autorização do Supabase', () => {
    const request = new Request('https://mcp-dev.matchmaking.games/.well-known/oauth-protected-resource')

    expect(metadadosDoRecurso(request, config)).toMatchObject({
      resource: 'https://mcp-dev.matchmaking.games/mcp',
      authorization_servers: ['https://exemplo.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
    })
  })

  it('usam o endereço público quando a chamada passa por um proxy', () => {
    const request = new Request('http://interno.local/api/oauth-protected-resource', {
      headers: { 'x-forwarded-host': 'mcp-dev.matchmaking.games', 'x-forwarded-proto': 'https' },
    })

    expect(origemPublica(request)).toBe('https://mcp-dev.matchmaking.games')
  })
})
