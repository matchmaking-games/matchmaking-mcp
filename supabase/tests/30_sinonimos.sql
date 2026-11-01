-- Testes dos sinônimos: comparação sem acentos e maiúsculas, um termo levando a mais de um
-- destino e nenhum acesso direto de quem usa o MCP.
begin;

insert into public.habilidades (id, nome) values ('00000000-0000-4000-8000-0000000000a1', 'Animation Teste');
insert into public.tipos_funcao (id, nome) values ('00000000-0000-4000-8000-0000000000b1', 'Animator Teste');

do $$
declare
  repetido boolean := false;
begin
  if oportunidades.normalizar_termo('  Animação ÇÃO ') <> 'animacao cao' then
    raise exception 'FALHA: o termo deveria perder acentos, maiúsculas e espaços nas pontas';
  end if;

  insert into oportunidades.sinonimos (termo, habilidade_id) values ('Animação', '00000000-0000-4000-8000-0000000000a1');
  if (select termo_normalizado from oportunidades.sinonimos where habilidade_id = '00000000-0000-4000-8000-0000000000a1') <> 'animacao' then
    raise exception 'FALHA: a coluna normalizada deveria ignorar acentos';
  end if;

  -- O mesmo termo pode levar à habilidade e à função.
  insert into oportunidades.sinonimos (termo, tipo_funcao_id) values ('animação', '00000000-0000-4000-8000-0000000000b1');

  -- Mas não pode se repetir para o mesmo destino, nem com acento diferente.
  begin
    insert into oportunidades.sinonimos (termo, habilidade_id) values ('ANIMACAO', '00000000-0000-4000-8000-0000000000a1');
  exception when unique_violation then
    repetido := true;
  end;
  if not repetido then
    raise exception 'FALHA: "ANIMACAO" e "Animação" deveriam contar como o mesmo termo para o mesmo destino';
  end if;

  if has_table_privilege('authenticated', 'oportunidades.sinonimos', 'select')
     or has_table_privilege('anon', 'oportunidades.sinonimos', 'select') then
    raise exception 'FALHA: quem usa o MCP não lê os sinônimos direto';
  end if;
end;
$$;

rollback;
