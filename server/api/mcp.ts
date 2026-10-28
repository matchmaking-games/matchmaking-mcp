import { criarVerificadorSupabase } from '../src/autenticacao.js'
import { ErroConfiguracao, lerConfiguracao } from '../src/config.js'
import { comCors, tratarRequisicaoMcp, type DependenciasMcp } from '../src/mcp.js'
import { criarConsultaVitrine } from '../src/vitrine.js'

let dependencias: DependenciasMcp | undefined

function obterDependencias(): DependenciasMcp {
  if (!dependencias) {
    const config = lerConfiguracao()
    dependencias = {
      verificarToken: criarVerificadorSupabase(config),
      consultarVitrine: criarConsultaVitrine(config),
    }
  }
  return dependencias
}

async function tratar(request: Request): Promise<Response> {
  try {
    return await tratarRequisicaoMcp(request, obterDependencias())
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) {
      return comCors(Response.json({ error: 'server_misconfigured', error_description: erro.message }, { status: 500 }))
    }
    throw erro
  }
}

export function GET(request: Request): Promise<Response> {
  return tratar(request)
}

export function POST(request: Request): Promise<Response> {
  return tratar(request)
}

export function DELETE(request: Request): Promise<Response> {
  return tratar(request)
}

export function OPTIONS(request: Request): Promise<Response> {
  return tratar(request)
}
