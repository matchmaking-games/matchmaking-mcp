-- A renovação do prazo de conferência passa a valer também para oportunidades sem data
-- (aberta_sem_data) de fontes que mostram a lista inteira, como as planilhas: enquanto a linha
-- estiver na planilha, a oportunidade continua aberta.
create or replace function oportunidades.renovar_vagas_abertas(p_fonte uuid, p_links text[], p_prazo date)
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
    and natureza_prazo in ('vaga_aberta', 'aberta_sem_data')
    and situacao in ('publicada', 'em_moderacao')
    and link_oficial = any (coalesce(p_links, array[]::text[]))
    and prazo < p_prazo;
  get diagnostics renovadas = row_count;
  return renovadas;
end;
$$;

revoke all on function oportunidades.renovar_vagas_abertas(uuid, text[], date) from public, anon, authenticated;
grant execute on function oportunidades.renovar_vagas_abertas(uuid, text[], date) to service_role;
