import { supabaseAsUser } from '../lib/supabase.js'

/**
 * Verifica se o usuário autenticado é associado ativo de uma organização.
 * Cobre dois caminhos:
 *   1. user_id direto em organizacao_associados
 *   2. via estudio_membros (usuário é membro de um estúdio que é associado)
 *
 * Função interna — nunca exposta como tool do MCP.
 */
export async function verificarAssociado(
  token: string,
  userId: string,
  organizacaoId: string
): Promise<boolean> {
  const client = supabaseAsUser(token)

  const { data, error } = await client.rpc('verificar_associado_mcp', {
    p_user_id: userId,
    p_organizacao_id: organizacaoId,
  })

  if (error) return false
  return !!data
}
