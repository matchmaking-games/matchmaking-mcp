-- Fila de revisão das notícias com teto: por dia, chegam à revisão no máximo 10 notícias, as de nota
-- mais alta. As outras continuam na fila, guardadas, e entram na auditoria semanal.
create function oportunidades.fila_de_noticias(p_dia date default null, p_limite integer default 10)
returns table (
  id uuid,
  nota integer,
  titulo text,
  resumo text,
  motivo text,
  link text,
  fonte text,
  publicada_na_fonte_em timestamptz
)
language sql
stable
set search_path = ''
as $$
  select n.id, n.nota, n.titulo, n.resumo, n.motivo, n.link, f.nome, n.publicada_na_fonte_em
  from oportunidades.noticias n
  join oportunidades.fontes f on f.id = n.fonte_id
  where n.situacao = 'em_fila'
    and n.expira_em > now()
    and (n.criado_em at time zone 'America/Sao_Paulo')::date
        = coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date)
  order by n.nota desc, n.publicada_na_fonte_em desc nulls last
  limit least(greatest(coalesce(p_limite, 10), 1), 50)
$$;

revoke all on function oportunidades.fila_de_noticias(date, integer) from public, anon, authenticated;
grant execute on function oportunidades.fila_de_noticias(date, integer) to service_role;
