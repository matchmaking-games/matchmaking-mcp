-- Registro de uso sem conteúdo (ferramenta, dia, conta ou visitante) e limite diário por pessoa.
-- Nunca guarda o que a pessoa perguntou.
create table oportunidades.uso_por_pessoa (
  dia date not null,
  user_id uuid not null,
  ferramenta text not null check (ferramenta ~ '^[a-z_]{3,40}$'),
  visitante boolean not null,
  chamadas integer not null default 1 check (chamadas > 0),
  primary key (dia, user_id, ferramenta)
);

comment on table oportunidades.uso_por_pessoa is
  'Quantas vezes cada pessoa chamou cada ferramenta, por dia. Sem o conteúdo das chamadas.';

alter table oportunidades.uso_por_pessoa enable row level security;
revoke all on table oportunidades.uso_por_pessoa from anon, authenticated;
grant select, insert, update, delete on table oportunidades.uso_por_pessoa to service_role;

-- Conta a chamada e diz se a pessoa ainda está dentro do limite do dia (100 para visitante, 300 para
-- conta). Passou do limite, nada é gravado.
create function vitrine.registrar_uso(p_ferramenta text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  pessoa uuid := nullif(claims ->> 'sub', '')::uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  e_visitante boolean := false;
  limite integer := 300;
  usadas integer;
begin
  if pessoa is null then
    raise exception 'É preciso entrar para usar este servidor.' using errcode = '42501';
  end if;

  begin
    perform oportunidades.exigir_conta();
  exception when insufficient_privilege then
    e_visitante := true;
    limite := 100;
  end;

  select coalesce(sum(u.chamadas), 0) into usadas
  from oportunidades.uso_por_pessoa u
  where u.dia = hoje and u.user_id = pessoa;

  if usadas >= limite then
    return false;
  end if;

  insert into oportunidades.uso_por_pessoa as u (dia, user_id, ferramenta, visitante)
  values (hoje, pessoa, p_ferramenta, e_visitante)
  on conflict (dia, user_id, ferramenta) do update set chamadas = u.chamadas + 1, visitante = excluded.visitante;

  return true;
end;
$$;

comment on function vitrine.registrar_uso(text) is 'Chamada pelo servidor do MCP antes de cada ferramenta. Só mexe no contador da própria pessoa.';

revoke all on function vitrine.registrar_uso(text) from public, anon;
grant execute on function vitrine.registrar_uso(text) to authenticated, service_role;
