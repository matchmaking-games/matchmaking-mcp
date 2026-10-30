-- Quando um item some da fonte (a vaga saiu do site do estúdio, o evento foi retirado),
-- a oportunidade sai do índice na mesma leitura, sem esperar o prazo vencer.
create function oportunidades.encerrar_ausentes(p_fonte uuid, p_links text[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  encerradas integer;
begin
  update oportunidades.oportunidades
  set situacao = 'removida', motivo_moderacao = 'Saiu da fonte'
  where fonte_id = p_fonte
    and situacao in ('publicada', 'em_moderacao')
    and not (link_oficial = any (coalesce(p_links, array[]::text[])));
  get diagnostics encerradas = row_count;
  return encerradas;
end;
$$;

revoke all on function oportunidades.encerrar_ausentes(uuid, text[]) from public, anon, authenticated;
grant execute on function oportunidades.encerrar_ausentes(uuid, text[]) to service_role;
