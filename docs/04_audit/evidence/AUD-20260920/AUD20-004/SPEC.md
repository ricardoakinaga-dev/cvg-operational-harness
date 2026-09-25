# AUD20-004 - SPEC

- programa: `AUD-20260920-REAUDIT`
- task: `AUD20-004`
- finding: `A20-F13`
- autorizacao: `G20-1`, somente escopo local, sintetico e descartavel
- fonte: `docs/03_build/0333_audit20_backlog.md`

## Objetivo

Tornar exata a identidade do gate Phase 4A. Cada documento autoritativo deve
declarar exatamente um candidate digest, e os dois valores devem ser iguais a
`frozen-anchor.json`. Hashes de reports, fingerprints, sentinels e erratas
historicas nao podem ser interpretados como identidade do candidato.

## Criterios de aceite

1. A extracao considera somente declaracoes semanticas `candidate:` /
   `Candidate digest:` / `candidateId:`.
2. Cada documento deve conter exatamente uma declaracao autoritativa.
3. A declaracao de cada documento e o digest compartilhado devem ser iguais a
   ancora congelada `6185c586e3820665faa5b735ec27f7395d01fa15c1e9199263023bb52dbba73e`.
4. O caso "ancora + digest extra" falha fechado.
5. Os documentos live, o teste focado e a suite estrutural Phase 4A passam.

## Fora de escopo

Nenhuma alteracao de produto Phase 4A, provider, canal, IdP, dado real,
producao ou acao sensivel.
