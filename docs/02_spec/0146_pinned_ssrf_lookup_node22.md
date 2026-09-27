# 0146 — SPEC em revisão: callback do lookup fixado em Node 22

- Origem: investigação de cobertura [PR-007](../03_build/0356_production_backlog_2026-09-26.md) e teste sintético de transporte HTTP em loopback.
- Trilha: **T3, segurança/SSRF**. Estado `SPEC_DRAFT_FOR_REVIEW`; nenhum BUILD nos dois transportes está autorizado por este documento. Produção `NO_GO`.

## Recon e falha reproduzida

`packages/model-gateway/src/providers/ssrf-node.ts` e
`packages/channel-gateway/src/adapters/ssrf-node.ts` repetem o mesmo
`pinnedLookup`: ele sempre chama `callback(null, address, family)`. Em Node
22.23.2, testes com `allowed.example` como autoridade HTTP, endereço fixado
`127.0.0.1` e servidor sintético em loopback falharam nos dois módulos com
`TypeError: Invalid IP address: undefined`. Seis dos oito casos da matriz
falharam (requisição, corpos e abort em ambos); os dois casos de rejeição
precoce de entrada inválida passaram. Nenhum endpoint externo foi usado.
[Fonte e resultado da reprodução](../04_audit/evidence/AUD-20260927/PR007-SSRF/repro.md).

O Node usa `autoSelectFamily` e pode chamar o lookup customizado com
`options.all = true`. Nesse caso, a assinatura esperada do callback é
`(err, [{ address, family }])`, em vez de `(err, address, family)`, conforme
[DNS](https://nodejs.org/api/dns.html#dnslookuphostname-options-callback) e
[Net](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener).
A falha é coerente com o `address` indefinido observado; a conclusão ainda
precisa da prova pós-correção no Node 22.

## Regra proposta para revisão humana

1. Em ambos os módulos, `pinnedLookup` deve respeitar `options.all`: retornar
   **somente o endereço já aprovado** como array de um `{ address, family }`
   quando `all` for verdadeiro; manter a assinatura única existente quando
   for falso. `family` virá de `isIP(address)` após validação. Nenhuma segunda
   resolução DNS, fallback, IP alternativo ou mudança da autoridade HTTP/TLS
   é permitida.
2. Executar a mesma matriz sintética para ambos os transportes: endereço
   ausente/não IP e protocolo inválido bloqueados; requisição real apenas ao
   loopback fixado com `Host` original; corpos e headers aceitos; abort antes
   da conexão; teste direto das duas formas de callback. Manter os testes
   sem dados reais e sem rede externa.
3. Rodar `typecheck`, `lint`, suíte unitária, PostgreSQL, E2E, Security e
   certificação do candidato. O runtime continua bloqueado para produção.

## Aceite e autoridade

A revisão humana deve confirmar o escopo exato desta correção de segurança
antes do BUILD T3, conforme [constituição, D-12](../07_agents/AGENTS.md).
Sem essa revisão, a prova falha permanece apenas diagnóstico; PR-007 pode
avançar em cobertura e lint T2, mas não incorporar o teste falhando ao
candidato de certificação.
