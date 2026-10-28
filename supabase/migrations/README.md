# Migrations

Cada arquivo é uma mudança no banco, aplicada em ordem pelo nome
(`AAAAMMDDHHMMSS_descricao.sql`). Toda migration passa primeiro pelo ambiente
de dev e só depois pela produção.

Regras para toda migration:

- Tabela nova: RLS ligado e GRANTs explícitos para `anon` e `authenticated`.
- Funções `SECURITY DEFINER`: `SET search_path = ''` e nomes completos (`schema.tabela`).
- `ALTER TYPE ... ADD VALUE` sempre numa migration própria.
- Nenhuma tabela do site é alterada por este repositório.

O verificador `scripts/verificar-migrations.mjs` confere essas regras em todo PR e
recusa comandos fora dos schemas `oportunidades` e `vitrine`.
