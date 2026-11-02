-- Resumo do uso: depois de 8 semanas fechadas sobra só o total da semana, sem identificar ninguém.
begin;
set local timezone = 'America/Sao_Paulo';

do $$
declare
  semana_atual date := date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date;
  antiga date := semana_atual - 63;
  no_limite date := semana_atual - 56;
  r record;
  n integer;
begin
  insert into oportunidades.uso_por_pessoa (dia, user_id, ferramenta, visitante, chamadas) values
    (antiga, '00000000-0000-4000-8000-000000000031', 'buscar_oportunidades', false, 5),
    (antiga + 1, '00000000-0000-4000-8000-000000000031', 'buscar_oportunidades', false, 2),
    (antiga + 1, '00000000-0000-4000-8000-000000000032', 'o_que_posso_fazer', true, 1),
    (no_limite, '00000000-0000-4000-8000-000000000033', 'buscar_oportunidades', false, 4),
    (semana_atual, '00000000-0000-4000-8000-000000000034', 'buscar_oportunidades', true, 3);

  n := oportunidades.fechar_uso_antigo();
  if n <> 3 then
    raise exception 'FALHA: deveria apagar as 3 linhas da semana antiga, apagou %', n;
  end if;

  select * into r from oportunidades.uso_semanal where semana = antiga;
  if r.pessoas <> 2 or r.contas <> 1 or r.visitantes <> 1 or r.chamadas <> 8 then
    raise exception 'FALHA: total errado: % pessoas, % contas, % visitantes, % chamadas', r.pessoas, r.contas, r.visitantes, r.chamadas;
  end if;

  if exists (select 1 from oportunidades.uso_por_pessoa where dia < no_limite) then
    raise exception 'FALHA: a ligação com as pessoas deveria sumir depois de 8 semanas';
  end if;
  select count(*) into n from oportunidades.uso_por_pessoa where dia >= no_limite;
  if n <> 2 then
    raise exception 'FALHA: as semanas recentes deveriam ficar, sobraram %', n;
  end if;

  if oportunidades.fechar_uso_antigo() <> 0 then
    raise exception 'FALHA: rodar de novo não deveria apagar nada';
  end if;

  select count(*) into n from oportunidades.uso_por_semana();
  if n <> 3 then
    raise exception 'FALHA: a métrica deveria somar 1 semana resumida e 2 recentes, trouxe %', n;
  end if;
  select pessoas into n from oportunidades.uso_por_semana() u where u.semana = antiga;
  if n is distinct from 2 then
    raise exception 'FALHA: a métrica perdeu o total da semana resumida';
  end if;

  if not exists (select 1 from cron.job where jobname = 'oportunidades-fechar-uso' and command = 'select oportunidades.fechar_uso_antigo()') then
    raise exception 'FALHA: o resumo deveria estar agendado';
  end if;
  if has_function_privilege('authenticated', 'oportunidades.uso_por_semana()', 'execute')
     or has_function_privilege('authenticated', 'oportunidades.fechar_uso_antigo()', 'execute')
     or has_table_privilege('authenticated', 'oportunidades.uso_semanal', 'select') then
    raise exception 'FALHA: quem usa o MCP não vê a métrica nem aciona o resumo';
  end if;
end;
$$;

rollback;
