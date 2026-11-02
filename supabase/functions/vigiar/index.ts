// Vigia: o agendador do banco chama esta função uma vez por dia. Ela confere as fontes, a coleta, a
// conferência, o login e o servidor do MCP, e só manda e-mail se houver problema.
// Corpo { "teste": true }: manda um e-mail de teste, para conferir a configuração.
// Segredos: RESEND_API_KEY, AVISOS_DE (remetente de um domínio verificado no Resend) e AVISOS_PARA.
// MCP_URL: endereço do servidor; sem ele, vale o de dev. Na produção, precisa ser configurado.
import postgres from 'npm:postgres@3.4.5'
import { checarLogin, checarServidor, enviarAviso, montarAviso, type Aviso, type Buscar } from '../_shared/vigia/vigia.ts'

function chamadaDoAgendador(req: Request): boolean {
  const segredo = Deno.env.get('CRON_SECRET')
  if (!segredo) return false
  const recebido = req.headers.get('Authorization') ?? ''
  const esperado = `Bearer ${segredo}`
  if (recebido.length !== esperado.length) return false
  let diferenca = 0
  for (let i = 0; i < esperado.length; i++) diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return diferenca === 0
}

const buscar: Buscar = (url) => fetch(url, { signal: AbortSignal.timeout(15_000) })

async function avisar(aviso: Aviso): Promise<void> {
  const chave = Deno.env.get('RESEND_API_KEY')
  const de = Deno.env.get('AVISOS_DE')
  const para = Deno.env.get('AVISOS_PARA')
  if (!chave || !de || !para) throw new Error('Faltam os segredos RESEND_API_KEY, AVISOS_DE ou AVISOS_PARA nas funções do Supabase')
  await enviarAviso(aviso, { chave, de, para }, fetch)
}

Deno.serve(async (req) => {
  if (!chamadaDoAgendador(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const ambiente = new URL(supabaseUrl).hostname.split('.')[0]!
  const corpo = (await req.json().catch(() => null)) as { teste?: unknown } | null

  try {
    if (corpo?.teste === true) {
      await avisar({ assunto: `[Matchmaking MCP] Teste do aviso em ${ambiente}`, texto: 'Se você recebeu este e-mail, os avisos do vigia estão funcionando.' })
      return Response.json({ teste: 'enviado' })
    }

    const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
    let problemas: string[]
    try {
      const [linha] = await sql`select oportunidades.problemas_do_sistema() as problemas`
      problemas = linha.problemas as string[]
    } finally {
      await sql.end()
    }

    const mcpUrl = Deno.env.get('MCP_URL') ?? 'https://mcp-dev.matchmaking.games'
    problemas.push(...(await checarLogin(supabaseUrl, buscar)), ...(await checarServidor(mcpUrl, buscar)))

    if (problemas.length > 0) await avisar(montarAviso(ambiente, problemas))
    return Response.json({ problemas, avisado: problemas.length > 0 })
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : String(erro) }, { status: 500 })
  }
})
