// Formato comum a todos os leitores de fonte. Um leitor lê a fonte e devolve, para cada item,
// o conteúdo como chegou (guardado para auditoria) e um candidato no formato do contrato mínimo.
// O portão de qualidade, no banco, confere o candidato antes de ele virar oportunidade.

export type Abrangencia = 'estado' | 'nacional' | 'remoto' | 'internacional'

export interface Candidato {
  titulo: string
  tipo: string
  link_oficial: string
  prazo: string
  natureza_prazo: 'encerramento_inscricoes' | 'data_do_evento' | 'vaga_aberta' | 'aberta_sem_data'
  abrangencia: Abrangencia
  ufs?: string[]
  publico: 'pessoa' | 'empresa' | 'ambos'
  descricao?: string
}

// Notícia avaliada pela IA, a caminho da área de notícias (o banco decide se entra, vai para a fila ou sai).
export interface NoticiaLida {
  titulo: string
  titulo_original: string
  link: string
  resumo: string
  idioma: 'pt' | 'en'
  publicada_em: string | null
  nota: number
  motivo: string
  duplicata_de: string | null
}

export interface ItemLido {
  id_externo: string
  conteudo: unknown
  candidato: Candidato | null
  // Quando não há candidato: por que o item fica de fora (é guardado como descartado, com este motivo).
  motivo?: string
  // Quando o item veio com defeito (linha mal preenchida): vai para os recusados e conta contra a fonte.
  problema?: string
  // Quando o item é uma notícia: vai para a área de notícias.
  noticia?: NoticiaLida
}

// Busca HTTP injetável, para os testes não dependerem da rede.
export type Buscar = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>
