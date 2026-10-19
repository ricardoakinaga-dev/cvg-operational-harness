# Revisão R2 (final): sdk-observation-drivers

> Transcrição pelo executor do Lead do conteúdo devolvido pelo crítico no handback (o harness
> bloqueia relatório `.md` de subagente). O registro estruturado do próprio crítico é
> [review.json](review.json).

**Veredito: APPROVE**, nenhum achado obrigatório aberto. APPROVE só fecha os achados
obrigatórios; não é qualificação completa. O caminho TS com as fontes R2 nunca rodou em
serviço e a aceitação dos 19 casos SDK ainda não existe.

Objeto: `source-freeze-r2.json` (sha256 `321f893f…a9f1`). Os 27 arquivos bateram em sha256,
bytes e modo antes e depois da revisão; as pré-imagens R1 batem com `source-freeze-r1.json`;
`interface-v1.json`, `quality-bar.json` e `task.json` não mudaram desde a R1.

## Verificações

- `node --check` passou nos 7 fontes Node.
- Selftest (sem argumento): Python 115/115 e Node 98/98, rc 0; hashes de `selftests/*.json` batem com o freeze.
- Identidade de papel e de host recalculada nas 10 tentativas: todas batem com o freeze; só `8ec433a64c73` roda exatamente R2.

## Achados obrigatórios da R1

| id | status | evidência principal |
|---|---|---|
| R1-F01 | RESOLVED | observer invalida papel INVALID/MISSING/NO_TERMINAL; KNOWN_SIGNAL_TERMINATION exige driver END completo e peer END ou SIGNAL; supervisor exige SIGTERM no peer (também TS-ABORT). |
| R1-F02 | RESOLVED | adapter-typescript declara INVALID com forward em voo no fim da janela; observer rejeita END pós-SIGNAL com bytes não confirmados em TS. |
| R1-F03 | RESOLVED | sinal checado após select e antes de cada leitura/escrita; janela ancorada no handler com teto de 100 ms; EAGAIN interrompido; entrega→SIGNAL/END medida pelo supervisor. Em `8ec433`: SIGNAL→END 0,084 ms, entrega→END ≤ 7,6 ms. |
| R1-F04 | RESOLVED | `rc == 0` do driver exigido; controles conferidos antes do END; returncode do adapter comparado no ramo Python. |
| R1-F05 | RESOLVED | freeze R2 registra identidade do host por tentativa e o que cada tentativa qualifica. |
| R1-F06 | RESOLVED | soma de eventos, controles e saída do serviço contra 2 MiB; acima disso mata a unidade e invalida. Em `8ec433`: 128.699 bytes. |
| R1-F07 | RESOLVED | `bindEmitted` no loader, `checkEmitted` no driver antes do import, `sdk_builtins ⊆ builtins` para pais emitidos. |

P3 da R1: F08, F10, F11, F12, F13, F16 e F17 resolvidos (F17 só como documentação: a asserção é
tautológica); F09, F14 e F15 documentados como limite.

## Regressões

Nenhuma regressão que gere falso PASS: barreira RELEASE_EXIT do driver TS (ECHO, LARGE, ABORT,
SDKTS01–10), `role_done` com zumbi, controles antes do END, janela ancorada no handler,
interrupção do EAGAIN, orçamento agregado, caminho de exceção do supervisor e vínculo dos
emitidos. Chamadas SDK dos 19 casos continuam corretas.

## Achados novos (todos P3)

- **R2-F01** `interface-bindings-v1.json:64`: o texto diz que o END normal tem janela própria de até 100 ms e não é barrado pelo prazo do caso; no Python o END normal é limitado pelo prazo (`channel.py:442`). Só o texto está errado; o comportamento é fail-closed.
- **R2-F02** `supervisor.py:740`: o instante de recepção de cada frame não é gravado; a janela de entrega de 100 ms não pode ser reauditada a partir da evidência.
- **R2-F03** `ts-driver.mjs:46`: a asserção de `codexPathOverride` compara a constante consigo mesma.
- **R2-F04** `supervisor.py:528`: comportamento sabidamente errado do SDK (HOOK_CLOSED com closed=false, interrupt sem script) termina como INVALID por prazo, não como MISMATCH; cabe aos predicados de aceitação da próxima porta.

## Critérios

- ATENDIDO: H01, H02, H06, H07, H10, H12.
- PARCIAL: H03, H04, H05, H08, H09 — o caminho TS R2 (barreira final, INVALID em voo, sinal no Node) só foi validado por autoteste e análise estática; a barreira cancel/reply e o loader em serviço só rodaram com identidades anteriores.
- PENDENTE: H11 (Lead).
