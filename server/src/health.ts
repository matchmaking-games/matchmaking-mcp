// Resposta do endpoint de saúde. Fica separada da função da Vercel para ser testável.
export const SERVICE_NAME = 'matchmaking-mcp'

export interface HealthStatus {
  status: 'ok'
  service: typeof SERVICE_NAME
}

export function healthStatus(): HealthStatus {
  return { status: 'ok', service: SERVICE_NAME }
}
