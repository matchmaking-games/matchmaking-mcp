-- Hook de acesso: o acesso emitido para um aplicativo conectado passa a dizer para qual servidor ele vale
-- (aud = endereço do MCP). Só tem efeito depois de ligado no painel do Supabase.
-- Sessões do site não têm client_id e ficam como estão.
-- https://supabase.com/docs/guides/auth/oauth-server/token-security
create function oportunidades.publico_do_acesso(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  destino text;
begin
  if nullif(claims ->> 'client_id', '') is null then
    return event;
  end if;

  destino := case claims ->> 'iss'
    when 'https://njyoimhjfqtygnlccjzq.supabase.co/auth/v1' then 'https://mcp-dev.matchmaking.games/mcp'
    when 'https://maxwhmljqvookvzixufl.supabase.co/auth/v1' then 'https://mcp.matchmaking.games/mcp'
  end;

  if destino is null then
    return event;
  end if;

  return jsonb_set(event, '{claims,aud}', to_jsonb(destino));
end;
$$;

comment on function oportunidades.publico_do_acesso(jsonb) is
  'Hook do Supabase Auth (custom access token). Muda o aud só dos acessos de aplicativos conectados.';

grant usage on schema oportunidades to supabase_auth_admin;
revoke all on function oportunidades.publico_do_acesso(jsonb) from public, anon, authenticated;
grant execute on function oportunidades.publico_do_acesso(jsonb) to supabase_auth_admin;
