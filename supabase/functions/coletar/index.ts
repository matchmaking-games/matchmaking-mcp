// Coleta: o agendador do banco chama esta função de tempos em tempos.
// A cada chamada, ela lê as fontes com leitura vencida, uma por vez, guarda os itens como
// chegaram, passa todos pelo portão de qualidade e registra o resultado de cada leitura.
import postgres from 'npm:postgres@3.4.5'
import { criarClassificadorGemini, type Classificar } from '../_shared/ia/classificar.ts'
import { lerGreenhouse } from '../_shared/leitores/greenhouse.ts'
import { lerPlanilha } from '../_shared/leitores/planilha.ts'
import { lerRss } from '../_shared/leitores/rss.ts'
import type { Buscar, ItemLido } from '../_shared/leitores/tipos.ts'

interface Contexto {
  jaVistos: Set<string>
  classificar: Classificar
  ate: number
}

interface Leitor {
  ler: (configuracao: unknown, buscar: Buscar, hojeISO: string, contexto: Contexto) => Promise<ItemLido[]>
  // A fonte mostra a lista inteira (o que sumiu, encerrou) ou só os itens mais recentes (RSS).
  listaCompleta: boolean
}

const LEITORES: Record<string, Leitor> = {
  greenhouse: { ler: lerGreenhouse, listaCompleta: true },
  rss: { ler: lerRss, listaCompleta: false },
  planilha: { ler: lerPlanilha, listaCompleta: true },
}

// Modelo da IA que classifica textos de fontes abertas. Trocar de modelo é mudar aqui.
const MODELO_GEMINI = 'gemini-3.1-flash-lite'

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

// A chave do Gemini só é exigida quando uma fonte precisa da IA.
function criarClassificador(): Classificar {
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) {
    return () => Promise.reject(new Error('Falta o segredo GEMINI_API_KEY nas funções do Supabase'))
  }
  return criarClassificadorGemini({ chave, modelo: MODELO_GEMINI, postar: fetch })
}

Deno.serve(async (req) => {
  if (!chamadaDoAgendador(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  const inicio = Date.now()
  const leituras: Array<Record<string, unknown>> = []
  const classificar = criarClassificador()

  try {
    while (leituras.length < MAXIMO_DE_FONTES && Date.now() - inicio < TEMPO_MAXIMO_MS) {
      const [fonte] = await sql`select * from oportunidades.reservar_proxima_fonte()`
      if (!fonte) break

      try {
        const leitor = LEITORES[fonte.leitor as string]
        if (!leitor) throw new Error(`Leitor desconhecido: ${fonte.leitor}`)

        const vistos = await sql`select id_externo from oportunidades.itens_brutos where fonte_id = ${fonte.fonte_id} and id_externo is not null`
        const contexto: Contexto = {
          jaVistos: new Set(vistos.map((linha) => linha.id_externo as string)),
          classificar,
          ate: inicio + TEMPO_MAXIMO_MS - 15_000,
        }

        const itens = await leitor.ler(fonte.configuracao, buscar, hojeEmBrasilia(), contexto)
        let novos = 0
        for (const item of itens) {
          // Item sem candidato já chega fechado, com o motivo dado pelo leitor: descartado (fora do escopo,
          // notícia guardada para depois), que não conta contra a fonte, ou recusado (veio com defeito), que conta.
          const situacao = item.candidato ? 'pendente' : item.problema ? 'rejeitado' : item.motivo ? 'descartado' : 'pendente'
          const motivo = item.candidato ? null : ((item.problema ?? item.motivo)?.slice(0, 2000) ?? null)
          const inseridos = await sql`
            insert into oportunidades.itens_brutos (fonte_id, id_externo, conteudo, hash_conteudo, candidato, situacao, motivo, processado_em)
            values (${fonte.fonte_id}, ${item.id_externo}, ${sql.json(item.conteudo as never)},
                    ${await hashDoConteudo(item.conteudo)}, ${item.candidato ? sql.json(item.candidato as never) : null},
                    ${situacao}::oportunidades.situacao_item_bruto, ${motivo}, ${situacao === 'pendente' ? null : new Date()})
            on conflict (fonte_id, hash_conteudo) do nothing
            returning id`
          novos += inseridos.length
        }

        let encerradas = 0
        if (leitor.listaCompleta) {
          // Linha com defeito ainda está na fonte: a oportunidade que já existia não é fechada por isso.
          const links = itens.flatMap((item) => (item.candidato ? [item.candidato.link_oficial] : item.problema ? [item.id_externo] : []))
          const [linha] = await sql`select oportunidades.encerrar_ausentes(${fonte.fonte_id}, ${links}) as encerradas`
          encerradas = linha.encerradas
        }

        // Itens sem prazo que continuam numa fonte de lista inteira ganham de novo o prazo de conferência.
        const semPrazo = ['vaga_aberta', 'aberta_sem_data']
        const abertas = leitor.listaCompleta
          ? itens.flatMap((item) => (item.candidato && semPrazo.includes(item.candidato.natureza_prazo) ? [item.candidato] : []))
          : []
        let renovadas = 0
        if (abertas.length > 0) {
          const prazo = abertas.map((candidato) => candidato.prazo).sort().at(-1)
          const linksAbertos = abertas.map((candidato) => candidato.link_oficial)
          const [linha] = await sql`select oportunidades.renovar_vagas_abertas(${fonte.fonte_id}, ${linksAbertos}, ${prazo}::date) as renovadas`
          renovadas = linha.renovadas
        }

        await sql`select oportunidades.registrar_fim_leitura(${fonte.leitura_id}, null, ${itens.length}, ${novos})`
        leituras.push({ fonte: fonte.fonte_id, lidos: itens.length, novos, encerradas, renovadas })
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
