import { healthStatus } from '../src/health.js'

export function GET(): Response {
  return Response.json(healthStatus(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
