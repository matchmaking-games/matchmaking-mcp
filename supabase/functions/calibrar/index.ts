// Calibragem: reavalia, com a régua atual da IA, itens que já foram lidos e devolve a classe e a nota
// de cada um, sem gravar nada no índice. Serve para comparar a IA com as marcações humanas depois de
// ajustar as instruções. Corpo: { "itens": [{ "id": "<id>", "origem": "noticia" | "bruto" }] }.
import postgres from 'npm:postgres@3.4.5'
import { criarClassificadorGemini } from '../_shared/ia/classificar.ts'

const MODELO_GEMINI = 'gemini-3.1-flash-lite'
const MAXIMO_DE_ITENS = 60
const EM_PARALELO = 10

function chamadaAutorizada(req: Request): boolean {
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

interface Pedido {
  id: string
  origem: 'noticia' | 'bruto'
}

Deno.serve(async (req) => {
  if (!chamadaAutorizada(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) return Response.json({ error: 'Falta o segredo GEMINI_API_KEY' }, { status: 500 })

  const corpo = (await req.json().catch(() => null)) as { itens?: Pedido[] } | null
  const pedidos = (corpo?.itens ?? [])
    .filter((p) => typeof p?.id === 'string' && (p.origem === 'noticia' || p.origem === 'bruto'))
    .slice(0, MAXIMO_DE_ITENS)
  if (pedidos.length === 0) return Response.json({ error: 'Nenhum item válido' }, { status: 400 })

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  try {
    const brutos = await sql`
      select p.id, b.conteudo
      from jsonb_to_recordset(${sql.json(pedidos as never)}) as p (id text, origem text)
      left join oportunidades.noticias n on p.origem = 'noticia' and n.id::text = p.id
      join oportunidades.itens_brutos b on b.id = coalesce(n.item_bruto_id, case when p.origem = 'bruto' then p.id::uuid end)`

    const classificar = criarClassificadorGemini({ chave, modelo: MODELO_GEMINI, postar: fetch })
    const hojeISO = hojeEmBrasilia()
    const resultados: Array<Record<string, unknown>> = []

    for (let i = 0; i < brutos.length; i += EM_PARALELO) {
      const lote = brutos.slice(i, i + EM_PARALELO)
      resultados.push(...(await Promise.all(lote.map(async (linha) => {
        const conteudo = linha.conteudo as { feed?: { titulo?: string; link?: string; publicado_em?: string; resumo?: string }; texto?: string }
        const feed = conteudo.feed ?? {}
        try {
          const c = await classificar({
            titulo: feed.titulo ?? '',
            link: feed.link ?? 'https://exemplo.invalid',
            publicado_em: feed.publicado_em,
            texto: conteudo.texto || feed.resumo || '',
            hojeISO,
          })
          return { id: linha.id, classe: c.classe, nota: c.noticia?.nota ?? null, motivo: c.motivo }
        } catch (erro) {
          return { id: linha.id, erro: erro instanceof Error ? erro.message : String(erro) }
        }
      }))))
    }
    return Response.json({ resultados })
  } finally {
    await sql.end()
  }
})
