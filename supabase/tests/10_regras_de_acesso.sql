-- Testes das regras do banco, rodados num banco temporário a cada PR.
-- Cada bloco para a execução com "FALHA: ..." se uma regra não for cumprida.
begin;

-- Dados de teste, gravados como dono do banco.
insert into public.habilidades (id, nome) values ('00000000-0000-4000-8000-0000000000a1', 'Unity');

insert into oportunidades.fontes (id, nome, leitor, configuracao)
values ('00000000-0000-4000-8000-0000000000f1', 'Fonte de teste', 'teste', '{"coluna_interna": "x"}');

insert into oportunidades.oportunidades
  (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico, situacao, publicada_em, motivo_moderacao)
values
  ('00000000-0000-4000-8000-0000000000f1', 'Publicada e aberta', 'edital_fomento', 'https://exemplo.org/a',
   current_date + 30, 'encerramento_inscricoes', 'estado', array['SP'], 'ambos', 'publicada', now(), 'interno'),
  ('00000000-0000-4000-8000-0000000000f1', 'Publicada e vencida', 'vaga', 'https://exemplo.org/b',
   current_date - 3, 'encerramento_inscricoes', 'remoto', null, 'pessoa', 'publicada', now(), null),
  ('00000000-0000-4000-8000-0000000000f1', 'Em moderacao', 'evento', 'https://exemplo.org/c',
   current_date + 30, 'data_do_evento', 'nacional', null, 'ambos', 'em_moderacao', null, null);

-- Visitante do MCP: usuário anônimo, papel authenticated.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;

do $$
declare
  n integer;
  fonte text;
begin
  select count(*), max(v.fonte) into n, fonte from vitrine.oportunidades v;
  if n <> 1 then
    raise exception 'FALHA: a vitrine deveria mostrar só a oportunidade publicada e aberta, mostrou %', n;
  end if;
  if fonte is distinct from 'Fonte de teste' then
    raise exception 'FALHA: a vitrine deveria trazer o crédito da fonte';
  end if;
end;
$$;

do $$
begin
  begin
    perform configuracao from oportunidades.fontes limit 1;
    raise exception 'FALHA: visitante leu a configuração das fontes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform motivo_moderacao from oportunidades.oportunidades limit 1;
    raise exception 'FALHA: visitante leu um campo interno das oportunidades';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from oportunidades.itens_brutos limit 1;
    raise exception 'FALHA: visitante leu itens brutos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from oportunidades.sinonimos limit 1;
    raise exception 'FALHA: visitante leu os sinônimos direto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into oportunidades.oportunidades (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico)
    values ('00000000-0000-4000-8000-0000000000f1', 'Intrusa', 'vaga', 'https://x.org', current_date, 'encerramento_inscricoes', 'nacional', 'pessoa');
    raise exception 'FALHA: visitante gravou uma oportunidade';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Sem login nenhum: papel anon.
set local role anon;

do $$
begin
  begin
    perform 1 from vitrine.oportunidades limit 1;
    raise exception 'FALHA: quem não fez login leu a vitrine';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Regras do contrato mínimo, conferidas pelo próprio banco.
do $$
declare
  f constant uuid := '00000000-0000-4000-8000-0000000000f1';
  recusou boolean;
  caso record;
begin
  for caso in
    select * from (values
      ('estado sem UFs',     'evento',   'https://e.org', 'estado',   null::text[],        current_date),
      ('nacional com UFs',   'evento',   'https://e.org', 'nacional', array['SP'],         current_date),
      ('UF inexistente',     'evento',   'https://e.org', 'estado',   array['XX'],         current_date),
      ('tipo notícia',       'noticia',  'https://e.org', 'nacional', null::text[],        current_date),
      ('link sem http(s)',   'vaga',     'ftp://e.org',   'nacional', null::text[],        current_date),
      ('sem prazo',          'vaga',     'https://e.org', 'nacional', null::text[],        null::date)
    ) as t(nome, tipo, link, abrangencia, ufs, prazo)
  loop
    recusou := false;
    begin
      insert into oportunidades.oportunidades (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico)
      values (f, 'Caso de teste', caso.tipo::oportunidades.tipo_item, caso.link, caso.prazo, 'encerramento_inscricoes',
              caso.abrangencia::oportunidades.abrangencia, caso.ufs, 'ambos');
    exception when check_violation or not_null_violation then
      recusou := true;
    end;
    if not recusou then
      raise exception 'FALHA: o banco aceitou um item com %', caso.nome;
    end if;
  end loop;

  begin
    insert into oportunidades.oportunidade_habilidades (oportunidade_id, habilidade_id)
    select id, gen_random_uuid() from oportunidades.oportunidades limit 1;
    raise exception 'FALHA: o banco aceitou uma habilidade que não existe';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into oportunidades.sinonimos (termo, habilidade_id, tipo_funcao_id)
    values ('Dois alvos', '00000000-0000-4000-8000-0000000000a1', null);
    insert into oportunidades.sinonimos (termo, habilidade_id) values ('  DOIS ALVOS ', '00000000-0000-4000-8000-0000000000a1');
    raise exception 'FALHA: o banco aceitou um sinônimo repetido';
  exception when unique_violation then null;
  end;
end;
$$;

select 'Todas as regras do banco foram cumpridas.' as resultado;

rollback;
