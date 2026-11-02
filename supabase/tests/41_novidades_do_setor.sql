-- Novidades do setor: só notícias publicadas e válidas, sem campos internos, com crédito da fonte.
begin;

insert into oportunidades.fontes (id, nome, leitor, configuracao) values
  ('00000000-0000-4000-8000-0000000000fb', 'Fonte A', 'teste', '{}'),
  ('00000000-0000-4000-8000-0000000000fc', 'Fonte B', 'teste', '{}');

insert into oportunidades.noticias
  (id, fonte_id, titulo, link, resumo, publicada_na_fonte_em, nota, motivo, situacao, duplicata_de, expira_em)
values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-0000000000fb', 'Antiga', 'https://exemplo.org/n1', 'Resumo', now() - interval '3 days', 80, 'interno', 'publicada', null, now() + interval '10 days'),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-0000000000fb', 'Recente', 'https://exemplo.org/n2', 'Resumo', now() - interval '1 day', 80, 'interno', 'publicada', null, now() + interval '10 days'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-0000000000fc', 'Duplicata', 'https://exemplo.org/n3', 'Resumo', now() - interval '1 day', 80, 'interno', 'publicada', '00000000-0000-4000-8000-000000000b02', now() + interval '10 days'),
  ('00000000-0000-4000-8000-000000000b04', '00000000-0000-4000-8000-0000000000fb', 'Na fila', 'https://exemplo.org/n4', 'Resumo', now(), 50, 'interno', 'em_fila', null, now() + interval '10 days'),
  ('00000000-0000-4000-8000-000000000b05', '00000000-0000-4000-8000-0000000000fb', 'Vencida', 'https://exemplo.org/n5', 'Resumo', now(), 80, 'interno', 'publicada', null, now() - interval '1 day');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;

do $$
declare
  lista jsonb := vitrine.novidades_do_setor(10);
begin
  if jsonb_array_length(lista) <> 2 then
    raise exception 'FALHA: só as 2 publicadas, válidas e não duplicadas deveriam aparecer, vieram %', jsonb_array_length(lista);
  end if;
  if lista -> 0 ->> 'titulo' is distinct from 'Recente' then
    raise exception 'FALHA: a mais recente deveria vir primeiro';
  end if;
  if lista -> 0 ->> 'fonte' is distinct from 'Fonte A' or lista -> 0 -> 'tambem_em' <> '["Fonte B"]'::jsonb then
    raise exception 'FALHA: deveria trazer a fonte e quem mais noticiou: %', lista -> 0;
  end if;
  if lista -> 0 ? 'motivo' or lista -> 0 ? 'nota' then
    raise exception 'FALHA: a resposta não pode trazer a nota nem o motivo da IA';
  end if;
  if jsonb_array_length(vitrine.novidades_do_setor(1)) <> 1 then
    raise exception 'FALHA: o limite deveria valer';
  end if;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'vitrine.novidades_do_setor(integer)', 'execute') then
    raise exception 'FALHA: quem não entrou não pode chamar';
  end if;
end;
$$;

rollback;
