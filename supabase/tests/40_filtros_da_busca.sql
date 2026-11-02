-- Filtros de quem pode participar e de prazo: valem antes do limite.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor, configuracao)
values ('00000000-0000-4000-8000-0000000000fa', 'Fonte dos filtros', 'teste', '{}');

insert into oportunidades.oportunidades
  (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico, situacao, publicada_em)
values
  ('00000000-0000-4000-8000-0000000000fa', 'Para pessoa em breve', 'vaga', 'https://exemplo.org/f1', current_date + 5, 'encerramento_inscricoes', 'nacional', 'pessoa', 'publicada', now()),
  ('00000000-0000-4000-8000-0000000000fa', 'Para empresa depois', 'edital_fomento', 'https://exemplo.org/f2', current_date + 60, 'encerramento_inscricoes', 'nacional', 'empresa', 'publicada', now()),
  ('00000000-0000-4000-8000-0000000000fa', 'Para ambos em breve', 'evento', 'https://exemplo.org/f3', current_date + 10, 'data_do_evento', 'nacional', 'ambos', 'publicada', now()),
  ('00000000-0000-4000-8000-0000000000fa', 'Vaga sem data', 'vaga', 'https://exemplo.org/f4', current_date + 3, 'vaga_aberta', 'nacional', 'pessoa', 'publicada', now());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;

create function pg_temp.titulos(p_publico oportunidades.publico default null, p_prazo integer default null, p_limite integer default 20)
returns text[] language sql as $$
  select coalesce(array_agg(r ->> 'titulo' order by r ->> 'titulo'), '{}')
  from jsonb_array_elements(vitrine.pesquisar_oportunidades(p_limite => p_limite, p_publico => p_publico, p_prazo_em_dias => p_prazo) -> 'resultados') r
$$;

do $$
begin
  if pg_temp.titulos() <> array['Para ambos em breve', 'Para empresa depois', 'Para pessoa em breve', 'Vaga sem data'] then
    raise exception 'FALHA: sem filtro, todas deveriam aparecer: %', pg_temp.titulos();
  end if;
  if pg_temp.titulos(p_publico => 'empresa') <> array['Para ambos em breve', 'Para empresa depois'] then
    raise exception 'FALHA: empresa deveria ver o que é para empresa e para ambos: %', pg_temp.titulos(p_publico => 'empresa');
  end if;
  if pg_temp.titulos(p_publico => 'pessoa') <> array['Para ambos em breve', 'Para pessoa em breve', 'Vaga sem data'] then
    raise exception 'FALHA: pessoa deveria ver o que é para pessoa e para ambos: %', pg_temp.titulos(p_publico => 'pessoa');
  end if;
  if pg_temp.titulos(p_prazo => 30) <> array['Para ambos em breve', 'Para pessoa em breve'] then
    raise exception 'FALHA: o filtro de prazo deve deixar de fora o que vence depois e o que não tem data: %', pg_temp.titulos(p_prazo => 30);
  end if;
  if pg_temp.titulos(p_publico => 'empresa', p_prazo => 30) <> array['Para ambos em breve'] then
    raise exception 'FALHA: os dois filtros deveriam valer juntos';
  end if;
  -- O filtro vem antes do limite: com limite 1, ainda acha o item certo.
  if pg_temp.titulos(p_publico => 'empresa', p_prazo => 90, p_limite => 1) = '{}' then
    raise exception 'FALHA: o limite veio antes do filtro';
  end if;
  -- A chamada antiga, sem os filtros, continua valendo.
  if (select count(*) from vitrine.buscar_oportunidades(p_limite => 20)) <> 4 then
    raise exception 'FALHA: a busca sem filtros novos deveria continuar funcionando';
  end if;
end;
$$;

reset role;

do $$
begin
  if to_regprocedure('vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer)') is not null then
    raise exception 'FALHA: a versão antiga da busca deveria ter saído';
  end if;
  if has_function_privilege('anon', 'vitrine.pesquisar_oportunidades(oportunidades.tipo_item, text, text, integer, oportunidades.publico, integer)', 'execute') then
    raise exception 'FALHA: quem não entrou não pode buscar';
  end if;
end;
$$;

rollback;
