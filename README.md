# Matchmaking MCP
### Vagas e Oportunidades em Games

Servidor MCP (Model Context Protocol) de código aberto que conecta assistentes de IA ao ecossistema de games brasileiro — vagas de emprego, editais de fomento, eventos, game jams e oportunidades regionais curadas por associações parceiras.

Compatível com Claude, ChatGPT, Gemini, Cursor e qualquer ferramenta que suporte o protocolo MCP.

---

## Status

🚧 Em desenvolvimento ativo — ainda não disponível para uso em produção.

---

## O que é isso

O Model Context Protocol (MCP) é um padrão aberto criado pela Anthropic que permite que assistentes de IA consultem dados externos em tempo real. Este servidor expõe ferramentas que qualquer LLM compatível pode usar para responder perguntas como:

> "Sou artista 2D júnior em Belo Horizonte. Quais editais e eventos estão abertos pra mim agora?"

O servidor consulta a base de dados da [Matchmaking](https://matchmaking.games) — marketplace de vagas e oportunidades para a indústria de games no Brasil — e devolve respostas personalizadas por perfil, região e tipo de oportunidade.

---

## Ferramentas disponíveis

### Públicas (sem autenticação)
- `get_contexto_skill` — configuração e contexto de uma skill de associação parceira
- `listar_skills` — lista todas as associações parceiras disponíveis
- `buscar_oportunidades` — editais, eventos, game jams e oportunidades por estado, tipo e público-alvo
- `buscar_vagas` — vagas de emprego por área, nível, modalidade e região

### Autenticadas (requer conta Matchmaking)
- `get_meu_perfil` — retorna o perfil do usuário logado para personalizar buscas
- `buscar_oportunidades_para_mim` — busca cruzada entre perfil e oportunidades disponíveis
- `verificar_associado` — confirma vínculo com uma associação (usado internamente pelo servidor)
- `submeter_oportunidade` — envia conteúdo para revisão (exclusivo para organizações parceiras)

---

## Como conectar

### Claude Desktop / clientes MCP
```json
{
  "mcpServers": {
    "matchmaking": {
      "url": "https://mcp.matchmaking.games"
    }
  }
}
```

*Instruções de instalação serão expandidas quando o servidor estiver em produção.*

---

## Skills de associações

Skills são configurações pré-definidas que personalizam o servidor para o contexto de uma associação parceira específica. Cada skill define filtros regionais, tipos de conteúdo priorizados e pode ter conteúdo exclusivo para seus associados.

| Skill | Associação | Cobertura |
|---|---|---|
| *(em breve)* | Associações parceiras | Regionais e nacional |

Para saber mais sobre como sua associação pode ter uma skill, leia [docs/skills.md](docs/skills.md).

---

## Self-hosting

Veja [docs/self-hosting.md](docs/self-hosting.md) para rodar uma instância própria.

---

## Contribuindo

Leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um PR.
Veja [GOVERNANCE.md](GOVERNANCE.md) para entender como as decisões são tomadas.
Use [GitHub Discussions](../../discussions) para propor ideias antes de implementar.

---

## Licença

[LGPL v3](LICENSE) — você pode usar este servidor em qualquer projeto, inclusive proprietário.
Modificações no código do servidor em si devem ser devolvidas à comunidade sob a mesma licença.

---

## Sobre

Criado e mantido por [Matchmaking.games](https://matchmaking.games) — marketplace de vagas e oportunidades para a indústria de games no Brasil.
