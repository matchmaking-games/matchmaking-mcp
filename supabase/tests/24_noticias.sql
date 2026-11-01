-- Testes da área de notícias: faixas de nota, início em observação (nada publica sozinho),
-- mesma história, notícia antiga, link repetido e nenhum acesso direto de quem usa o MCP.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor) values ('00000000-0000-4000-8000-0000000000f5', 'Portal de notícias', 'teste');

do $$
declare
  f constant uuid := '00000000-0000-4000-8000-0000000000f5';
  alta oportunidades.situacao_noticia;
  media oportunidades.situacao_noticia;
  baixa oportunidades.situacao_noticia;
  antiga oportunidades.situacao_noticia;
  repetida oportunidades.situacao_noticia;
  id_alta uuid;
begin
  alta := oportunidades.registrar_noticia(f, null, 'Programa de fomento novo', 'New funding program', 'https://n.org/1', 'Resumo.', 'en', now(), 95, 'Muda decisões', null);
  media := oportunidades.registrar_noticia(f, null, 'Dados do setor', null, 'https://n.org/2', 'Resumo.', 'pt', now(), 55, 'Interessante', null);
  baixa := oportunidades.registrar_noticia(f, null, 'Curiosidade', null, 'https://n.org/3', 'Resumo.', 'pt', now(), 20, 'Consumo', null);

  -- Em observação, nem a nota alta publica: vai para a fila do Lucas.
  if alta <> 'em_fila' or media <> 'em_fila' or baixa <> 'descartada' then
    raise exception 'FALHA: em observação, 95 e 55 iam para a fila e 20 era descartada; deu %, %, %', alta, media, baixa;
  end if;
  if exists (select 1 from oportunidades.noticias where situacao = 'publicada') then
    raise exception 'FALHA: nada pode ser publicado com a publicação automática desligada';
  end if;

  select id into id_alta from oportunidades.noticias where link = 'https://n.org/1';
  if (select expira_em::date from oportunidades.noticias where id = id_alta) <> (now() + interval '21 days')::date then
    raise exception 'FALHA: a notícia deveria valer por 21 dias';
  end if;

  repetida := oportunidades.registrar_noticia(f, null, 'Fomento novo, outra fonte', null, 'https://outro.org/a', 'Resumo.', 'pt', now(), 90, 'Muda decisões', id_alta);
  if repetida <> 'descartada'
     or (select duplicata_de from oportunidades.noticias where link = 'https://outro.org/a') is distinct from id_alta then
    raise exception 'FALHA: a mesma história deveria ficar como duplicata, descartada';
  end if;

  antiga := oportunidades.registrar_noticia(f, null, 'Notícia velha', null, 'https://n.org/4', 'Resumo.', 'pt', now() - interval '40 days', 90, 'Muda decisões', null);
  if antiga <> 'descartada' then
    raise exception 'FALHA: notícia com mais de 21 dias deveria ser descartada';
  end if;

  -- O mesmo link não entra duas vezes.
  perform oportunidades.registrar_noticia(f, null, 'De novo', null, 'https://n.org/1', 'Resumo.', 'pt', now(), 95, 'x', null);
  if (select count(*) from oportunidades.noticias where link = 'https://n.org/1') <> 1 then
    raise exception 'FALHA: link repetido não pode duplicar a notícia';
  end if;

  -- A fila do dia traz no máximo o limite pedido, das notas mais altas para as mais baixas.
  perform oportunidades.registrar_noticia(f, null, 'Nota ' || g, null, 'https://fila.org/' || g, 'Resumo.', 'pt', now(), 40 + g, 'x', null)
  from generate_series(1, 12) g;
  if (select count(*) from oportunidades.fila_de_noticias(null, 10)) <> 10 then
    raise exception 'FALHA: a fila do dia deveria trazer no máximo 10 notícias';
  end if;
  if (select min(nota) from oportunidades.fila_de_noticias(null, 10)) < (select max(nota) from oportunidades.noticias
        where situacao = 'em_fila' and id not in (select id from oportunidades.fila_de_noticias(null, 10))) then
    raise exception 'FALHA: a fila do dia deveria trazer as notas mais altas';
  end if;

  if has_table_privilege('authenticated', 'oportunidades.noticias', 'select')
     or has_table_privilege('anon', 'oportunidades.noticias', 'select')
     or has_function_privilege('authenticated', 'oportunidades.registrar_noticia(uuid, uuid, text, text, text, text, text, timestamptz, integer, text, uuid)', 'execute') then
    raise exception 'FALHA: quem usa o MCP não lê nem grava notícias direto';
  end if;
end;
$$;

rollback;
