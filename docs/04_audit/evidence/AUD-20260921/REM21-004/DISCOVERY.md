# REM21-004 — Discovery

## Objetivo

Corrigir `A21-F03`: o guard de SSRF resolve e valida os endereços DNS, mas os
adaptadores ainda entregam ao transporte uma URL com hostname. Isso deixa a
conexão dependente de uma nova resolução do socket e não prova que o endereço
validado foi o endereço conectado. O escopo é local/sintético/descartável sob
`G21-1`; nenhum provider externo ou segredo real será usado.

## Evidência observada

- `packages/shared/src/ssrf.ts` já rejeita protocolos, credenciais, hosts
  privados, respostas DNS privadas e redirects sem validação por salto.
- `fetchWithSsrfGuard` retornava o hostname validado ao `fetchImpl`, sem um
  contrato para prender o socket a `resolvedAddresses`.
- EvolutionAPI, Chatwoot e os providers HTTP do `model-gateway` repetiam
  apenas `resolveAndGuardOutboundUrl` e depois chamavam `fetch` com a URL do
  hostname; a validação não controlava o destino efetivo da conexão.
- Os construtores aceitavam HTTP público porque passavam `allowHttp: true`.
  Os adaptadores carregam API keys, então esse fallback não pode ser uma
  política padrão.
- O canal e os providers precisam continuar testáveis com `fetchImpl`
  sintético, mas o caminho default Node deve usar transporte connect-bound
  preservando SNI e `Host`, sem reuso de socket fora do binding validado.

## Critérios de aceitação descobertos

- `AC-01`: transporte default conecta somente a um endereço recebido e
  validado pelo guard para aquele salto; o hostname original permanece como
  SNI/`Host`.
- `AC-02`: redirects seguem sendo manuais e cada novo destino é resolvido,
  validado e preso antes do próximo request.
- `AC-03`: HTTP público é rejeitado na configuração; HTTP só é permitido para
  loopback explicitamente opt-in com `allowPrivateNetworks: true`.
- `AC-04`: rebinding DNS privado é rejeitado antes de enviar bytes; nenhum
  provider ou rede externa é contatado nos testes.
- `AC-05`: adaptadores injetados continuam usando o `fetchImpl` sintético sem
  alterar o contrato observável dos testes existentes.
- `AC-06`: testes focados, typecheck Node 22, lint, links, diff e hashes passam.

## Limitações

O transporte nativo é um adaptador Node local ao `channel-gateway`; o módulo
compartilhado permanece agnóstico de browser. A prova cobre binding do socket,
política, redirects e loopback descartável, não disponibilidade de provider,
certificado real, produção ou credencial real.
