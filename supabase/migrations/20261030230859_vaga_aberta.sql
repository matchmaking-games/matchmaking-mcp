-- Vagas de sistemas de recrutamento que não informam prazo: ficam abertas enquanto
-- aparecerem no site do estúdio, e o prazo é renovado a cada leitura.
-- Fica sozinho nesta migration (ALTER TYPE ... ADD VALUE).
alter type oportunidades.natureza_prazo add value 'vaga_aberta';
