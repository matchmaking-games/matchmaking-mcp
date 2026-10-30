-- Segunda parte da busca com limite: depois que o servidor passou a usar
-- vitrine.buscar_oportunidades, a leitura direta sai do papel authenticated.
-- A leitura direta da vitrine e das colunas internas sai do papel authenticated.
-- A view continua existindo para uso interno.
revoke all on table vitrine.oportunidades from authenticated;
revoke select (
  id, fonte_id, titulo, tipo, link_oficial, prazo, natureza_prazo, abrangencia, ufs, publico,
  descricao, niveis, valor, publico_especifico, situacao
) on table oportunidades.oportunidades from authenticated;
revoke select (id, nome) on table oportunidades.fontes from authenticated;
-- O uso do schema continua, só para os tipos da busca (tipo, região, público) serem reconhecidos;
-- sem permissão em nenhuma tabela, ele não expõe dado nenhum.

drop policy oportunidades_publicadas_para_contas on oportunidades.oportunidades;
drop policy fontes_com_oportunidade_publicada on oportunidades.fontes;
