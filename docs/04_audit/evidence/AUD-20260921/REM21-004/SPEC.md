# REM21-004 — SPEC

## Composição

1. `packages/shared/src/ssrf.ts` expõe um contrato opcional de transporte
   bound que recebe a URL original, o init com redirect manual e a lista de
   endereços previamente validados. Sem esse transporte, o seam de `fetchImpl`
   continua recebendo apenas URL e init para testes sintéticos.
2. `packages/channel-gateway/src/adapters/ssrf-node.ts` e
   `packages/model-gateway/src/providers/ssrf-node.ts` implementam o caminho
   Node com `node:http`/`node:https`, `lookup` determinístico para o endereço
   validado, `agent: false`, SNI original em HTTPS e cabeçalho `Host` original.
3. EvolutionAPI, Chatwoot, OpenAI-compatible e Ollama usam
   `fetchWithSsrfGuard`; o transporte bound é selecionado quando não há
   `fetchImpl` injetado.
4. A política de protocolo é derivada da configuração: HTTPS somente por
   padrão; HTTP somente quando a URL é loopback, todos os endereços resolvidos
   também são loopback e o opt-in privado está ativo.
5. Os helpers não seguem redirects implicitamente. O guard manual resolve cada `Location`,
   rejeita alvos inseguros e chama novamente o transporte com novo binding.

## Invariantes de segurança

- nenhum byte é enviado antes da resolução/validação do hop atual;
- o endereço usado no socket pertence à lista validada do mesmo hop;
- SNI e `Host` não são substituídos pelo IP conectado;
- API key não é enviada para host fora da allowlist nem para HTTP público;
- rebinding privado, DNS vazio ou falha de resolução falham fechados;
- o shared package não importa módulos Node de transporte e continua
  compatível com consumidores web.

## Testes obrigatórios

- `packages/shared/src/__tests__/ssrf-egress.test.ts`: binding inicial,
  binding após redirect e ausência de chamada ao fallback;
- `packages/channel-gateway/src/__tests__/channel-gateway.test.ts` e
  `packages/model-gateway/src/__tests__/local-http-providers.test.ts`:
  política HTTP pública, loopback opt-in, Host/body no servidor descartável e
  rejeição de DNS privado;
- regressão dos testes de adapters e do restante do package.

## Gate SPEC

O SPEC é limitado a `A21-F03`/`REM21-004` e ao gate `G21-1`. Após BUILD, a
auditoria local registra os comandos, a versão Node, a lista de artefatos e os
hashes; `I1`, freeze, PostgreSQL e certificação final continuam separados.
