# Self-hosting

Este servidor pode ser rodado por qualquer pessoa ou organização que queira hospedar uma instância própria.

---

## Pré-requisitos

- Node.js 20+
- Um projeto Supabase com o schema compatível
- Um cliente MCP compatível (Claude Desktop, Claude.ai, etc.)

---

## Instalação

```bash
git clone https://github.com/matchmaking-games/matchmaking-mcp
cd matchmaking-mcp
npm install
cp .env.example .env
# edite .env com suas credenciais Supabase
npm run dev
```

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | sim | Anon key pública do projeto |
| `PORT` | não | Porta local (padrão: 3000) |

O servidor não inicia se `SUPABASE_URL` ou `SUPABASE_ANON_KEY` estiverem ausentes.

---

## Schema do banco de dados

O servidor depende das seguintes tabelas:

- `newsletter_itens` — fonte principal de oportunidades, editais e eventos
- `mcp_skill_config` — configurações de skills de associações
- `organizacoes` — dados das associações parceiras
- `organizacao_associados` — vínculos entre usuários e associações
- `organizacao_membros` — equipe interna das organizações
- `vagas` + `estudios` + `vaga_tipos_funcao` + `tipos_funcao` — vagas de emprego
- `users` + `user_habilidades` + `habilidades` + `estudio_membros` + `jogos` — perfis

O schema completo e as migrations estão documentados no repositório principal da Matchmaking (privado). Para self-hosting com banco próprio, entre em contato para receber o schema: contato@matchmaking.games

---

## Segurança em produção

- Não exponha o servidor diretamente sem um reverse proxy (nginx, Caddy) com rate limiting
- Use a anon key do Supabase — nunca a service role key
- O servidor respeita o RLS configurado no Supabase por design
- Monitore os logs para acessos suspeitos à tool `submeter_oportunidade`

---

## Deploy na Vercel

O servidor é configurado como uma função serverless Node.js na Vercel. Ao configurar as variáveis de ambiente, selecione **"Production and Preview"** — não apenas "Development".
