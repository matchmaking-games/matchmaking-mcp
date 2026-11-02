// Conferência: o agendador do banco chama esta função de hora em hora. Ela confere as oportunidades
// vencidas (cada uma volta aqui uma vez por semana) e o banco aplica as regras de cada resultado.
import postgres from 'npm:postgres@3.4.5'
import { conferirOportunidade, type ItemAConferir } from '../_shared/conferencia/conferir.ts'
import { criarVerificadorGemini, type VerificarAbertura } from '../_shared/ia/verificar-abertura.ts'

const MODELO_GEMINI = 'gemini-3.1-flash-lite'
const MAXIMO_POR_CHAMADA = 25
const EM_PARALELO = 5
const TEMPO_MAXIMO_MS = 100_000

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

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

const abrir = (url: string) =>
  fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': 'MatchmakingIndice/1.0 (+https://matchmaking.games)' },
    signal: AbortSignal.timeout(20_000),
  })

function criarVerificador(): VerificarAbertura {
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) return () => Promise.reject(new Error('Falta o segredo GEMINI_API_KEY nas funções do Supabase'))
  return criarVerificadorGemini({ chave, modelo: MODELO_GEMINI, postar: fetch })
}

Deno.serve(async (req) => {
  if (!chamadaDoAgendador(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  const inicio = Date.now()
  const verificar = criarVerificador()
  const hojeISO = hojeEmBrasilia()
  const totais: Record<string, number> = {}

  try {
    const itens = (await sql`select * from oportunidades.oportunidades_a_conferir(${MAXIMO_POR_CHAMADA})`) as unknown as ItemAConferir[]

    for (let i = 0; i < itens.length && Date.now() - inicio < TEMPO_MAXIMO_MS; i += EM_PARALELO) {
      const lote = itens.slice(i, i + EM_PARALELO)
      const conferencias = await Promise.all(lote.map((item) => conferirOportunidade(item, { abrir, verificar, hojeISO })))
      for (const [indice, conferencia] of conferencias.entries()) {
        const [linha] = await sql`
          select oportunidades.registrar_conferencia(
            ${lote[indice].id}::uuid, ${conferencia.link}, ${conferencia.noticiaAbre}, ${conferencia.abertura}, ${conferencia.detalhe}
          ) as efeito`
        totais[linha.efeito] = (totais[linha.efeito] ?? 0) + 1
      }
    }
    return Response.json({ conferidas: itens.length, totais })
  } finally {
    await sql.end()
  }
})
