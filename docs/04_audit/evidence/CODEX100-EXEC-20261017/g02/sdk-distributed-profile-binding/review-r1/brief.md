# Revisão independente R1 — DX100-G02:BIND-SDK-DISTRIBUTED-PROFILE

Unidade T1 documental: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/` no checkout principal
`/home/ricardo/Área de trabalho/cvg-operational-harness` (pasta nova, não rastreada). Objeto da revisão: `review-freeze-r1.json`
(sha256 `96d6916443d9f2434c7c21648dea425aff8d18c807c85d7fe25d0ae0b20c9340`, 12 arquivos; ficam fora o próprio freeze e `review-r1/`).

## Regras do revisor

- Somente leitura fora de `review-r1/`. O único arquivo que você escreve na unidade é `review-r1/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-dpbind-r1/`.
  Os scripts da unidade gravam na pasta da unidade: rode-os só sobre uma cópia (por exemplo, uma árvore espelhada cujo `<repo_root>`
  aponte para a cópia) ou reimplemente o que precisar.
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r1/`) e
  nenhum `__pycache__`.
- Sem serviço, SDK, rede, PG, porta TCP, commit, branch; nada em `/mnt/ia`; não execute nada do cache distribuído. Python com
  `python3 -I -B`. Não edite nenhuma outra pasta.
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## O pedido do Lead

Produzir `coverage-observed-v7.json` ao lado do v6 (`../sdk-continuation-3-binding/coverage-observed-v6.json`, intocado), consumindo o
DP-1 (10 PASS; o DP-PK07A INVALID_CAPTURE não é consumido), a DP-1R (DP-PK07B) e o DP-2 (5 PASS), só nas partes distinguidas, com:

- DP-1: os P3 registrados;
- DP-2: R1-F04 (PY19.B02 só por `api.steps_exact`), R1-F05 (forma do DP-PY02P vem da declaração do caso) e nenhuma qualificação do
  vocabulário D3 vinda do DP-2;
- DP-1R: `child.program_followed` é de sanidade e o B03 se apoia no stderr do passo 10;
- todo resultado com `NO_BUILD_LINK_DECLARED` e o pin 0.153.4;
- revisão das seis lacunas, com GAP-PLATFORM-PACKAGING e GAP-PROVENANCE refletindo o perfil distribuído;
- `HOW-final-g02.md`: estado final do DX100-G02 depois dos perfis de fonte e distribuído, o que fecha o cartão G02, o que fica para
  outros cartões e a lista consolidada das decisões do usuário que ainda destravariam algo, cada uma numa frase simples com o ganho em
  contratos e braços.

## O que a unidade afirma

- `input-verification.json` (25/25): v5 e decisão do usuário iguais aos blobs de `origin/main`; v6, lacunas v6 e HOW v3 iguais ao
  `review-freeze-r2.json` do BIND da continuação 3; especificação do perfil distribuído igual às cópias `inputs/spec-dp` dos commits do
  DP-1 e do DP-2; as três admissões iguais aos commits destacados (conteúdo e recibo) e aos manifestos, com a decisão do Lead como único
  arquivo fora deles; 16 casos consumidos.
- `coverage-observed-v7.json`: 44 `OBSERVED_CLIENT_PARTIAL` e 0 `OPEN_REQUIRED_FUTURE_PROFILE` (PY19, PY20 e PK01 a PK09 mudam pela
  regra `status_if_all_cases_pass`; PK07 pelo DP-PK07B no lugar do DP-PK07A); 50 partes, 50 creditadas; 45 braços DISTINGUISHED;
  48 resíduos do plano (14 resolvidos, 10 fechados sem observação, 24 abertos, 18 pedindo decisão nova); 9 resíduos do v6 destinados ao
  perfil distribuído reavaliados (3 resolvidos, 1 parcial, 5 abertos, um com destino corrigido); 124 condições do plano; nove decisões
  que destravariam algo, com ganho calculado.
- `gaps-review-v7.json`: seis OPEN; GAP-PROVENANCE 3/3 e GAP-PLATFORM-PACKAGING 12/12 com rótulo de progresso novo.
- `validation.json`: validação independente (recalcula partes, status e cobertura das decisões a partir das entradas), PASS com 26/26
  controles negativos.
- `HOW-final-g02.md`, `state.json` (EXECUTED_PENDING_REVIEW) e `next-task.json` (opções para o Lead).

## Pontos obrigatórios

1. **Crédito por parte**: recalcule das entradas (casos congelados de `cases-dp-1.json`, `cases-dp-2.json` e `cases-dp-1r.json` e os
   `acceptance.json` de serviço) que cada parte creditada tem os predicados de `credited_by` aprovados, que nenhuma parte foi omitida ou
   duplicada e que o DP-PK07A e os CONTROL não aparecem como observação.
2. **Itens do Lead para o BIND**: confira cada um (DP-1 P3 registrados, DP-2 R1-F04, R1-F05 e D3, DP-1R sanidade e passo 10) contra os
   textos de origem (`freeze-addendum-dp1.json#/readings`, `review-r2/executor-disposition.json` do DP-1 e os `next-task.json` da DP-1R
   e do DP-2) e onde foram aplicados.
3. **Pin e build_link**: todo resultado do perfil distribuído com o pin 0.153.4 e `NO_BUILD_LINK_DECLARED`; nenhum vínculo de build
   afirmado.
4. **Status das linhas**: as 11 mudanças pela regra do plano (atenção à substituição do PK07) e as 32 linhas fora do plano iguais ao v6
   (`carried_from_v6`).
5. **Resíduos**: classe, resolução, `needs_new_decision` e `unlocked_by` dos 48 do plano; as leituras dos 9 do v6 (em especial o
   R-PY02-4 parcial pelo lado do PY02.B07 e o R-PY05-3 com destino corrigido, e os dois de TypeScript resolvidos por artefato publicado:
   R-TS01-3 e R-TS09-3). Julgue se alguma resolução avança além do que as partes observam.
6. **Lacunas**: os rótulos novos de GAP-PROVENANCE e GAP-PLATFORM-PACKAGING e as fronteiras restantes refletem o que o perfil
   distribuído observou e o que não observou; as outras quatro sem mudança; todas OPEN.
7. **HOW final**: o estado do cartão G02 frente ao aceite do cartão no `docs/03_build/0386_backlog_paridade_codex.md` (seção
   DX100-G02), a resposta "pode fechar" e as condições, o que fica para outros cartões e as nove decisões (frases simples, ganho em
   contratos e braços batendo com `decisions_that_would_unlock`). Diga se alguma decisão do usuário falta ou sobra.
8. **Validação**: os controles negativos testam o que dizem e a validação não reusa o código do build.
9. Afirmações do `state.json` e do `next-task.json` sustentadas pelos arquivos.

## Formato de saída

Escreva `review-r1/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 1, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r1.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE), `verdict_reason`,
`lead_items` (cada item do Lead com `verdict` e `evidence`), `g02_close_reading` (`verdict` e `evidence`), `findings` (lista com `id`
R1-Fnn, `severity` P1/P2/P3, `area`, `title`, `evidence`, `detail`, `required_action`), `summary_counts`, `functional_receipts` 0 e
`parity_credit` 0. P1/P2 bloqueiam; P3 são endurecimentos e registros. Texto em português.
