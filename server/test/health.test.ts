import { describe, expect, it } from 'vitest'
import { GET } from '../api/health.js'
import { healthStatus } from '../src/health.js'

describe('GET /api/health', () => {
  it('responde 200 com o status do serviço', async () => {
    const response = GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'matchmaking-mcp' })
  })

  it('informa o commit publicado quando a Vercel o fornece', () => {
    expect(healthStatus({ VERCEL_GIT_COMMIT_SHA: 'abc123' }).versao).toBe('abc123')
    expect(healthStatus({}).versao).toBeNull()
  })
})
