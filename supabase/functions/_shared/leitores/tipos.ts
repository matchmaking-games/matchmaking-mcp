// Formato comum a todos os leitores de fonte. Um leitor lê a fonte e devolve, para cada item,
// o conteúdo como chegou (guardado para auditoria) e um candidato no formato do contrato mínimo.
// O portão de qualidade, no banco, confere o candidato antes de ele virar oportunidade.

export type Abrangencia = 'estado' | 'nacional' | 'remoto' | 'internacional'

export interface Candidato {
  titulo: string
  tipo: string
  link_oficial: string
  prazo: string
  natureza_prazo: 'encerramento_inscricoes' | 'data_do_evento' | 'vaga_aberta'
  abrangencia: Abrangencia
  ufs?: string[]
  publico: 'pessoa' | 'empresa' | 'ambos'
  descricao?: string
}

export interface ItemLido {
  id_externo: string
  conteudo: unknown
  candidato: Candidato | null
}

// Busca HTTP injetável, para os testes não dependerem da rede.
export type Buscar = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
