-- Agendamento da coleta: a cada 30 minutos, o banco chama a função `coletar`.
-- A cada chamada ela só lê as fontes com leitura vencida (cada fonte tem o seu intervalo).
-- O endereço do projeto e a senha CRON_SECRET vêm do Vault, como nas tarefas do site,
-- então a mesma migration vale para o dev e para a produção sem segredo no código.

create or replace function oportunidades.chamar_coleta()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  endereco text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  senha text := (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET');
begin
  if endereco is null or senha is null then
    raise exception 'Faltam os segredos project_url ou CRON_SECRET no Vault';
  end if;
  -- A coleta pode levar até 100 segundos; a espera fica um pouco acima disso.
  return net.http_post(
    url := endereco || '/functions/v1/coletar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || senha),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function oportunidades.chamar_coleta() from public, anon, authenticated;

comment on function oportunidades.chamar_coleta() is 'Chama a função coletar. Só o agendador (cron) usa.';

select cron.schedule('oportunidades-coletar', '*/30 * * * *', 'select oportunidades.chamar_coleta()');
