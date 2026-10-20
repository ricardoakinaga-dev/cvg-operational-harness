# Revisão independente R1 — DX100-G02:BIND-SDK-SOURCE-CONTINUATION-3

Unidade T1 documental: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-binding/` no checkout principal
`/home/ricardo/Área de trabalho/cvg-operational-harness` (pasta nova, não rastreada). Objeto da revisão: `review-freeze-r1.json`
(sha256 `88b0c219e3266528e37ee42a14831cd6ccff09b0eee536670f40cac45cd976ad`, 12 arquivos; ficam fora o próprio freeze e `review-r1/`).

## Regras do revisor

- Somente leitura fora de `review-r1/`. O único arquivo que você escreve na unidade é `review-r1/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-bind3-r1/`.
  Se precisar rodar os scripts da unidade, rode-os sobre uma cópia que escreva fora da unidade (eles gravam na pasta da unidade).
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r1/`).
- Sem serviço, SDK, rede, PG, porta TCP, commit, branch; nada em `/mnt/ia`. Python com `python3 -I -B`. Não edite nenhuma outra pasta
  (`../sdk-distributed-profile-spec/` é de outra unidade em andamento; não leia como entrada nem edite).
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## O que a unidade afirma

- Entradas conferidas em `input-verification.json` (20/20): v5, lacunas v5, HOW v2 e a especificação da continuação 3 iguais aos blobs da
  ref `origin/candidate/hiso005-0243-0242-20261019`; as admissões C3-1 e C3-2 iguais aos commits destacados das candidatas (nenhuma ref
  os contém) e aos seus manifestos.
- `coverage-observed-v6.json` ao lado do v5 (não editado): 33 `OBSERVED_CLIENT_PARTIAL` e 11 `OPEN_REQUIRED_FUTURE_PROFILE`, nenhuma
  linha muda de status; 27 casos consumidos; 58 partes da `arm_discrimination` congelada, 57 creditadas; 45 braços (44 DISTINGUISHED,
  PY13.B17 sem parte creditada); PY05.B10 e PY13.B06 saem dos abertos explícitos; 11 braços de escopo parcial do v5 fechados.
- Regra do E3-07 (decisão do Lead ao aceitar a C3-2: "sem crédito para o guarda E3-07"): fica sem crédito toda parte cuja discriminação
  dependa da regra de zero chamadas (só o known_bad "pular o cleanup" do PY13.B17 no C3-PY13ER); as partes que dependem só das esperas
  D3-05 (decididas por `thread_alive`) seguem creditadas, inclusive as do PY13.B18 e do PY08.B08.
- Registros para o BIND aplicados como qualificações: C32-ADM/R1-F02 (fato derivado do passo 12), C32-ADM/R1-F04 (texto corrigido do
  DV-C32-04), C31-ADM/R1-F04 (SUSPENDED só pelo C3-TS04), C32-ADM/DV-C32-01, C32-ADM/DV-C32-02 e o registro do zombie 15 do C31-ADM/R1-F01.
- 77 resíduos do plano resolvidos por classe (`residuals_c3`), com `needs_new_decision`; Q1-Q3 decididas, Q4 negada, Q5 não autorizada.
- `gaps-review-v6.json`: seis lacunas OPEN, contagens iguais às do v5.
- `HOW-next-profile-v3.md`: o que resta do perfil de fonte, separando sem decisão nova, sem caminho determinístico, já decidido
  (perfil distribuído), exige decisão nova e fechados sem observação.
- `validation.json`: segunda implementação do executor, PASS com 20/20 controles negativos.
- `state.json` (EXECUTED_PENDING_REVIEW) e `next-task.json` (opções para o Lead).

## Pontos obrigatórios

1. **Crédito por parte:** recalcule das entradas (casos congelados e `acceptance.json` de serviço) que cada parte creditada tem todos os
   `judged_by` aprovados e que nenhuma parte foi omitida ou duplicada (atenção ao C3-PY12, que tem duas entradas com o mesmo contrary).
2. **E3-07:** julgue se a leitura adotada é fiel à decisão do Lead e ao C32-ADM/R1-F01 item (4); se alguma outra parte deveria ficar sem
   crédito (PY13.B18 "exceção engolida", PY08.B08 "goal fora do fail_all") ou se a parte do PY13.B17 poderia ser creditada.
3. **Fechamento dos braços parciais e abertos do v5:** para cada braço em `arms_v5_partial_closed_by_c3` e nos abertos resolvidos, confira
   que o contrary do C3 cobre de fato o "não observado" do v5 (`v5_gap_closed_by_c3`).
4. **Registros para o BIND:** os três pedidos pelo Lead (passo 12 do C3-PY13ER, texto do DV-C32-04, F04 do C3-1) e os demais.
5. **Resíduos e HOW:** a classe e o destino de cada resíduo, `needs_new_decision` frente às respostas Q1-Q5, a contagem 34/2/38/3 e a
   separação do HOW; e que nada do perfil distribuído foi promovido (os 11 seguem abertos).
6. **Lacunas:** seis OPEN, contagens e rótulos de progresso iguais ao v5.
7. **Cópia do v5:** `carried_from_v5` de cada linha igual à linha do v5; v5 sem mudança.
8. Afirmações do `state.json` e do `next-task.json` sustentadas pelos arquivos.

## Formato de saída

Escreva `review-r1/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 1, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r1.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE), `verdict_reason`,
`e3_07_reading` (`verdict` e `evidence`), `findings` (lista com `id` R1-Fnn, `severity` P1/P2/P3, `area`, `title`, `evidence`, `detail`,
`required_action`), `summary_counts`, `functional_receipts` 0 e `parity_credit` 0. P1/P2 bloqueiam; P3 são endurecimentos e registros.
Texto em português.
