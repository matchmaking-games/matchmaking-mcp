-- Testes da busca com sinônimos: acentos, palavras inteiras, descrição, vocabulário único nos dois
-- sentidos e registro das buscas sem resultado.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor) values ('00000000-0000-4000-8000-0000000000f6', 'Fonte da busca', 'teste');
insert into public.tipos_funcao (id, nome) values ('00000000-0000-4000-8000-0000000000b6', 'Environment Artist');
insert into oportunidades.sinonimos (termo, tipo_funcao_id) values ('artista de cenário', '00000000-0000-4000-8000-0000000000b6');

insert into oportunidades.oportunidades (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico, situacao, publicada_em, descricao)
values
  ('00000000-0000-4000-8000-0000000000f6', 'Vaga de Environment Artist Sênior', 'vaga', 'https://b.org/1', current_date + 10,
   'encerramento_inscricoes', 'nacional', 'pessoa', 'publicada', now(), null),
  ('00000000-0000-4000-8000-0000000000f6', 'Vaga de arte para jogo de corrida', 'vaga', 'https://b.org/2', current_date + 10,
   'encerramento_inscricoes', 'nacional', 'pessoa', 'publicada', now(), 'Procuramos artista de cenários para o time.'),
  ('00000000-0000-4000-8000-0000000000f6', 'Build engineer para console', 'vaga', 'https://b.org/3', current_date + 10,
   'encerramento_inscricoes', 'nacional', 'pessoa', 'publicada', now(), null);

set local role authenticated;
do $$
declare
  n integer;
begin
  select count(*) into n from vitrine.buscar_oportunidades(p_texto => 'ARTISTA DE CENARIO', p_limite => 20);
  if n <> 2 then
    raise exception 'FALHA: "ARTISTA DE CENARIO" deveria achar a vaga com o nome oficial e a com o sinônimo na descrição; achou %', n;
  end if;

  select count(*) into n from vitrine.buscar_oportunidades(p_texto => 'environment artist', p_limite => 20);
  if n <> 2 then
    raise exception 'FALHA: o nome oficial deveria achar também a vaga escrita com o sinônimo; achou %', n;
  end if;

  select count(*) into n from vitrine.buscar_oportunidades(p_texto => 'senior', p_limite => 20);
  if n <> 1 then
    raise exception 'FALHA: a busca deveria ignorar acentos ("senior" acha "Sênior"); achou %', n;
  end if;

  select count(*) into n from vitrine.buscar_oportunidades(p_texto => 'uil', p_limite => 20);
  if n <> 0 then
    raise exception 'FALHA: a busca deveria comparar palavras inteiras ("uil" não acha "Build")';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select vezes from oportunidades.buscas_sem_resultado where termo = 'uil') <> 1 then
    raise exception 'FALHA: a busca sem resultado deveria ficar registrada';
  end if;
end;
$$;

set local role authenticated;
select count(*) from vitrine.buscar_oportunidades(p_texto => 'uil');
reset role;

do $$
begin
  if (select vezes from oportunidades.buscas_sem_resultado where termo = 'uil') <> 2 then
    raise exception 'FALHA: a mesma busca sem resultado no mesmo dia deveria somar, não duplicar';
  end if;
  if has_table_privilege('authenticated', 'oportunidades.buscas_sem_resultado', 'select') then
    raise exception 'FALHA: quem usa o MCP não lê o registro de buscas';
  end if;
end;
$$;

rollback;
