-- Vaga sem prazo informado fica aberta enquanto estiver no site de quem oferece: a cada leitura
-- em que ela continua lá, o prazo de conferência é empurrado para a frente. Sem isso, uma vaga
-- que não muda na fonte nunca volta ao portão (o item é o mesmo) e venceria com ela ainda aberta.
create function oportunidades.renovar_vagas_abertas(p_fonte uuid, p_links text[], p_prazo date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  renovadas integer;
begin
  update oportunidades.oportunidades
  set prazo = p_prazo
  where fonte_id = p_fonte
    and natureza_prazo = 'vaga_aberta'
    and situacao in ('publicada', 'em_moderacao')
    and link_oficial = any (coalesce(p_links, array[]::text[]))
    and prazo < p_prazo;
  get diagnostics renovadas = row_count;
  return renovadas;
end;
$$;

revoke all on function oportunidades.renovar_vagas_abertas(uuid, text[], date) from public, anon, authenticated;
grant execute on function oportunidades.renovar_vagas_abertas(uuid, text[], date) to service_role;
