# Política de Segurança

## Reportando uma vulnerabilidade

**Não abra uma Issue pública para reportar vulnerabilidades de segurança.**

Se você encontrou um problema de segurança — vazamento de dados, bypass de RLS, exposição de informações sensíveis ou qualquer problema que possa afetar usuários — entre em contato diretamente:

**Email:** contato@matchmaking.games  
**Assunto:** [SECURITY] Descrição breve do problema

Responderemos em até 48 horas.

---

## O que incluir na mensagem

- Descrição clara do problema
- Passos para reproduzir
- Impacto potencial
- Sua sugestão de correção (opcional)

---

## O que acontece depois

Após confirmar a vulnerabilidade, trabalharemos para corrigir o problema antes de qualquer divulgação pública. O prazo típico é de até 90 dias dependendo da complexidade. Se quiser crédito público pela descoberta, mencione isso no email — você será incluído no CHANGELOG quando a correção for lançada.

---

## Escopo

Este repositório cobre apenas o servidor MCP comunitário (`matchmaking-mcp`). Problemas relacionados à plataforma Matchmaking.games em si devem ser reportados pelo mesmo email.

---

## Credenciais acidentalmente expostas

Se você encontrou credenciais, tokens ou chaves de API expostos em qualquer commit deste repositório — mesmo que já tenham sido removidos do histórico — reporte imediatamente. Credenciais expostas em histórico de git são consideradas comprometidas mesmo após remoção e devem ser rotacionadas.
