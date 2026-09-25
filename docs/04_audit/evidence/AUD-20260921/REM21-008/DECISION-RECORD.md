# REM21-008 — decision record

## Decisão

Criar um catálogo executável de gates e um contrato negativo para o workflow,
fixando o runtime em Node `22.23.2` e separando artefatos por run. A barra
existente será expandida de forma explícita; `npm run verify` permanece útil
como agregador, mas deixa de ser a única prova.

## Alternativas rejeitadas

- confiar somente em `npm run verify`: oculta a composição e não prova
  coverage crítica, mutation, skips, imagem ou certificação;
- usar `node-version: 22` sem versão de reprodutibilidade local: permite
  divergência entre evidência local e CI;
- marcar jobs complementares como `continue-on-error`: transforma ausência em
  aprovação;
- incorporar cache ao candidate: faria uma aceleração não funcional alterar
  a identidade dos testes;
- usar secrets/serviços reais para completar a barra: viola G21-1 e o limite
  operacional do repositório.

## Consequências

O workflow ficará mais longo e consumirá mais recursos descartáveis. Em troca,
cada gate será visível, bloqueante e anexável. `certify` e `certification:verify`
podem continuar sem qualificar o candidato atual enquanto não houver freeze;
isso é um resultado honesto, não uma falha a ser mascarada.

## Estado

`VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; o run local completo passou a barra
mecânica, mas a decisão Phase 10 permaneceu `NO_GO` por provider/canal/IdP e
signoff humano ausentes. Produção, G21-5, G21-6, I1 e freeze continuam
fechados.

Evidência fresca: `BUILD-AUDIT.md`, `verification-summary.json` e
`ci-bar-manifest-summary.json` desta pasta.
