import { describe, expect, it } from 'vitest'
import { GET } from '../api/health.js'

describe('GET /api/health', () => {
  it('responde 200 com o status do serviço', async () => {
    const response = GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'ok', service: 'matchmaking-mcp' })
  })
})
