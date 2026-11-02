-- Barreira do visitante: toda função que grava em nome de alguém começa chamando esta.
-- Devolve o id da conta. Recusa quem não entrou e quem entrou como visitante (usuário anônimo).
-- Confere o acesso e também o cadastro, porque o acesso de um visitante que acabou de criar conta
-- continua dizendo o contrário até ser renovado, e o caminho seguro é recusar até lá.
create function oportunidades.exigir_conta()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  conta uuid := nullif(claims ->> 'sub', '')::uuid;
  visitante_no_cadastro boolean;
begin
  if conta is not null then
    select u.is_anonymous into visitante_no_cadastro from auth.users u where u.id = conta;
  end if;

  if conta is null
     or visitante_no_cadastro is distinct from false
     or (claims ->> 'is_anonymous') = 'true'
     or coalesce(claims -> 'amr' @> '[{"method": "anonymous"}]'::jsonb, false)
     or coalesce(claims -> 'amr' @> '["anonymous"]'::jsonb, false) then
    raise exception 'Só quem entrou com uma conta da Matchmaking pode fazer isto.' using errcode = '42501';
  end if;

  return conta;
end;
$$;

comment on function oportunidades.exigir_conta() is
  'Primeira linha de toda função que grava em nome de alguém. O teste 35_visitante_nao_grava.sql confere.';

revoke all on function oportunidades.exigir_conta() from public, anon, authenticated;
grant execute on function oportunidades.exigir_conta() to service_role;
