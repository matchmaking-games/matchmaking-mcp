// Coleta: o agendador do banco chama esta função de tempos em tempos.
// A cada chamada, ela lê as fontes com leitura vencida, uma por vez, guarda os itens como
// chegaram, passa todos pelo portão de qualidade e registra o resultado de cada leitura.
import postgres from 'npm:postgres@3.4.5'
import { lerGreenhouse } from '../_shared/leitores/greenhouse.ts'
import type { Buscar, ItemLido } from '../_shared/leitores/tipos.ts'

type Leitor = (configuracao: unknown, buscar: Buscar, hojeISO: string) => Promise<ItemLido[]>

const LEITORES: Record<string, Leitor> = {
  greenhouse: lerGreenhouse,
}

// Cada execução tem até 150 segundos no plano gratuito; paramos antes para fechar tudo direito.
const TEMPO_MAXIMO_MS = 100_000
const MAXIMO_DE_FONTES = 5

// Só o agendador chama esta função: ele envia a senha CRON_SECRET, guardada no Vault,
// e a mesma senha fica nos segredos das funções. Sem a senha configurada, recusa tudo.
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

async function hashDoConteudo(conteudo: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(conteudo))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const buscar: Buscar = (url) =>
  fetch(url, { headers: { 'User-Agent': 'MatchmakingIndice/1.0 (+https://matchmaking.games)' }, signal: AbortSignal.timeout(20_000) })

Deno.serve(async (req) => {
  if (!chamadaDoAgendador(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  const inicio = Date.now()
  const leituras: Array<Record<string, unknown>> = []

  try {
    while (leituras.length < MAXIMO_DE_FONTES && Date.now() - inicio < TEMPO_MAXIMO_MS) {
      const [fonte] = await sql`select * from oportunidades.reservar_proxima_fonte()`
      if (!fonte) break

      try {
        const leitor = LEITORES[fonte.leitor as string]
        if (!leitor) throw new Error(`Leitor desconhecido: ${fonte.leitor}`)

        const itens = await leitor(fonte.configuracao, buscar, hojeEmBrasilia())
        let novos = 0
        for (const item of itens) {
          const inseridos = await sql`
            insert into oportunidades.itens_brutos (fonte_id, id_externo, conteudo, hash_conteudo, candidato)
            values (${fonte.fonte_id}, ${item.id_externo}, ${sql.json(item.conteudo as never)},
                    ${await hashDoConteudo(item.conteudo)}, ${item.candidato ? sql.json(item.candidato as never) : null})
            on conflict (fonte_id, hash_conteudo) do nothing
            returning id`
          novos += inseridos.length
        }

        const links = itens.flatMap((item) => (item.candidato ? [item.candidato.link_oficial] : []))
        const [{ encerradas }] = await sql`select oportunidades.encerrar_ausentes(${fonte.fonte_id}, ${links}) as encerradas`
        await sql`select oportunidades.registrar_fim_leitura(${fonte.leitura_id}, null, ${itens.length}, ${novos})`
        leituras.push({ fonte: fonte.fonte_id, lidos: itens.length, novos, encerradas })
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro)
        await sql`select oportunidades.registrar_fim_leitura(${fonte.leitura_id}, ${mensagem})`
        leituras.push({ fonte: fonte.fonte_id, erro: mensagem })
      }
    }

    const [portao] = await sql`select * from oportunidades.processar_pendentes(500)`
    return Response.json({ leituras, portao })
  } finally {
    await sql.end()
  }
})
