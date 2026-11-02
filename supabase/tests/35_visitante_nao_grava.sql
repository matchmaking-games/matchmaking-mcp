-- Visitante nunca grava: a barreira recusa quem não tem conta, e nenhuma função nova que grava fica sem ela.
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-000000000011', false),
  ('00000000-0000-4000-8000-000000000012', true);

create function pg_temp.recusa(p_claims text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', p_claims, true);
  perform oportunidades.exigir_conta();
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","is_anonymous":false}', true);
  if oportunidades.exigir_conta() is distinct from '00000000-0000-4000-8000-000000000011'::uuid then
    raise exception 'FALHA: a conta deveria passar e receber o próprio id';
  end if;

  -- Acesso do servidor OAuth sem a marca is_anonymous.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","amr":[{"method":"password","timestamp":1}]}', true);
  if oportunidades.exigir_conta() is null then
    raise exception 'FALHA: conta sem a marca is_anonymous deveria passar';
  end if;

  if not pg_temp.recusa('') then
    raise exception 'FALHA: quem não entrou deveria ser recusado';
  end if;
  if not pg_temp.recusa('{"sub":"00000000-0000-4000-8000-000000000012","is_anonymous":true}') then
    raise exception 'FALHA: visitante marcado no acesso deveria ser recusado';
  end if;
  if not pg_temp.recusa('{"sub":"00000000-0000-4000-8000-000000000011","is_anonymous":true}') then
    raise exception 'FALHA: acesso de visitante ainda não renovado deveria ser recusado';
  end if;
  if not pg_temp.recusa('{"sub":"00000000-0000-4000-8000-000000000011","amr":[{"method":"anonymous","timestamp":1}]}') then
    raise exception 'FALHA: visitante reconhecido pelo método de login (objeto) deveria ser recusado';
  end if;
  if not pg_temp.recusa('{"sub":"00000000-0000-4000-8000-000000000011","amr":["anonymous"]}') then
    raise exception 'FALHA: visitante reconhecido pelo método de login (texto) deveria ser recusado';
  end if;
  if not pg_temp.recusa('{"sub":"00000000-0000-4000-8000-000000000012"}') then
    raise exception 'FALHA: visitante sem marca no acesso deveria ser recusado pelo cadastro';
  end if;
  if not pg_temp.recusa('{"sub":"00000000-0000-4000-8000-000000000099","is_anonymous":false}') then
    raise exception 'FALHA: acesso de alguém fora do cadastro deveria ser recusado';
  end if;
end;
$$;

-- Vale para as funções de hoje e para as próximas.
do $$
declare
  sem_barreira text;
  abertas_a_anon text;
  tabelas_abertas text;
begin
  -- A busca grava só termos sem resultado, sem identificar a pessoa, e o registro de uso mexe só no
  -- contador da própria pessoa. Os dois servem aos visitantes.
  select string_agg(n.nspname || '.' || p.proname, ', ') into sem_barreira
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('oportunidades', 'vitrine')
    and p.provolatile = 'v'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.prosrc !~ 'oportunidades\.exigir_conta\(\)'
    and (n.nspname, p.proname) not in (('vitrine', 'buscar_oportunidades'), ('vitrine', 'pesquisar_oportunidades'), ('vitrine', 'registrar_uso'));
  if sem_barreira is not null then
    raise exception 'FALHA: função que pode gravar sem chamar exigir_conta: %', sem_barreira;
  end if;

  select string_agg(n.nspname || '.' || p.proname, ', ') into abertas_a_anon
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('oportunidades', 'vitrine') and has_function_privilege('anon', p.oid, 'execute');
  if abertas_a_anon is not null then
    raise exception 'FALHA: função aberta a quem nem entrou: %', abertas_a_anon;
  end if;

  select string_agg(n.nspname || '.' || c.relname, ', ') into tabelas_abertas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as papel (nome)
  where n.nspname in ('oportunidades', 'vitrine') and c.relkind in ('r', 'v', 'p')
    and (has_table_privilege(papel.nome, c.oid, 'insert')
      or has_table_privilege(papel.nome, c.oid, 'update')
      or has_table_privilege(papel.nome, c.oid, 'delete'));
  if tabelas_abertas is not null then
    raise exception 'FALHA: tabela que aceita gravação direta: %', tabelas_abertas;
  end if;

  if has_function_privilege('authenticated', 'oportunidades.exigir_conta()', 'execute') then
    raise exception 'FALHA: a barreira é só para uso interno das funções';
  end if;
end;
$$;

rollback;
