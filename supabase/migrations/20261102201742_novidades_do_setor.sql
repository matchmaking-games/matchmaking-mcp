-- Notícias publicadas e ainda válidas, com o crédito da fonte. Só leitura: a publicação fica em outra etapa.
create function vitrine.novidades_do_setor(p_limite integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(v) order by v.ordem), '[]'::jsonb)
  from (
    select
      n.id, n.titulo, n.titulo_original, n.link, n.resumo, n.idioma_original, n.publicada_na_fonte_em,
      f.nome as fonte,
      (
        select coalesce(array_agg(distinct fd.nome), '{}')
        from oportunidades.noticias d
        join oportunidades.fontes fd on fd.id = d.fonte_id
        where d.duplicata_de = n.id
      ) as tambem_em,
      row_number() over (order by n.publicada_na_fonte_em desc nulls last, n.criado_em desc) as ordem
    from oportunidades.noticias n
    join oportunidades.fontes f on f.id = n.fonte_id
    where n.situacao = 'publicada'
      and n.expira_em > now()
      and n.duplicata_de is null
    order by ordem
    limit least(greatest(coalesce(p_limite, 5), 1), 20)
  ) v
$$;

comment on function vitrine.novidades_do_setor(integer) is 'Usada pela ferramenta novidades_do_setor do MCP.';

revoke all on function vitrine.novidades_do_setor(integer) from public, anon;
grant execute on function vitrine.novidades_do_setor(integer) to authenticated, service_role;
