// Resposta do endpoint de saúde. Fica separada da função da Vercel para ser testável.
export const SERVICE_NAME = 'matchmaking-mcp'

export interface HealthStatus {
  status: 'ok'
  service: typeof SERVICE_NAME
  // Commit publicado, informado pela Vercel. Permite conferir que a versão nova já está no ar.
  versao: string | null
}

export function healthStatus(ambiente: Record<string, string | undefined> = process.env): HealthStatus {
  return { status: 'ok', service: SERVICE_NAME, versao: ambiente.VERCEL_GIT_COMMIT_SHA ?? null }
}
