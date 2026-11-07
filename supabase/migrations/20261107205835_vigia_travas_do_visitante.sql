-- O vigia diário passa a avisar quando uma tabela do site (public ou storage) tem gravação liberada
-- para contas sem a trava que barra o visitante do MCP. As travas são do repositório do site
-- (migration visitante_nao_grava_no_site, PR #101 de lá); este aviso pega tabela nova que ficou sem elas.
-- Só lê pg_policies. Fica de fora o que quem não entrou também pode gravar (newsletter e contagem de visitas).

create or replace function oportunidades.problemas_do_sistema()
returns text[]
language sql
stable
set search_path = ''
as $$
  select array(
    select p.texto from (
      select 1 as ordem, f.nome as chave,
        'A fonte "' || f.nome || '" foi pausada depois de ' || f.falhas_seguidas || ' falhas seguidas. Último erro: ' || coalesce(left(f.ultimo_erro, 300), 'não registrado') as texto
      from oportunidades.fontes f
      where f.situacao = 'pausada' and f.falhas_seguidas >= 3
      union all
      select 2, f.nome, 'A fonte "' || f.nome || '" está com a leitura atrasada há mais de 2 horas. A coleta pode ter parado.'
      from oportunidades.fontes f
      where f.situacao = 'ativa' and f.proxima_leitura_em < now() - interval '2 hours'
      union all
      select 2, f.nome, 'A fonte "' || f.nome || '" não é lida há mais de 2 horas. A leitura do site pode ter parado.'
      from oportunidades.fontes f
      where f.situacao = 'ativa' and f.leitor = 'site' and coalesce(f.ultima_leitura_em, f.criado_em) < now() - interval '2 hours'
      union all
      select 3, f.nome, 'Uma leitura da fonte "' || f.nome || '" começou há mais de 1 hora e não terminou.'
      from oportunidades.leituras l join oportunidades.fontes f on f.id = l.fonte_id
      where l.situacao = 'rodando' and l.iniciada_em < now() - interval '1 hour'
      group by f.nome
      union all
      select 4, '', count(*) || ' oportunidades estão com a conferência de link vencida há mais de 6 horas. A conferência pode ter parado.'
      from oportunidades.oportunidades o
      where o.situacao in ('publicada', 'em_moderacao')
        and o.prazo >= (now() at time zone 'America/Sao_Paulo')::date
        and coalesce(o.proxima_conferencia_em, o.criado_em) < now() - interval '6 hours'
      having count(*) > 0
      union all
      -- Rede de segurança do site: gravação liberada para contas sem a trava que barra o visitante do MCP.
      select 5, '', 'Gravação do site sem a trava de visitante: ' || string_agg(x.alvo, ', ' order by x.alvo)
        || '. Rode de novo o bloco da migration visitante_nao_grava_no_site, no repositório do site.'
      from (
        select distinct p.schemaname || '.' || p.tablename || ' (' || c.cmd || ')' as alvo
        from pg_catalog.pg_policies p
        cross join lateral unnest(
          case when p.cmd = 'ALL' then array['INSERT', 'UPDATE', 'DELETE'] else array[p.cmd::text] end
        ) as c(cmd)
        where p.schemaname in ('public', 'storage')
          and p.permissive = 'PERMISSIVE'
          and p.cmd <> 'SELECT'
          and p.roles && array['authenticated', 'public']::name[]
          and (p.schemaname::text, p.tablename::text, c.cmd) not in (
            ('public', 'newsletter_assinantes', 'INSERT'),
            ('public', 'organizacao_views', 'INSERT'),
            ('public', 'project_views', 'INSERT'),
            ('public', 'studio_views', 'INSERT'),
            ('public', 'profile_views', 'INSERT')
          )
          and not exists (
            select 1 from pg_catalog.pg_policies r
            where r.schemaname = p.schemaname and r.tablename = p.tablename and r.permissive = 'RESTRICTIVE'
              and r.policyname = case c.cmd when 'INSERT' then 'visitante_nao_insere' when 'UPDATE' then 'visitante_nao_atualiza' else 'visitante_nao_apaga' end
          )
      ) x
      having count(*) > 0
    ) p
    order by p.ordem, p.chave
  )
$$;
