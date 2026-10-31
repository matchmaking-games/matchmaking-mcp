-- Testes do agendamento da coleta.
begin;

do $$
declare
  pedido net.pedidos;
begin
  if not exists (select 1 from cron.job where jobname = 'oportunidades-coletar'
                   and schedule = '*/30 * * * *' and command = 'select oportunidades.chamar_coleta()') then
    raise exception 'FALHA: a coleta deveria estar agendada a cada 30 minutos';
  end if;

  -- Sem os segredos no Vault, a chamada para com erro em vez de mandar um pedido sem senha.
  begin
    perform oportunidades.chamar_coleta();
    raise exception 'FALHA: deveria recusar sem os segredos';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  insert into vault.decrypted_secrets values ('project_url', 'https://exemplo.supabase.co'), ('CRON_SECRET', 'senha-de-teste');
  perform oportunidades.chamar_coleta();
  select * into pedido from net.pedidos order by id desc limit 1;
  if pedido.url <> 'https://exemplo.supabase.co/functions/v1/coletar'
     or pedido.headers ->> 'Authorization' <> 'Bearer senha-de-teste' then
    raise exception 'FALHA: o pedido deveria ir para a função coletar com a senha do Vault';
  end if;
end;
$$;

-- Ninguém de fora chama a coleta.
do $$
begin
  if has_function_privilege('anon', 'oportunidades.chamar_coleta()', 'execute')
     or has_function_privilege('authenticated', 'oportunidades.chamar_coleta()', 'execute') then
    raise exception 'FALHA: anon e authenticated não podem chamar a coleta';
  end if;
end;
$$;

rollback;
