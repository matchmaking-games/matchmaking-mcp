import { ErroConfiguracao, lerConfiguracao } from '../src/config.js'
import { comCors } from '../src/mcp.js'
import { metadadosDoRecurso } from '../src/metadados.js'

export function GET(request: Request): Response {
  try {
    return comCors(
      Response.json(metadadosDoRecurso(request, lerConfiguracao()), {
        headers: { 'Cache-Control': 'public, max-age=300' },
      }),
    )
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) {
      return comCors(Response.json({ error: 'server_misconfigured', error_description: erro.message }, { status: 500 }))
    }
    throw erro
  }
}

export function OPTIONS(): Response {
  return comCors(new Response(null, { status: 204 }))
}
