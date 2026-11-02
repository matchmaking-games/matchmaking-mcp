-- Hook de acesso: muda o aud só de quem veio por um aplicativo conectado, e nada mais.
begin;

do $$
declare
  dev constant text := 'https://njyoimhjfqtygnlccjzq.supabase.co/auth/v1';
  producao constant text := 'https://maxwhmljqvookvzixufl.supabase.co/auth/v1';
  entrada jsonb;
  saida jsonb;
begin
  entrada := jsonb_build_object('user_id', 'u-1', 'authentication_method', 'oauth_provider/authorization_code', 'claims',
    jsonb_build_object('iss', dev, 'aud', 'authenticated', 'client_id', 'cliente-1', 'role', 'authenticated', 'sub', 'u-1'));
  saida := oportunidades.publico_do_acesso(entrada);
  if saida -> 'claims' ->> 'aud' is distinct from 'https://mcp-dev.matchmaking.games/mcp' then
    raise exception 'FALHA: acesso de aplicativo no dev deveria valer para o servidor de dev';
  end if;
  if saida #- '{claims,aud}' is distinct from entrada #- '{claims,aud}' then
    raise exception 'FALHA: o hook só pode mudar o aud';
  end if;

  saida := oportunidades.publico_do_acesso(jsonb_set(entrada, '{claims,iss}', to_jsonb(producao)));
  if saida -> 'claims' ->> 'aud' is distinct from 'https://mcp.matchmaking.games/mcp' then
    raise exception 'FALHA: acesso de aplicativo na produção deveria valer para o servidor de produção';
  end if;

  -- Sessão do site: sem client_id, ou com client_id vazio.
  saida := oportunidades.publico_do_acesso(entrada #- '{claims,client_id}');
  if saida is distinct from entrada #- '{claims,client_id}' then
    raise exception 'FALHA: a sessão do site não pode mudar';
  end if;
  saida := oportunidades.publico_do_acesso(jsonb_set(entrada, '{claims,client_id}', '""'));
  if saida -> 'claims' ->> 'aud' is distinct from 'authenticated' then
    raise exception 'FALHA: client_id vazio não conta como aplicativo';
  end if;

  saida := oportunidades.publico_do_acesso(jsonb_set(entrada, '{claims,iss}', '"https://outro.supabase.co/auth/v1"'));
  if saida -> 'claims' ->> 'aud' is distinct from 'authenticated' then
    raise exception 'FALHA: acesso de outro emissor não pode mudar';
  end if;

  if not has_function_privilege('supabase_auth_admin', 'oportunidades.publico_do_acesso(jsonb)', 'execute') then
    raise exception 'FALHA: o Supabase Auth precisa conseguir chamar o hook';
  end if;
  if has_function_privilege('authenticated', 'oportunidades.publico_do_acesso(jsonb)', 'execute')
     or has_function_privilege('anon', 'oportunidades.publico_do_acesso(jsonb)', 'execute') then
    raise exception 'FALHA: só o Supabase Auth chama o hook';
  end if;
end;
$$;

rollback;
