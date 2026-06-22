/**
 * Tipos gerados via introspection do banco de dados Supabase.
 * Cobre apenas as tabelas usadas pelo Matchmaking Community MCP.
 *
 * Para atualizar: abra uma issue ou PR com as mudanças de schema necessárias.
 * Gerado em: junho de 2026
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type CategoriaHabilidade = 'habilidades' | 'softwares'

export type CategoriaOrganizacao =
  | 'aceleradora'
  | 'associacao'
  | 'universidade'
  | 'curso'
  | 'publicadora'
  | 'festival'
  | 'hub'
  | 'outro'

export type EngineProjeto =
  | 'unity' | 'unreal' | 'godot' | 'gamemaker' | 'construct' | 'rpg_maker'
  | 'defold' | 'cocos' | 'pygame' | 'custom' | 'renpy' | 'heaps' | 'bevy'
  | 'flax' | 'cryengine' | 'source_2' | 'gdevelop' | 'solar2d' | 'bitsy'
  | 'pico_8' | 'adventure_game_studio' | 'openfl' | 'monogame' | 'stride' | 'outro'

export type EspecialidadeEstudio = 'Mobile' | 'PC' | 'Console' | 'VR' | 'Casual' | 'Indie' | 'AA' | 'AAA' | 'F2P'

export type GeneroProjeto =
  | 'acao' | 'aventura' | 'rpg' | 'estrategia' | 'simulacao' | 'esportes'
  | 'corrida' | 'puzzle' | 'plataforma' | 'terror' | 'ficcao_cientifica'
  | 'casual' | 'idle' | 'tower_defense' | 'battle_royale' | 'mmo'
  | 'visual_novel' | 'metroidvania' | 'roguelike' | 'roguelite' | 'soulslike'
  | 'sandbox' | 'sobrevivencia' | 'musical' | 'luta' | 'tiro_fps' | 'tiro_tps'
  | 'card_game' | 'party_game' | 'educativo' | 'hack_and_slash' | 'stealth'
  | 'point_and_click' | 'walking_simulator' | 'bullet_hell' | 'shoot_em_up'
  | 'beat_em_up' | 'jrpg' | 'wrpg' | 'tactical_rpg' | 'dungeon_crawler'
  | 'arpg' | 'rts' | 'tbs' | 'grand_strategy' | '4x' | 'auto_battler'
  | 'tycoon' | 'life_sim' | 'farming_sim' | 'god_game' | 'immersive_sim'
  | 'survivors_like' | 'hidden_object' | 'social_deduction' | 'trivia'
  | 'pinball' | 'ritmo' | 'fmv' | 'terror_psicologico' | 'survival_horror'
  | 'moba' | 'clicker' | 'deckbuilder' | 'metajogo' | 'noir' | 'fantasia'
  | 'cyberpunk' | 'steampunk' | 'outro'

export type ModalidadeTrabalho = 'presencial' | 'hibrido' | 'remoto'

export type NivelHabilidade = 'basico' | 'intermediario' | 'avancado' | 'expert'

export type NivelVaga = 'iniciante' | 'junior' | 'pleno' | 'senior' | 'lead'

export type PlataformaProjeto =
  | 'pc_windows' | 'pc_linux' | 'pc_macos'
  | 'mobile_android' | 'mobile_ios'
  | 'console_playstation_4' | 'console_playstation_5'
  | 'console_xbox_one' | 'console_xbox_series' | 'console_nintendo_switch'
  | 'web_browser'
  | 'vr_meta_quest' | 'vr_steamvr' | 'vr_psvr'
  | 'ar_core' | 'ar_kit'
  | 'arcade' | 'cloud_gaming' | 'handheld_retro' | 'outro'

export type StatusJogo = 'lancado' | 'em_desenvolvimento' | 'cancelado'

export type TamanhoEstudio = 'micro' | 'pequeno' | 'medio' | 'grande'

export type TipoEmprego = 'clt' | 'pj' | 'freelancer' | 'estagio' | 'tempo_integral'

export type TipoPublicacaoVaga = 'gratuita' | 'destaque'

export type TipoTrabalho = 'presencial' | 'hibrido' | 'remoto'

export type UserRole = 'super_admin' | 'admin' | 'member'

// ─── Database ─────────────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      estudio_membros: {
        Row: {
          id: string
          estudio_id: string
          user_id: string
          role: UserRole
          adicionado_por: string
          adicionado_em: string | null
          ativo: boolean | null
        }
        Insert: {
          id?: string
          estudio_id: string
          user_id: string
          role?: UserRole
          adicionado_por: string
          adicionado_em?: string | null
          ativo?: boolean | null
        }
        Update: {
          id?: string
          estudio_id?: string
          user_id?: string
          role?: UserRole
          adicionado_por?: string
          adicionado_em?: string | null
          ativo?: boolean | null
        }
      }
      estudios: {
        Row: {
          id: string
          nome: string
          slug: string
          logo_url: string | null
          website: string | null
          tamanho: TamanhoEstudio | null
          sobre: string | null
          fundado_em: string | null
          especialidades: EspecialidadeEstudio[] | null
          criado_por: string
          criado_em: string | null
          atualizado_em: string | null
          estado: string | null
          cidade: string | null
          banner_url: string | null
          servicos_oferecidos: string[] | null
          search_vector: string | null
          linkedin_url: string | null
          github_url: string | null
          artstation_url: string | null
          dribbble_url: string | null
          behance_url: string | null
          facebook_url: string | null
          instagram_url: string | null
          itch_url: string | null
          pinterest_url: string | null
          steam_url: string | null
          telegram_url: string | null
          youtube_url: string | null
          twitch_url: string | null
          twitter_url: string | null
        }
        Insert: {
          id?: string
          nome: string
          slug: string
          logo_url?: string | null
          website?: string | null
          tamanho?: TamanhoEstudio | null
          sobre?: string | null
          fundado_em?: string | null
          especialidades?: EspecialidadeEstudio[] | null
          criado_por: string
          criado_em?: string | null
          atualizado_em?: string | null
          estado?: string | null
          cidade?: string | null
          banner_url?: string | null
          servicos_oferecidos?: string[] | null
        }
        Update: {
          id?: string
          nome?: string
          slug?: string
          logo_url?: string | null
          website?: string | null
          tamanho?: TamanhoEstudio | null
          sobre?: string | null
          estado?: string | null
          cidade?: string | null
          atualizado_em?: string | null
        }
      }
      habilidades: {
        Row: {
          id: string
          nome: string
          categoria: CategoriaHabilidade
          icone_url: string | null
        }
        Insert: {
          id?: string
          nome: string
          categoria: CategoriaHabilidade
          icone_url?: string | null
        }
        Update: {
          id?: string
          nome?: string
          categoria?: CategoriaHabilidade
          icone_url?: string | null
        }
      }
      jogos: {
        Row: {
          id: string
          user_id: string | null
          estudio_id: string | null
          criado_por: string
          titulo: string
          descricao: string | null
          status: StatusJogo
          ano_lancamento: number | null
          engine: EngineProjeto | null
          genero: GeneroProjeto[] | null
          plataformas: PlataformaProjeto[] | null
          steam_url: string | null
          itch_url: string | null
          demo_url: string | null
          site_url: string | null
          ordem: number
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          estudio_id?: string | null
          criado_por: string
          titulo: string
          descricao?: string | null
          status?: StatusJogo
          ano_lancamento?: number | null
          engine?: EngineProjeto | null
          genero?: GeneroProjeto[] | null
          plataformas?: PlataformaProjeto[] | null
          steam_url?: string | null
          itch_url?: string | null
          demo_url?: string | null
          site_url?: string | null
          ordem?: number
        }
        Update: {
          titulo?: string
          descricao?: string | null
          status?: StatusJogo
          ano_lancamento?: number | null
          engine?: EngineProjeto | null
          genero?: GeneroProjeto[] | null
          plataformas?: PlataformaProjeto[] | null
          steam_url?: string | null
          itch_url?: string | null
          demo_url?: string | null
          site_url?: string | null
          ordem?: number
          atualizado_em?: string
        }
      }
      mcp_community_sessions: {
        Row: {
          id: string
          state: string
          code_challenge: string
          redirect_uri: string
          auth_code: string | null
          user_id: string | null
          access_token: string | null
          expires_at: string
          usado_em: string | null
          criado_em: string
        }
        Insert: {
          id?: string
          state: string
          code_challenge: string
          redirect_uri: string
          auth_code?: string | null
          user_id?: string | null
          access_token?: string | null
          expires_at: string
          usado_em?: string | null
          criado_em?: string
        }
        Update: {
          auth_code?: string | null
          user_id?: string | null
          access_token?: string | null
          expires_at?: string
          usado_em?: string | null
        }
      }
      mcp_skill_config: {
        Row: {
          id: string
          organizacao_id: string
          slug: string
          nome_publico: string
          descricao: string | null
          estados: string[] | null
          tipos_conteudo: string[] | null
          tags_foco: string[] | null
          mensagem_boas_vindas: string | null
          ativo: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          organizacao_id: string
          slug: string
          nome_publico: string
          descricao?: string | null
          estados?: string[] | null
          tipos_conteudo?: string[] | null
          tags_foco?: string[] | null
          mensagem_boas_vindas?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          organizacao_id?: string
          slug?: string
          nome_publico?: string
          descricao?: string | null
          estados?: string[] | null
          tipos_conteudo?: string[] | null
          tags_foco?: string[] | null
          mensagem_boas_vindas?: string | null
          ativo?: boolean
          atualizado_em?: string
        }
      }
      newsletter_itens: {
        Row: {
          id: string
          tipo: string
          fonte: string
          titulo: string
          empresa: string | null
          descricao: string | null
          url: string
          tags: string[] | null
          ref_vaga_id: string | null
          ref_parceria_id: string | null
          ref_organizacao_id: string | null
          publicado_em: string | null
          expira_em: string | null
          criado_em: string | null
          enviado_em: string | null
          status: string
          resumo_ia: string | null
          possivel_duplicata: boolean | null
          exclusivo_associados: boolean
          embedding: string | null
        }
        Insert: {
          id?: string
          tipo: string
          fonte: string
          titulo: string
          empresa?: string | null
          descricao?: string | null
          url: string
          tags?: string[] | null
          ref_vaga_id?: string | null
          ref_parceria_id?: string | null
          ref_organizacao_id?: string | null
          publicado_em?: string | null
          expira_em?: string | null
          criado_em?: string | null
          enviado_em?: string | null
          status?: string
          resumo_ia?: string | null
          possivel_duplicata?: boolean | null
          exclusivo_associados?: boolean
        }
        Update: {
          tipo?: string
          fonte?: string
          titulo?: string
          empresa?: string | null
          descricao?: string | null
          url?: string
          tags?: string[] | null
          ref_organizacao_id?: string | null
          publicado_em?: string | null
          expira_em?: string | null
          enviado_em?: string | null
          status?: string
          resumo_ia?: string | null
          possivel_duplicata?: boolean | null
          exclusivo_associados?: boolean
        }
      }
      organizacao_associados: {
        Row: {
          id: string
          organizacao_id: string
          user_id: string | null
          estudio_id: string | null
          status: string
          origem: string
          aceita_notificacoes: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          organizacao_id: string
          user_id?: string | null
          estudio_id?: string | null
          status?: string
          origem: string
          aceita_notificacoes?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          status?: string
          aceita_notificacoes?: boolean
          atualizado_em?: string
        }
      }
      organizacao_membros: {
        Row: {
          id: string
          organizacao_id: string
          user_id: string
          role: UserRole
          adicionado_por: string
          adicionado_em: string
          ativo: boolean
        }
        Insert: {
          id?: string
          organizacao_id: string
          user_id: string
          role?: UserRole
          adicionado_por: string
          adicionado_em?: string
          ativo?: boolean
        }
        Update: {
          role?: UserRole
          ativo?: boolean
        }
      }
      organizacoes: {
        Row: {
          id: string
          nome: string
          slug: string
          categoria: CategoriaOrganizacao
          status: string
          logo_url: string | null
          banner_url: string | null
          website: string | null
          sobre: string | null
          estado: string | null
          cidade: string | null
          criado_por: string
          criado_em: string
          atualizado_em: string
          search_vector: string | null
          modelo_associacao: string
          notificar_associados_vagas: boolean
          notificar_associados_parcerias: boolean
          linkedin_url: string | null
          github_url: string | null
          instagram_url: string | null
          twitter_url: string | null
          facebook_url: string | null
          youtube_url: string | null
          twitch_url: string | null
          telegram_url: string | null
          artstation_url: string | null
          behance_url: string | null
          dribbble_url: string | null
          itch_url: string | null
          pinterest_url: string | null
          steam_url: string | null
        }
        Insert: {
          id?: string
          nome: string
          slug: string
          categoria: CategoriaOrganizacao
          status?: string
          logo_url?: string | null
          banner_url?: string | null
          website?: string | null
          sobre?: string | null
          estado?: string | null
          cidade?: string | null
          criado_por: string
          criado_em?: string
          atualizado_em?: string
          modelo_associacao?: string
          notificar_associados_vagas?: boolean
          notificar_associados_parcerias?: boolean
        }
        Update: {
          nome?: string
          slug?: string
          categoria?: CategoriaOrganizacao
          status?: string
          logo_url?: string | null
          sobre?: string | null
          estado?: string | null
          cidade?: string | null
          atualizado_em?: string
        }
      }
      tipos_funcao: {
        Row: {
          id: string
          nome: string
          ativo: boolean
          ordem: number
        }
        Insert: {
          id?: string
          nome: string
          ativo?: boolean
          ordem?: number
        }
        Update: {
          nome?: string
          ativo?: boolean
          ordem?: number
        }
      }
      user_habilidades: {
        Row: {
          id: string
          user_id: string
          habilidade_id: string
          nivel: NivelHabilidade
          anos_experiencia: number | null
          ordem: number | null
        }
        Insert: {
          id?: string
          user_id: string
          habilidade_id: string
          nivel?: NivelHabilidade
          anos_experiencia?: number | null
          ordem?: number | null
        }
        Update: {
          nivel?: NivelHabilidade
          anos_experiencia?: number | null
          ordem?: number | null
        }
      }
      users: {
        Row: {
          id: string
          email: string
          nome_completo: string
          slug: string
          avatar_url: string | null
          titulo_profissional: string | null
          website: string | null
          bio_curta: string | null
          sobre: string | null
          disponivel_para_trabalho: boolean | null
          tipo_trabalho_preferido: TipoTrabalho[] | null
          tipo_contrato_preferido: TipoEmprego[] | null
          linkedin_url: string | null
          github_url: string | null
          portfolio_url: string | null
          telefone: string | null
          mostrar_email: boolean | null
          mostrar_telefone: boolean | null
          criado_em: string | null
          atualizado_em: string | null
          banner_url: string | null
          estado: string | null
          cidade: string | null
          pronomes: string | null
          artstation_url: string | null
          dribbble_url: string | null
          behance_url: string | null
          facebook_url: string | null
          instagram_url: string | null
          itch_url: string | null
          pinterest_url: string | null
          steam_url: string | null
          telegram_url: string | null
          youtube_url: string | null
          twitch_url: string | null
          twitter_url: string | null
          search_vector: string | null
          is_admin: boolean
          cookie_consent: Json | null
          newsletter_opt_in: boolean
          disponibilidade_inicio: string | null
          pretensao_salarial_min: number | null
          pretensao_salarial_max: number | null
        }
        Insert: {
          id?: string
          email: string
          nome_completo: string
          slug: string
          avatar_url?: string | null
          titulo_profissional?: string | null
          disponivel_para_trabalho?: boolean | null
          estado?: string | null
          cidade?: string | null
          is_admin?: boolean
          newsletter_opt_in?: boolean
        }
        Update: {
          email?: string
          nome_completo?: string
          slug?: string
          avatar_url?: string | null
          titulo_profissional?: string | null
          website?: string | null
          bio_curta?: string | null
          sobre?: string | null
          disponivel_para_trabalho?: boolean | null
          tipo_trabalho_preferido?: TipoTrabalho[] | null
          tipo_contrato_preferido?: TipoEmprego[] | null
          estado?: string | null
          cidade?: string | null
          atualizado_em?: string | null
        }
      }
      vaga_tipos_funcao: {
        Row: {
          id: string
          vaga_id: string
          tipo_funcao_id: string
        }
        Insert: {
          id?: string
          vaga_id: string
          tipo_funcao_id: string
        }
        Update: {
          vaga_id?: string
          tipo_funcao_id?: string
        }
      }
      vagas: {
        Row: {
          id: string
          estudio_id: string | null
          criada_por: string
          titulo: string
          slug: string
          descricao: string
          nivel: NivelVaga
          tipo_emprego: TipoEmprego
          remoto: ModalidadeTrabalho
          salario_min: number | null
          salario_max: number | null
          mostrar_salario: boolean | null
          tipo_publicacao: TipoPublicacaoVaga | null
          ativa: boolean | null
          visualizacoes: number | null
          criada_em: string | null
          atualizada_em: string | null
          expira_em: string | null
          contato_candidatura: string | null
          status: string | null
          estado: string | null
          cidade: string | null
          organizacao_id: string | null
          ia_ativa: boolean
        }
        Insert: {
          id?: string
          estudio_id?: string | null
          criada_por: string
          titulo: string
          slug: string
          descricao: string
          nivel: NivelVaga
          tipo_emprego: TipoEmprego
          remoto: ModalidadeTrabalho
          salario_min?: number | null
          salario_max?: number | null
          mostrar_salario?: boolean | null
          tipo_publicacao?: TipoPublicacaoVaga | null
          ativa?: boolean | null
          contato_candidatura?: string | null
          estado?: string | null
          cidade?: string | null
          organizacao_id?: string | null
          ia_ativa?: boolean
        }
        Update: {
          titulo?: string
          descricao?: string
          nivel?: NivelVaga
          tipo_emprego?: TipoEmprego
          remoto?: ModalidadeTrabalho
          salario_min?: number | null
          salario_max?: number | null
          mostrar_salario?: boolean | null
          tipo_publicacao?: TipoPublicacaoVaga | null
          ativa?: boolean | null
          contato_candidatura?: string | null
          estado?: string | null
          cidade?: string | null
          ia_ativa?: boolean
          atualizada_em?: string | null
        }
      }
    }
    Enums: {
      categoria_habilidade: CategoriaHabilidade
      categoria_organizacao: CategoriaOrganizacao
      engine_projeto: EngineProjeto
      especialidade_estudio: EspecialidadeEstudio
      genero_projeto: GeneroProjeto
      modalidade_trabalho: ModalidadeTrabalho
      nivel_habilidade: NivelHabilidade
      nivel_vaga: NivelVaga
      plataforma_projeto: PlataformaProjeto
      status_jogo: StatusJogo
      tamanho_estudio: TamanhoEstudio
      tipo_emprego: TipoEmprego
      tipo_publicacao_vaga: TipoPublicacaoVaga
      tipo_trabalho: TipoTrabalho
      user_role: UserRole
    }
  }
}
