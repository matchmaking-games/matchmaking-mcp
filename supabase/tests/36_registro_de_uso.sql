-- Registro de uso: conta só a própria pessoa, respeita o limite do dia e não guarda conteúdo.
begin;
set local timezone = 'America/Sao_Paulo';

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-000000000021', false),
  ('00000000-0000-4000-8000-000000000022', true);

do $$
declare
  conta uuid := '00000000-0000-4000-8000-000000000021';
  convidado uuid := '00000000-0000-4000-8000-000000000022';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  n integer;
  marca boolean;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","is_anonymous":false}', conta), true);
  if not vitrine.registrar_uso('buscar_oportunidades') or not vitrine.registrar_uso('buscar_oportunidades') then
    raise exception 'FALHA: a conta deveria poder usar';
  end if;
  select chamadas, u.visitante into n, marca from oportunidades.uso_por_pessoa u where user_id = conta and ferramenta = 'buscar_oportunidades';
  if n is distinct from 2 or marca is distinct from false then
    raise exception 'FALHA: a conta deveria ter 2 chamadas e não ser visitante, tem % e %', n, marca;
  end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s"}', convidado), true);
  if not vitrine.registrar_uso('o_que_posso_fazer') then
    raise exception 'FALHA: o visitante deveria poder usar';
  end if;
  select chamadas, u.visitante into n, marca from oportunidades.uso_por_pessoa u where user_id = convidado;
  if n is distinct from 1 or marca is distinct from true then
    raise exception 'FALHA: o visitante deveria ter 1 chamada e estar marcado como visitante';
  end if;
  select chamadas into n from oportunidades.uso_por_pessoa where user_id = conta;
  if n is distinct from 2 then
    raise exception 'FALHA: o uso de um não pode mudar o contador de outro';
  end if;

  -- O limite soma todas as ferramentas do dia.
  update oportunidades.uso_por_pessoa set chamadas = 98 where user_id = convidado;
  insert into oportunidades.uso_por_pessoa (dia, user_id, ferramenta, visitante, chamadas) values (hoje, convidado, 'ver_oportunidade', true, 1);
  if not vitrine.registrar_uso('ver_oportunidade') then
    raise exception 'FALHA: a 100ª chamada do visitante ainda vale';
  end if;
  if vitrine.registrar_uso('ver_oportunidade') or vitrine.registrar_uso('ferramenta_nova') then
    raise exception 'FALHA: o visitante passou do limite de 100';
  end if;
  select sum(chamadas) into n from oportunidades.uso_por_pessoa where user_id = convidado;
  if n is distinct from 100 then
    raise exception 'FALHA: acima do limite nada deveria ser gravado, a soma é %', n;
  end if;
  if exists (select 1 from oportunidades.uso_por_pessoa where user_id = convidado and ferramenta = 'ferramenta_nova') then
    raise exception 'FALHA: acima do limite não pode surgir linha nova';
  end if;

  -- A conta tem limite maior, e o dia seguinte começa do zero.
  perform set_config('request.jwt.claims', format('{"sub":"%s","is_anonymous":false}', conta), true);
  update oportunidades.uso_por_pessoa set chamadas = 299 where user_id = conta;
  if not vitrine.registrar_uso('buscar_oportunidades') then
    raise exception 'FALHA: a 300ª chamada da conta ainda vale';
  end if;
  if vitrine.registrar_uso('buscar_oportunidades') then
    raise exception 'FALHA: a conta passou do limite de 300';
  end if;
  update oportunidades.uso_por_pessoa set dia = hoje - 1 where user_id = conta;
  if not vitrine.registrar_uso('buscar_oportunidades') then
    raise exception 'FALHA: o limite deveria recomeçar no dia seguinte';
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    perform vitrine.registrar_uso('buscar_oportunidades');
    raise exception 'FALHA: quem não entrou não pode registrar uso';
  exception when insufficient_privilege then null;
  end;

  begin
    perform set_config('request.jwt.claims', format('{"sub":"%s","is_anonymous":false}', conta), true);
    perform vitrine.registrar_uso('Texto Livre da Pessoa');
    raise exception 'FALHA: o nome da ferramenta não pode trazer texto livre';
  exception when check_violation then null;
  end;

  if has_function_privilege('anon', 'vitrine.registrar_uso(text)', 'execute') then
    raise exception 'FALHA: quem não entrou não pode chamar o registro';
  end if;
  if has_table_privilege('authenticated', 'oportunidades.uso_por_pessoa', 'select') then
    raise exception 'FALHA: ninguém pode ler o registro de uso pela API';
  end if;
end;
$$;

rollback;
