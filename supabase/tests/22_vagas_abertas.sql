-- Testes do que acontece a cada leitura com as vagas que já estão no índice.
begin;
set local timezone = 'America/Sao_Paulo';

insert into oportunidades.fontes (id, nome, leitor) values ('00000000-0000-4000-8000-0000000000f3', 'Fonte de vagas', 'teste');

insert into oportunidades.oportunidades (fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, publico, situacao)
values
  ('00000000-0000-4000-8000-0000000000f3', 'Continua aberta', 'vaga', 'https://v.org/1', current_date + 2, 'vaga_aberta', 'nacional', 'pessoa', 'em_moderacao'),
  ('00000000-0000-4000-8000-0000000000f3', 'Tem prazo próprio', 'vaga', 'https://v.org/2', current_date + 2, 'encerramento_inscricoes', 'nacional', 'pessoa', 'em_moderacao'),
  ('00000000-0000-4000-8000-0000000000f3', 'Já tem prazo maior', 'vaga', 'https://v.org/3', current_date + 30, 'vaga_aberta', 'nacional', 'pessoa', 'em_moderacao'),
  ('00000000-0000-4000-8000-0000000000f3', 'Saiu do site', 'vaga', 'https://v.org/4', current_date + 2, 'vaga_aberta', 'nacional', 'pessoa', 'em_moderacao');

do $$
declare
  links text[] := array['https://v.org/1', 'https://v.org/2', 'https://v.org/3'];
  renovadas integer;
  encerradas integer;
begin
  renovadas := oportunidades.renovar_vagas_abertas('00000000-0000-4000-8000-0000000000f3', links, current_date + 14);
  if renovadas <> 1 then
    raise exception 'FALHA: só a vaga aberta ainda presente deveria ser renovada; renovou %', renovadas;
  end if;
  if not exists (select 1 from oportunidades.oportunidades where link_oficial = 'https://v.org/1' and prazo = current_date + 14) then
    raise exception 'FALHA: a vaga aberta deveria ganhar o novo prazo de conferência';
  end if;
  if not exists (select 1 from oportunidades.oportunidades where link_oficial = 'https://v.org/2' and prazo = current_date + 2) then
    raise exception 'FALHA: vaga com prazo informado pela fonte não pode ser renovada';
  end if;
  if not exists (select 1 from oportunidades.oportunidades where link_oficial = 'https://v.org/3' and prazo = current_date + 30) then
    raise exception 'FALHA: a renovação nunca encurta um prazo';
  end if;

  encerradas := oportunidades.encerrar_ausentes('00000000-0000-4000-8000-0000000000f3', links);
  if encerradas <> 1 or not exists (select 1 from oportunidades.oportunidades
                                    where link_oficial = 'https://v.org/4' and situacao = 'removida') then
    raise exception 'FALHA: a vaga que saiu do site deveria sair do índice';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('authenticated', 'oportunidades.renovar_vagas_abertas(uuid, text[], date)', 'execute') then
    raise exception 'FALHA: authenticated não pode renovar vagas';
  end if;
end;
$$;

rollback;
