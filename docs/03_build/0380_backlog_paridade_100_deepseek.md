# 0380 — Backlog de paridade 100% com o DeepSeek Harness

- Task: `PARE100-GAP-20261016-F5` (Claude Code). Pedido do usuário em 16/10/2026: "preciso de um backlog e um roadmap para que o operational-harness alcance 100% de pareamento com o deepseek harness".
- Estado: `APPROVED` como carteira oficial de paridade pelo usuário em 16/10/2026 (D1 a D7 do [roadmap 0379](0379_roadmap_paridade_100_deepseek.md)). A carteira não autoriza BUILD: cada cartão T3 ou T4 segue a constituição (SPEC, revisão humana, gates) antes de código.
- Roteiro: [roadmap 0379](0379_roadmap_paridade_100_deepseek.md). Evidência da análise: [PARE100-GAP-20261016](../04_audit/evidence/PARE100-GAP-20261016/README.md).
- Referência congelada: DeepSeek `0.2.0-rc.1`, commit `768fb1f3d3dcf9a16659ee354e927d05475f22dd`, o mesmo pin do [plano 0376](0376_plano_executivo_paridade_integral.md).

## Extensão Claude100 — 17/10/2026

Por pedido do usuário, as 16 famílias da análise [0618](../04_audit/0618_claude_code_capabilities_2026-10-17.md) receberam [plano executivo 0381](0381_plano_executivo_paridade_claude_code.md), [roadmap 0382](0382_roadmap_paridade_claude_code.md) e [backlog complementar 0383](0383_backlog_paridade_claude_code.md). São 134 requisitos iniciais propostos (117 comparáveis e 17 controles CVG adicionais obrigatórios) e 37 cartões C100 de delta/qualificação. O catálogo Claude está separado dos 266 PAR-CAP DeepSeek; nenhum percentual, status, prioridade ou aceite dos PAR é alterado por essa documentação.

Este 0380 permanece a fonte do estado e da execução dos PAR reaproveitados; o 0383 possui apenas o estado dos C100 e o encaminhamento dos aceites Claude. Uma implementação comum tem um único dono, claim e tarefa; serve aos dois catálogos somente depois de qualificada em cada um. Carriers opcionais não se tornam pré-requisitos por mera associação. A extensão não substitui 0379/0380, não concede BUILD T3/T4 e não altera a trilha de produção 0374.

## Como ler

Cada cartão vem de capacidades observadas na referência e comparadas com o CVG (análise G1–G5). A coluna "Origem" cita o grupo e o ID da capacidade, por exemplo `G2/FS-04`. A coluna "Absorve" aponta o cartão do [backlog 0378](0378_backlog_paridade_integral.md) ou a SPEC que já cobre parte do trabalho, para não duplicar status.

| Campo      | Valores                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tamanho    | P até 3 dias; M até 2 semanas; G até 6 semanas; GG mais de 6 semanas. Para totais: P = 3, M = 8, G = 22, GG = 45 dias de engenharia, incluindo SPEC curta, revisão e gates.         |
| Prioridade | P0 bloqueia outras frentes ou fecha risco de segurança; P1 alta relevância hospitalar; P2 média; P3 baixa ou nenhuma (cauda integral).                                              |
| Trilha     | T1 a T4 da constituição. T3 exige revisão da SPEC pelo usuário; T4 exige gate hash-bound e decisão humana.                                                                          |
| Estado     | `TODO`, `READY`, `IN_PROGRESS`, `VERIFY`, `DONE_LOCAL`, `DONE`, `BLOCKED`, `DEFERRED`, como no 0378. `IN_PROGRESS` aqui significa trabalho já em curso sob o cartão P100 absorvido. |

Regras da carteira:

1. O denominador de 100% é o catálogo PAR-CAP v1 congelado pelo PAR-Q01 (decisão D1 do roadmap). Cartão concluído não é capacidade aprovada: só conta o `PASS_CURRENT` do medidor PAR-Q05.
2. Toda capacidade nova passa pelo kernel com os controles obrigatórios da ADR-011. Uma capacidade que só existe fora do pipeline não conta como paridade.
3. Divergência deliberada só sai do denominador por decisão registrada (D2/D4 do roadmap), com nova versão da medida. Nada é excluído em silêncio.
4. Um writer por arquivo compartilhado (schema, lockfile, contratos públicos, ledgers). Cartões paralelos têm caminhos disjuntos e claim próprio.
5. Uma revisão independente por cartão e no máximo dois retrabalhos (proposta D3). Se a revisão rejeitar duas vezes, o cartão volta para replanejamento, sem novo ciclo de crítica.

## Resumo

| Fase                               | Cartões | Esforço (dias, faixa) | P0     | P1     | P2     | P3     |
| ---------------------------------- | ------- | --------------------- | ------ | ------ | ------ | ------ |
| F0 — Medida, base e processo       | 6       | 38 (24–46)            | 4      | 2      | 0      | 0      |
| F1 — Kernel único e contenção      | 13      | 174 (115–230)         | 7      | 4      | 2      | 0      |
| F2 — Modelo, sessão e contexto     | 16      | 141 (91–179)          | 2      | 7      | 7      | 0      |
| F3 — Ferramentas, eventos e SDK    | 18      | 181 (117–233)         | 1      | 9      | 8      | 0      |
| F4 — Orquestração                  | 11      | 186 (125–250)         | 0      | 4      | 7      | 0      |
| F5 — Console, operação e interação | 15      | 204 (135–270)         | 0      | 8      | 7      | 0      |
| F6 — Cauda integral                | 28      | 469 (313–622)         | 0      | 0      | 0      | 28     |
| F7 — Prova e aceite                | 4       | 46 (30–60)            | 3      | 1      | 0      | 0      |
| **Total**                          | **111** | **1.439 (950–1.890)** | **17** | **35** | **31** | **28** |

## Gates T3 decididos em 16/10/2026

Registro com SHA-256 e condições: [spec-gates.json](../04_audit/evidence/USER-DECISIONS-20261016/spec-gates.json). A revisão que aplicar só os ajustes listados segue com uma revisão técnica independente, sem novo gate humano; ampliação de escopo exige novo gate.

| SPEC | Cartão       | Decisão                                                                                                           |
| ---- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| 0220 | PAR-K01      | Adiada: pacote desatualizado (28 de 465 pins divergentes); refazer como qualificação corrente (0227)              |
| 0221 | PAR-S01      | Aprovada com ajustes: primeira fatia de ownership e API básica, provas do aceite do cartão, migration 0031        |
| 0222 | PAR-K04      | Aprovada com ajustes: primeira fatia de gerações, lease, troca e quiescência; cenários do aceite do cartão        |
| 0225 | PAR-K03      | Aprovada com ajustes: corte exclusivo aceito, teto menor ou medido, sem J14/J15 no primeiro BUILD, migration 0030 |
| 0226 | PAR-K01, K03 | Adiada: reapresentar reduzida depois da 0225 implementada                                                         |

Ordem das migrations: 0029 (composição 0217) primeiro, no PAR-G01; depois 0030 (SPEC0225) e 0031 (SPEC0221).

## Correspondência com o backlog 0378

Os cartões P100 continuam com seu histórico no 0378. Depois do PAR-G01, o status passa a ser mantido aqui.

| Cartão 0378           | Situação em 16/10/2026                | Cartões PAR                                                                                           |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P100-001, P100-002    | `DONE_LOCAL`                          | Base já entregue; nenhum cartão novo                                                                  |
| P100-003              | `IN_PROGRESS`                         | PAR-Q01                                                                                               |
| P100-004              | `IN_PROGRESS`                         | PAR-Q02, PAR-Q03, PAR-Q04, PAR-A09                                                                    |
| P100-010, P100-011    | `IN_PROGRESS`, `TODO`                 | PAR-K01, PAR-K02                                                                                      |
| P100-012              | `IN_PROGRESS` (SPEC0222 pendente)     | PAR-K04 a PAR-K10, PAR-H04                                                                            |
| P100-014, P100-015    | `TODO` (SPEC0221 preparada)           | PAR-M01 a PAR-M05, PAR-S01, PAR-D01, PAR-D02                                                          |
| P100-020, P100-021    | `TODO`                                | PAR-K03, PAR-S01 a PAR-S07, PAR-C01 a PAR-C06                                                         |
| P100-022 a P100-024   | `TODO`                                | PAR-T01 a PAR-T15, PAR-X01 a PAR-X04                                                                  |
| P100-025, P100-026    | `IN_PROGRESS`, `TODO`                 | PAR-A05 a PAR-A09, PAR-P03 a PAR-P05                                                                  |
| P100-030 a P100-032   | `TODO`                                | PAR-P01, PAR-T12, PAR-T13, PAR-P02                                                                    |
| P100-033 a P100-038   | `TODO`                                | PAR-O01 a PAR-O13, PAR-T10, PAR-A04                                                                   |
| P100-040 a P100-046   | `TODO`                                | PAR-A01 a PAR-A04, PAR-H01 a PAR-H04, PAR-U01 a PAR-U09, PAR-I01 a PAR-I09, PAR-E01, PAR-E02, PAR-T11 |
| P100-050 a P100-053   | `TODO`                                | PAR-Q05 a PAR-Q10                                                                                     |
| PDSH-003b             | `TODO` na carteira 0375               | PAR-K01                                                                                               |
| PDSH-031 a PDSH-033   | `IN_PROGRESS`/`TODO` na carteira 0375 | PAR-Q03, PAR-Q06                                                                                      |
| AUD0611-G01, G02, G03 | backlog mestre                        | PAR-A05 (G01), PAR-X02 (G02), PAR-Q06 (G03)                                                           |
| PDSH-026              | consumo no produto                    | Fica na carteira do Assistente de Plantão (ADR-010); não entra aqui                                   |

## F0 — Medida, base e processo

6 cartões, cerca de 38 dias de engenharia (faixa 24–46).

| Cartão  | Título                                                    | Tam. | Prio. | Estado        | Depende de       |
| ------- | --------------------------------------------------------- | ---- | ----- | ------------- | ---------------- |
| PAR-G01 | Consolidar o trabalho PARE100 em andamento                | P    | P0    | `DONE`        | —                |
| PAR-Q01 | Congelar o catálogo de capacidades PAR-CAP v1             | M    | P0    | `IN_PROGRESS` | PAR-G01          |
| PAR-Q02 | Comparador diferencial keyless operando                   | M    | P0    | `IN_PROGRESS` | PAR-Q01, PAR-Q03 |
| PAR-Q03 | Kit neutro de test-support                                | M    | P1    | `DONE`        | —                |
| PAR-Q04 | Servidor de falhas de modelo e replay de stream sintético | M    | P1    | `DONE`        | PAR-Q03          |
| PAR-Q05 | Medidor de paridade publicado                             | P    | P0    | `TODO`        | PAR-Q01          |

### PAR-G01 — Consolidar o trabalho PARE100 em andamento

- Fase F0 · prioridade P0 · tamanho P · trilha T1 · relevância hospitalar alta · estado `DONE` (18/10/2026, CONT-20261018-D9EF).
- Fechamento: os três critérios de aceite estão cumpridos. O trabalho da worktree foi commitado pelo usuário em `a72422be` (16/10), com cópia em `refs/backup/pare100-spec0217-r5-snapshot`; nada aceito depende de `/tmp`, que foi apagado no reinício de 18/10. Os cinco gates têm decisão registrada em [spec-gates.json](../04_audit/evidence/USER-DECISIONS-20261016/spec-gates.json) e a correspondência P100→PAR está publicada abaixo. A migration 0029 ainda não está no checkout principal: ela segue para a raiz pela fundação do Claude100 (C100-FND, candidatas sobre `a72422be`), na ordem 0029 → 0030 → 0031.
- Origem: Estado do programa em 16/10/2026. Absorve: P100-001..004, 010, 012, 025; SPECs 0217–0226.
- Hoje: 182 caminhos alterados sem commit na worktree `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree` (o `/tmp` é limpo no boot); cinco gates T3 pendentes (0220, 0221, 0222, 0225, 0226); 2 de 36 cartões P100 concluídos localmente.
- Entrega: Commit em branch própria do trabalho da worktree, pelo dono (Codex); decisão do usuário sobre os cinco gates num único pacote; cartões P100 em andamento remapeados para os IDs PAR desta carteira.
- Depende de: nenhuma.
- Aceite: Nenhum código aceito existe só em `/tmp`; cada gate pendente tem decisão registrada; a tabela de correspondência P100→PAR está publicada.

### PAR-Q01 — Congelar o catálogo de capacidades PAR-CAP v1

- Fase F0 · prioridade P0 · tamanho M · trilha T1 · relevância hospitalar alta · estado `IN_PROGRESS`.
- Origem: 266 capacidades da análise PARE100-GAP (G1–G5). Absorve: P100-003.
- Hoje: Matriz de 44.132 folhas estáticas (30.586 STATIC, 13.546 UNKNOWN), sem nenhum PASS funcional; levantamento por capacidade feito em 16/10 por leitura.
- Entrega: Revisar as 266 capacidades com fonte (caminho e commit da referência), relevância, classe (EQUIVALENTE, EQUIVALENTE_GOVERNADA ou DIVERGENTE_DECIDIDA) e procedimento de aceite. As folhas estáticas ficam como rastreabilidade, ligadas a uma capacidade.
- Depende de: PAR-G01.
- Aceite: Nenhuma capacidade sem procedimento e cartão; denominador publicado com hash; qualquer mudança de escopo exige decisão registrada e nova versão da medida.

### PAR-Q02 — Comparador diferencial keyless operando

- Fase F0 · prioridade P0 · tamanho M · trilha T2 · relevância hospitalar alta · estado `IN_PROGRESS`.
- Origem: G4/TST-03; regra 6 do plano 0376. Absorve: P100-004, PDSH-032.
- Hoje: Fixtures F-DIF-TOOL e F-DIF-ERR aceitas no escopo de test-support; o comparador integral ainda não roda.
- Entrega: Executar referência e CVG em home sintética com providers keyless; comparar transcript, efeitos e estado com normalizações declaradas.
- Depende de: PAR-Q01, PAR-Q03.
- Aceite: Caso conhecido-bom passa; fixtures com efeito extra, evento perdido e resultado indevido falham; nada lê `~/.dsh` ou dado real.

### PAR-Q03 — Kit neutro de test-support

- Fase F0 · prioridade P1 · tamanho M · trilha T2 · relevância hospitalar média · estado `DONE`.
- Origem: G4/TST-03, TST-04, TST-05. Absorve: P100-004.
- Hoje: Replay de fixtures do núcleo (`scripts/snapshot-replay.mjs`) e orquestradores roteirizados dentro dos testes; nenhum kit publicado.
- Entrega: Extrair normalizador de log de sessão, manifesto de suíte e kit do runtime governado num pacote de teste neutro.
- Depende de: nenhuma.
- Aceite: Três famílias diferentes usam o kit sem copiar helpers; o normalizador só aceita as normalizações declaradas.
- Execução atual: unidadeT2 `PAR-Q03-KIT-001`, [SPEC0230](../02_spec/0230_private_governed_test_kit.md), candidata própriaClaude100 baseada7ecc5b53; kit privado e três consumidores de teste, sem contrato público/runtime/lockfile. [Insumos](../04_audit/evidence/CLAUDE100-EXEC-20261017/q03/candidate-inputs.json). Unidade qualificada localmente: TK01–TK08,16/16gates e38hashes verificados em [cert-r2](../04_audit/evidence/CLAUDE100-EXEC-20261017/q03/cert-r2/manifest.json); três consumidores reais preservados. Integração canônica dos oito paths em55fontespromovidas da candidata26d866c3, byteexatas, com702/702focaisroot; PAR-Q03encerrado pelos aceites do kit. Não reabre a unidade224rejeitada nem concede aceite funcional/deprodução. [Prova](../04_audit/evidence/CLAUDE100-EXEC-20261017/integration-result.json).

### PAR-Q04 — Servidor de falhas de modelo e replay de stream sintético

- Fase F0 · prioridade P1 · tamanho M · trilha T2 · relevância hospitalar média · estado `DONE`.
- Origem: G4/TST-01, TST-02. Absorve: P100-004.
- Hoje: Falhas roteirizadas em `packages/chaos` e testes do gateway; sem servidor HTTP compatível nem gravação de stream.
- Entrega: Servidor HTTP de falhas no formato do gateway (429, timeout, corte de stream, JSON inválido) e gravação/replay de stream com `record`/`refresh` só sobre dados sintéticos.
- Depende de: PAR-Q03.
- Aceite: Cada falha roteirizada produz o erro normalizado esperado; o modo `record` recusa execução com credencial real.

- Unidade localT2 `PAR-Q04-FAULTS-001`, [SPEC0232](../02_spec/0232_private_model_fault_server.md), candidata integrada26d866c3/kitQ03qualificado. MF01–MF07PASS,614/614testesindependentes/zero skip,16gates e38hashesoficiaisatuais;unit4665/PG302/E2E12PASS. Novefontespromovidasbyteexatas comQ03/0229 e702/702focaisroot; PAR-Q04encerrado noescoposintético. Contratos públicos/gatewayruntime/224preservados; não qualifica streaming real,referência,M1 ouprodução. [Resultado](../04_audit/evidence/CLAUDE100-EXEC-20261017/q04/REPORT.md). [Contrato congelado](../04_audit/evidence/CLAUDE100-EXEC-20261017/q04/build-contract.json).

### PAR-Q05 — Medidor de paridade publicado

- Fase F0 · prioridade P0 · tamanho P · trilha T1 · relevância hospitalar alta · estado `TODO`.
- Origem: Regras 3 a 5 do plano 0376. Absorve: P100-050.
- Hoje: Paridade integral `NOT_MEASURED`.
- Entrega: Script que lê o catálogo e os resultados atuais e publica PASS_CURRENT/total por família e no geral, como relatório (ainda não como gate).
- Depende de: PAR-Q01.
- Aceite: O relatório só conta PASS_CURRENT; PARTIAL, NOT_RUN, BLOCKED e exceção pendente contam como não aprovado; o número sai do mesmo commit dos resultados.

## F1 — Kernel único e contenção

13 cartões, cerca de 174 dias de engenharia (faixa 115–230).

| Cartão  | Título                                                     | Tam. | Prio. | Estado        | Depende de |
| ------- | ---------------------------------------------------------- | ---- | ----- | ------------- | ---------- |
| PAR-K01 | Um só pipeline para API, worker e execução publicada       | G    | P0    | `IN_PROGRESS` | PAR-G01    |
| PAR-K02 | Retirar as bibliotecas legadas ativas                      | M    | P0    | `TODO`        | PAR-K01    |
| PAR-K03 | Checkpoint durável antes do modelo e do efeito             | G    | P0    | `IN_PROGRESS` | PAR-K01    |
| PAR-K04 | Lifecycle de capabilities com quiescência                  | G    | P0    | `IN_PROGRESS` | PAR-K01    |
| PAR-K05 | Perfis e presets declarativos validados                    | G    | P1    | `TODO`        | PAR-K04    |
| PAR-K06 | Agente vivo: steering, cancelamento e espera de ociosidade | M    | P1    | `TODO`        | PAR-K01    |
| PAR-K07 | Ferramentas paralelas com limite                           | M    | P2    | `TODO`        | PAR-K03    |
| PAR-K08 | Guardas de repetição e timeout cooperativo                 | M    | P1    | `TODO`        | PAR-K01    |
| PAR-K09 | Hooks configuráveis sob controle                           | M    | P2    | `TODO`        | PAR-K04    |
| PAR-X01 | Serviço único de subprocesso e ambiente do filho           | M    | P0    | `TODO`        | PAR-G01    |
| PAR-X02 | Landlock real e relatório honesto de contenção             | G    | P0    | `TODO`        | PAR-X01    |
| PAR-X03 | Testes nativos de contenção e limites de recurso           | M    | P0    | `TODO`        | PAR-X02    |
| PAR-X04 | Enforcement por efeito e política de sandbox por sessão    | M    | P1    | `TODO`        | PAR-X02    |

### PAR-K01 — Um só pipeline para API, worker e execução publicada

- Fase F1 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `IN_PROGRESS`.
- Origem: G1/CORE-03; AUD0611 lacuna 1. Absorve: P100-010, PDSH-003b.
- Hoje: `CONTROLLED_RUNTIME` da plataforma ainda executa fora do kernel; fatia sintética 0214 aprovada; SPEC0217 aprovada; SPEC0220 pendente.
- Entrega: API, worker e execução publicada passam pelo kernel durável, com adaptador compatível para os contratos atuais.
- Depende de: PAR-G01.
- Aceite: Conformidade I1–I12 verde nos três modos; teste de arquitetura prova que não sobra caminho de execução fora do kernel; restart retoma a execução.

### PAR-K02 — Retirar as bibliotecas legadas ativas

- Fase F1 · prioridade P0 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: Plano 0376, frente de legado. Absorve: P100-011.
- Hoje: `legacy/packages/secretary-*` ainda têm consumidores.
- Entrega: Retirar exports, rotas, workspaces e lock do legado depois da migração; preservar dados, migrations e evidências.
- Depende de: PAR-K01.
- Aceite: Host compila, testa e empacota sem `legacy/`; nenhum import residual.

### PAR-K03 — Checkpoint durável antes do modelo e do efeito

- Fase F1 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `IN_PROGRESS`.
- Origem: G1/SESSION-02, G1/LLM-03. Absorve: P100-020 (parte); SPEC0224 aprovada; SPEC0225 pendente.
- Hoje: Journal de efeitos e step-store existem; rota RESPONSE com contexto completo aceita só em memória (R19, AUD 0616); retry não é registrado antes do backoff.
- Entrega: Checkpoint antes da requisição ao modelo, antes de efeito externo e antes do próximo passo; tentativa de retry gravada antes do backoff; retomada pública em PostgreSQL.
- Depende de: PAR-K01.
- Aceite: Crash entre modelo e ferramenta, e entre ferramenta e resultado, não repete efeito em PostgreSQL real; a tentativa de retry aparece no log antes da espera.
- AUD0625 (29/10/2026): fase 1 da SPEC 0225 entregue localmente (journal completo, migration 0033, v1 opt-in desligada; ver `AUD0625-PAR-K03-D9-20261029/RESULT.md`). Estado segue PARTIAL. **PAR-K03b** (cartão a criar, dono a definir): integrar o BUILD 0224 completo no estado atual (checkpoint V2, reconciliar com F18 no `iterative-runtime`) e fechar J09–J11; exige nova decisão humana (o recibo 17 cobre só `complete-json.ts`). J13 depende de 0217/K01.

### PAR-K04 — Lifecycle de capabilities com quiescência

- Fase F1 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `IN_PROGRESS`.
- Origem: G1/CORE; G4/HOST-07. Absorve: P100-012; SPEC0222 pendente.
- Hoje: Boot selado, ordem, rollback e dispose existem; não há gerações, recarga nem quiescência.
- Entrega: Gerações de capability, admissão, retirada, recarga e unload com quiescência; controles imutáveis.
- Depende de: PAR-K01.
- Aceite: Recarga com turno em curso não perde nem duplica efeito; unload ou reordenação de controle é negado e auditado.

### PAR-K05 — Perfis e presets declarativos validados

- Fase F1 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/BUNDLE-01, PRESET-01..03; G4/HOST-02, SDK-06. Absorve: P100-012, P100-040.
- Hoje: Composições existem em código (`createSdk`, `createSdkMinimal`, workers homolog/controlado/contínuo); sem perfil nomeado, herança ou persona por sessão.
- Entrega: Perfis nomeados com herança (base, headless, sdk, produção), presets de ferramentas, prompt e skills por sessão, persona composável.
- Depende de: PAR-K04.
- Aceite: Perfil ou preset sem controle obrigatório é recusado no boot; troca de preset não altera sessão já criada; persona não remove bloqueios.

### PAR-K06 — Agente vivo: steering, cancelamento e espera de ociosidade

- Fase F1 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/CORE-01, CORE-02; G4/API-04. Absorve: P100-012.
- Hoje: Execução inicia e retoma com checkpoint; não há registro de agentes vivos nem follow-up durante o turno.
- Entrega: Registro de agentes vivos com iniciador, follow-up/steering, cancelamento e espera de ociosidade.
- Depende de: PAR-K01.
- Aceite: Steering entra no passo seguinte; cancelamento não executa efeito pendente de aprovação; agente de outro tenant não é visível.

### PAR-K07 — Ferramentas paralelas com limite

- Fase F1 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/CORE-04. Absorve: P100-012.
- Hoje: Ferramentas executam em série.
- Entrega: Concorrência limitada para ferramentas marcadas como seguras; ferramentas exclusivas sozinhas e em ordem de chegada.
- Depende de: PAR-K03.
- Aceite: N ferramentas seguras rodam em paralelo; a exclusiva roda sozinha; o journal registra a ordem real.

### PAR-K08 — Guardas de repetição e timeout cooperativo

- Fase F1 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/GUARD-01..03. Absorve: P100-012.
- Hoje: `detectDecisionCycle` detecta ciclo de decisões; timeouts espalhados por pacote, sem política única.
- Entrega: Lembrete consultivo para ferramenta repetida com os mesmos argumentos; timeout cooperativo uniforme por ferramenta.
- Depende de: PAR-K01.
- Aceite: A quarta chamada idêntica gera lembrete sem bloquear; ferramenta que excede o limite deixa o efeito como incerto, nunca como concluído.

### PAR-K09 — Hooks configuráveis sob controle

- Fase F1 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/HOOKS-01. Absorve: P100-012.
- Hoje: Pontos de interceptação existem no kernel, mas não são configuráveis por arquivo.
- Entrega: Protocolo de hooks com eventos, matcher e merge; hooks só negam ou anexam contexto; comando externo só por allowlist e aprovação.
- Depende de: PAR-K04.
- Aceite: Hook nunca altera decisão de controle obrigatório; erro de hook falha fechado; toda negação de hook fica no log.

### PAR-X01 — Serviço único de subprocesso e ambiente do filho

- Fase F1 · prioridade P0 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/SUB-01..04 (subprocess), G2/SH-06. Absorve: P100-023.
- Hoje: `runContained` executa bwrap com timeout e limite de saída; não há serviço único, kill de descendentes comprovado nem allowlist de ambiente.
- Entrega: Serviço de spawn, grupo, kill, wait e dispose usado por shell, MCP stdio, LSP e conversão de documentos; ambiente do filho por allowlist.
- Depende de: PAR-G01.
- Aceite: Depois de cancel, timeout ou dispose nenhum processo da árvore sobra (verificado em `/proc`); o filho não vê variáveis do host.

### PAR-X02 — Landlock real e relatório honesto de contenção

- Fase F1 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/SBX-03, SBX-07. Absorve: P100-024, AUD0611-G02.
- Hoje: `landlock` é inferido de `os.release() >= 5.13`; nenhum ruleset é aplicado; `requireLandlock` não prova nada.
- Entrega: Probe de ABI por syscall e ruleset aplicado no processo filho (helper nativo pequeno); o campo deixa de afirmar suporte só pela versão.
- Depende de: PAR-X01.
- Aceite: Sem ruleset aplicado, `requireLandlock` falha fechado; teste nativo mostra escrita fora do workspace negada pelo Landlock.

### PAR-X03 — Testes nativos de contenção e limites de recurso

- Fase F1 · prioridade P0 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/SBX lacunas 3 e 4. Absorve: P100-024.
- Hoje: Bubblewrap e allowlist reais, sem prova adversarial nem limites de CPU, memória, pids e disco.
- Entrega: no-new-privs, seccomp e limites (rlimits ou cgroups); suíte nativa de fuga.
- Depende de: PAR-X02.
- Aceite: Escrita fora, leitura de `/etc/shadow` e `~/.ssh`, rede, symlink e hardlink de fuga e fork bomb são negados em teste nativo.

### PAR-X04 — Enforcement por efeito e política de sandbox por sessão

- Fase F1 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/SBX-01, SBX-02, SBX-06. Absorve: P100-024.
- Hoje: Modos por ferramenta com `denyModes` e journal; sem fato de enforcement por efeito nem política por sessão persistida.
- Entrega: Modos read-only e workspace-write por sessão ou tenant, persistidos; enforcement de arquivo, rede e processo reportado como fato.
- Depende de: PAR-X02.
- Aceite: Contenção parcial ou indisponível é recusável pelo chamador; a política da sessão sobrevive a restart.

## F2 — Modelo, sessão e contexto

16 cartões, cerca de 141 dias de engenharia (faixa 91–179).

| Cartão  | Título                                         | Tam. | Prio. | Estado | Depende de       |
| ------- | ---------------------------------------------- | ---- | ----- | ------ | ---------------- |
| PAR-M01 | Streaming no gateway com um resultado terminal | M    | P0    | `TODO` | PAR-K03          |
| PAR-M02 | Requisição congelada antes do adaptador        | P    | P2    | `TODO` | PAR-M01          |
| PAR-M03 | Entrada multimodal de imagem                   | M    | P1    | `TODO` | PAR-M01, PAR-T04 |
| PAR-M05 | Modelo padrão e seleção por sessão             | P    | P2    | `TODO` | PAR-K05          |
| PAR-S01 | Persistência pública de sessão entre processos | G    | P0    | `TODO` | PAR-K03          |
| PAR-S02 | Projeções de sessão com cache                  | M    | P1    | `TODO` | PAR-S01          |
| PAR-S03 | Estatísticas, esboço de turnos e título        | M    | P2    | `TODO` | PAR-S02          |
| PAR-S04 | Fork e retomada de sessão                      | M    | P1    | `TODO` | PAR-S01          |
| PAR-S05 | Consulta de sessões com rastreio               | M    | P1    | `TODO` | PAR-S01          |
| PAR-S06 | Busca textual nas sessões                      | G    | P2    | `TODO` | PAR-S05          |
| PAR-S07 | Formatos novos e export/import versionado      | M    | P2    | `TODO` | PAR-S02          |
| PAR-C01 | Compactação por modelo sob pressão             | M    | P1    | `TODO` | PAR-M01, PAR-K03 |
| PAR-C02 | Pressão de tokens antes do dispatch            | P    | P1    | `TODO` | PAR-M01          |
| PAR-C03 | Spill de saídas grandes e poda de resultados   | M    | P1    | `TODO` | PAR-S01          |
| PAR-C04 | Descarregamento de imagens antigas             | M    | P2    | `TODO` | PAR-C03, PAR-M03 |
| PAR-D01 | Storage de domínio tipado sobre PostgreSQL     | M    | P2    | `TODO` | PAR-S01          |

### PAR-M01 — Streaming no gateway com um resultado terminal

- Fase F2 · prioridade P0 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/LLM-01. Absorve: P100-014.
- Hoje: Providers fixam `stream: false` (`openai-compatible.ts`, `ollama.ts`).
- Entrega: Stream por provider com cancelamento, usage parcial e exatamente um resultado terminal.
- Depende de: PAR-K03.
- Aceite: Todo stream termina em sucesso, falha ou cancelamento; corte de conexão não grava resposta parcial como final.

### PAR-M02 — Requisição congelada antes do adaptador

- Fase F2 · prioridade P2 · tamanho P · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/LLM-02. Absorve: P100-014.
- Hoje: Gateway valida contratos, mas não congela a requisição montada.
- Entrega: Requisição imutável e reconstruível pelo log antes de chegar ao adaptador.
- Depende de: PAR-M01.
- Aceite: Adaptador que tenta reescrever a requisição falha em teste; a requisição é reconstruída byte a byte pelo log.

### PAR-M03 — Entrada multimodal de imagem

- Fase F2 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/FS-06; G4/SDK lacuna 4. Absorve: P100-014.
- Hoje: Gateway e SDK só aceitam texto.
- Entrega: Imagem como entrada do modelo, a partir de anexo verificado, no gateway e no SDK.
- Depende de: PAR-M01, PAR-T04.
- Aceite: Imagem sintética chega ao provider de teste com hash; MIME falso é recusado antes do modelo.

### PAR-M05 — Modelo padrão e seleção por sessão

- Fase F2 · prioridade P2 · tamanho P · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/CORE-05; G3/SUB-07. Absorve: P100-014.
- Hoje: Modelo vem da composição; sem troca em configuração viva.
- Entrega: Modelo padrão alterável em configuração viva e seleção entre opções aprovadas por sessão e por filho.
- Depende de: PAR-K05.
- Aceite: A troca não afeta execução já iniciada; modelo fora da lista aprovada é recusado.

### PAR-S01 — Persistência pública de sessão entre processos

- Fase F2 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/SESSION-01 (presente) e ownership entre processos. Absorve: P100-015, P100-020; SPEC0221 pendente.
- Hoje: Store append-only em PostgreSQL com RLS e catálogo v1 existe; ownership entre processos e transição com writers antigos não existem.
- Entrega: Mesmo log v1 com ownership entre processos, adoção explícita de metadata e recusa de writer antigo.
- Depende de: PAR-K03.
- Aceite: Dois processos escrevem e leem o mesmo log sem lacuna nem duplicata; writer antigo é recusado; outro tenant não lê nada.

### PAR-S02 — Projeções de sessão com cache

- Fase F2 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/SESSION-04. Absorve: P100-020.
- Hoje: Nenhuma projeção de estado atual.
- Entrega: Projeções reconstruídas do log (estado atual, pendências, metas, todos) com cache de checkpoint.
- Depende de: PAR-S01.
- Aceite: Projeção reconstruída do zero é igual à do cache; cada item cita o evento de origem.

### PAR-S03 — Estatísticas, esboço de turnos e título

- Fase F2 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/SESSION-05, SESSION-06. Absorve: P100-020.
- Hoje: Ausentes.
- Entrega: Estatísticas da sessão (turnos, passos, tempos de modelo e ferramenta), esboço de turnos e título.
- Depende de: PAR-S02.
- Aceite: Valores batem com o log em sessão sintética longa; título não usa dado de paciente quando a política proibir.

### PAR-S04 — Fork e retomada de sessão

- Fase F2 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: P100-020; G5/CL-02; G3/SUB-03. Absorve: P100-020.
- Hoje: Retomada existe por execução; fork não existe.
- Entrega: Fork semeado com turnos concluídos, sem herdar aprovações pendentes.
- Depende de: PAR-S01.
- Aceite: Fork mantém tenant e linhagem; aprovação pendente do original não vale no fork.

### PAR-S05 — Consulta de sessões com rastreio

- Fase F2 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/QUERY-01, QUERY-02. Absorve: P100-020.
- Hoje: Leitura de eventos por stream; sem filtro, cursor, listagem nem rastreio.
- Entrega: Listar, filtrar e ler com cursor; rastrear aprovação → efeito → evento.
- Depende de: PAR-S01.
- Aceite: Consulta de outro tenant volta vazia ou negada; o rastreio de uma aprovação mostra o efeito e o evento de origem.

### PAR-S06 — Busca textual nas sessões

- Fase F2 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/QUERY-03. Absorve: P100-020.
- Hoje: Ausente.
- Entrega: Busca ranqueada (PostgreSQL full-text) com política de acesso e retenção.
- Depende de: PAR-S05.
- Aceite: Busca respeita tenant e papel; conteúdo retido além do prazo não aparece.

### PAR-S07 — Formatos novos e export/import versionado

- Fase F2 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/SESSION-03 e lacuna 6. Absorve: P100-020.
- Hoje: Só o formato v1 é real; migrações v2/v3 são sintéticas.
- Entrega: Cadeia de migração adjacente e export/import JSONL interoperável; PostgreSQL continua fonte de verdade (ADR-011).
- Depende de: PAR-S02.
- Aceite: Exportar e importar reproduz as mesmas projeções; o original nunca é reescrito.

### PAR-C01 — Compactação por modelo sob pressão

- Fase F2 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/COMP-01. Absorve: P100-021.
- Hoje: Resumo heurístico de até 512 caracteres e estimativa de 4 caracteres por token.
- Entrega: Condensação com requisição de modelo sob pressão de tokens, nova tentativa após overflow, preservando fatos, obrigações e aprovações.
- Depende de: PAR-M01, PAR-K03.
- Aceite: Aprovação pendente e obrigação aberta sobrevivem à compactação (teste por fato); overflow não chega ao provider sem compactar antes; compactação cancelada não grava resumo.

### PAR-C02 — Pressão de tokens antes do dispatch

- Fase F2 · prioridade P1 · tamanho P · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/COMP lacuna 2; AUD0611 dimensão de modelo. Absorve: P100-021.
- Hoje: Medidor agrega usage de chamadas bem-sucedidas.
- Entrega: Pressão calculada antes de cada chamada, com usage por tentativa, inclusive falhas.
- Depende de: PAR-M01.
- Aceite: A projeção de pressão bate com o usage reconstruído do log.

### PAR-C03 — Spill de saídas grandes e poda de resultados

- Fase F2 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G1/SPILL-01, SPILL-02, COMP-03; G2/SH-04. Absorve: P100-021; SPEC0224.
- Hoje: Saídas truncadas em 1 MiB sem arquivo de continuação; spill só proposto na SPEC0224.
- Entrega: Armazenamento de texto grande com localizador opaco, prévia de cabeça e cauda e poda de resultado de ferramenta.
- Depende de: PAR-S01.
- Aceite: O modelo recebe localizador e prévia com aviso de corte; falha de gravação nunca descarta conteúdo em silêncio.

### PAR-C04 — Descarregamento de imagens antigas

- Fase F2 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/COMP-04. Absorve: P100-021.
- Hoje: Ausente.
- Entrega: Imagens antigas trocadas por texto com caminho de leitura, sem gastar retry do provider.
- Depende de: PAR-C03, PAR-M03.
- Aceite: Depois do offload a imagem continua recuperável pelo localizador; o contexto cai abaixo do limite.

### PAR-D01 — Storage de domínio tipado sobre PostgreSQL

- Fase F2 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G1/STOR-01. Absorve: P100-015.
- Hoje: Repositórios PostgreSQL específicos; sem API de domínio chave-valor tipada.
- Entrega: Domínios chave-valor com schema validado, herdando tenant e RLS.
- Depende de: PAR-S01.
- Aceite: Um tenant não lê domínio de outro; escrita só resolve depois de durável.

## F3 — Ferramentas, eventos e SDK

18 cartões, cerca de 181 dias de engenharia (faixa 117–233).

| Cartão  | Título                                                  | Tam. | Prio. | Estado        | Depende de       |
| ------- | ------------------------------------------------------- | ---- | ----- | ------------- | ---------------- |
| PAR-T01 | Arquivos: leitura antes de editar, faixas e replace_all | M    | P1    | `TODO`        | PAR-K03          |
| PAR-T02 | glob e grep contidos                                    | M    | P2    | `TODO`        | PAR-X01          |
| PAR-T04 | Anexos com verificação e retenção                       | M    | P1    | `TODO`        | PAR-S01          |
| PAR-T05 | Entregáveis com aprovação e resumo de mudanças          | M    | P1    | `TODO`        | PAR-T01          |
| PAR-T06 | Conversão de Office para PDF contida                    | G    | P2    | `TODO`        | PAR-X03          |
| PAR-T07 | Skills com origem, hash e catálogo                      | M    | P1    | `TODO`        | PAR-K05          |
| PAR-T09 | Registro de workspaces e sessões por tenant             | P    | P2    | `TODO`        | PAR-S05          |
| PAR-T11 | Perguntar ao humano com pausa e retomada                | M    | P1    | `TODO`        | PAR-K03          |
| PAR-T12 | Web fetch e search com proteção SSRF                    | M    | P2    | `TODO`        | PAR-X01          |
| PAR-A01 | Stream de eventos na API com cursor                     | G    | P0    | `TODO`        | PAR-S01, PAR-M01 |
| PAR-A02 | Controle ao vivo de turno e sessão pela API             | M    | P1    | `TODO`        | PAR-K06, PAR-A01 |
| PAR-A03 | Contrato de API gerado e cliente tipado                 | M    | P2    | `TODO`        | PAR-A01          |
| PAR-A05 | Notificações push no SDK                                | M    | P1    | `TODO`        | PAR-A01          |
| PAR-A06 | Cliente de alto nível e prompt multimodal no SDK        | M    | P2    | `TODO`        | PAR-A05, PAR-M03 |
| PAR-A07 | Pedidos do servidor ao cliente no SDK                   | M    | P2    | `TODO`        | PAR-T11, PAR-A05 |
| PAR-A08 | SDK Python completo e pacote verificável                | M    | P2    | `IN_PROGRESS` | PAR-A06          |
| PAR-A09 | Suíte de cenários equivalentes do SDK                   | M    | P1    | `TODO`        | PAR-A05, PAR-Q02 |
| PAR-P01 | MCP governado (stdio e HTTP)                            | G    | P1    | `TODO`        | PAR-X02, PAR-T12 |

### PAR-T01 — Arquivos: leitura antes de editar, faixas e replace_all

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/FS-04, FS-05. Absorve: P100-022.
- Hoje: `fs.read/write/edit/list` com confinamento e escrita atômica; sem prova de leitura prévia, faixa de linhas ou `replace_all`.
- Entrega: Política read-before-edit com guarda de versão; leitura por faixa com truncamento informado; `replace_all`.
- Depende de: PAR-K03.
- Aceite: Edição de arquivo não lido ou alterado depois da leitura é negada e registrada.

### PAR-T02 — glob e grep contidos

- Fase F3 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/FS-07. Absorve: P100-022.
- Hoje: Ausentes.
- Entrega: Busca por padrão e conteúdo dentro do workspace, com limites de tempo e de resultado.
- Depende de: PAR-X01.
- Aceite: Caminho fora do workspace e symlink de fuga são recusados; regex patológica termina pelo limite.

### PAR-T04 — Anexos com verificação e retenção

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/ATT-01..03; G5/WEB-03. Absorve: P100-022.
- Hoje: Mídia de exame só no egress do canal; não existe anexo ligado ao modelo.
- Entrega: Anexo por tenant e sessão com hash, MIME verificado, tamanho, retenção e reenvio ao modelo; upload com limites.
- Depende de: PAR-S01.
- Aceite: Anexo com MIME falso é recusado; a política de retenção apaga o anexo; o replay reconstrói a referência.

### PAR-T05 — Entregáveis com aprovação e resumo de mudanças

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/DLV-01..03. Absorve: P100-022.
- Hoje: `fs.write` grava intenção e journal; sem evento de entrega nem resumo por turno.
- Entrega: Ferramenta de apresentação de arquivos finais com aprovação para entrega externa; resumo de mudanças por turno a partir do journal.
- Depende de: PAR-T01.
- Aceite: Nenhum arquivo sai do workspace sem evento de entrega aprovado; o resumo lista só caminhos registrados.

### PAR-T06 — Conversão de Office para PDF contida

- Fase F3 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/DOC-01..03. Absorve: P100-022.
- Hoje: Ausente.
- Entrega: Conversão em processo contido, sem rede, com fila limitada, cache e timeout.
- Depende de: PAR-X03.
- Aceite: Documento hostil (zip bomb, macro) é recusado ou convertido sem efeito fora do workspace; cancelar não deixa processo.

### PAR-T07 — Skills com origem, hash e catálogo

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G2/SKL-01..03. Absorve: P100-022.
- Hoje: Registry e loader de skills com `requiredTools`; uma skill (`exam-intake`).
- Entrega: Descoberta por origem com precedência, hash aprovado, observação de mudanças e ferramenta de catálogo para o modelo.
- Depende de: PAR-K05.
- Aceite: Skill que exige ferramenta fora do grant falha ao carregar; skill sem hash aprovado não entra no catálogo.

### PAR-T09 — Registro de workspaces e sessões por tenant

- Fase F3 · prioridade P2 · tamanho P · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/WS-01, WS-02. Absorve: P100-022.
- Hoje: Workspace por tenant resolvido por caminho; sem registro de projetos.
- Entrega: Projetos nomeados (unidade, turno) com sessões agrupadas; esconder sem apagar.
- Depende de: PAR-S05.
- Aceite: Esconder não apaga evidência; listagem só do tenant.

### PAR-T11 — Perguntar ao humano com pausa e retomada

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G5/INT-03. Absorve: P100-041.
- Hoje: Decisão `ASK_USER` existe no contrato v2; sem ferramenta nem fluxo de resposta.
- Entrega: Ferramenta `ask_user` com schema validado, pausa do turno e resposta única pelo console ou canal.
- Depende de: PAR-K03.
- Aceite: Segunda resposta é rejeitada; sem respondedor, a ação sensível fica negada; o turno retoma depois da resposta.

### PAR-T12 — Web fetch e search com proteção SSRF

- Fase F3 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/WEB-01, 02, 04, 05, 06. Absorve: P100-031.
- Hoje: Guarda SSRF com DNS fixado só no egress de exames.
- Entrega: Serviço web com fetch e search, provider explícito, guarda SSRF reaproveitada e marca de conteúdo não institucional.
- Depende de: PAR-X01.
- Aceite: Rebind, redirect para IP privado, resposta acima do limite e host fora da allowlist falham fechado; resultado marcado como não institucional.

### PAR-A01 — Stream de eventos na API com cursor

- Fase F3 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G4/API-02, API-03; G5/WEB-01. Absorve: P100-040, P100-041.
- Hoje: API só tem request/response e leitura paginada por `afterSequence`; nenhum SSE ou WebSocket.
- Entrega: Canal de eventos por sessão (SSE ou WebSocket) com cursor de retomada, cancelamento, backpressure e RLS.
- Depende de: PAR-S01, PAR-M01.
- Aceite: Dois tenants assinando ao mesmo tempo não veem eventos um do outro; queda e reconexão não perdem nem duplicam evento.

### PAR-A02 — Controle ao vivo de turno e sessão pela API

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G4/API-04. Absorve: P100-040.
- Hoje: Comandos de execução, entrada e takeover existem; sem pausa, retomada ou troca de modo por turno.
- Entrega: Pausar, retomar, cancelar e trocar modo ou modelo de um turno sem baixar controles.
- Depende de: PAR-K06, PAR-A01.
- Aceite: Operador sem papel recebe 403; pausa preserva pendências e a retomada drena sem duplicar.

### PAR-A03 — Contrato de API gerado e cliente tipado

- Fase F3 · prioridade P2 · tamanho M · trilha T2 · relevância hospitalar média · estado `TODO`.
- Origem: G4/API-01. Absorve: P100-040.
- Hoje: Rotas Fastify com validação por rota; sem descritor gerado.
- Entrega: Descritores gerados a partir das rotas e cliente tipado derivado.
- Depende de: PAR-A01.
- Aceite: Mudança de rota sem regenerar o contrato quebra o CI.

### PAR-A05 — Notificações push no SDK

- Fase F3 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G4/SDK-01. Absorve: P100-025.
- Hoje: SDK v1 com quatro métodos e polling de `session.events`.
- Entrega: Notificações `session.event`, `session.status` e término de filho, com assinatura por sessão e backpressure.
- Depende de: PAR-A01.
- Aceite: Perda ou duplicação de notificação é detectada pelo cursor; versão incompatível é recusada.

### PAR-A06 — Cliente de alto nível e prompt multimodal no SDK

- Fase F3 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G4/SDK-02, SDK-04. Absorve: P100-025.
- Hoje: Clientes TS e Python de baixo nível.
- Entrega: Operação `run` (envia, espera ociosidade, devolve última resposta e motivo de parada) em TS e Python, com imagem.
- Depende de: PAR-A05, PAR-M03.
- Aceite: TS e Python produzem o mesmo transcript para o mesmo cenário.

### PAR-A07 — Pedidos do servidor ao cliente no SDK

- Fase F3 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G4/SDK-05. Absorve: P100-025.
- Hoje: Aprovação só por `/v1/approvals`.
- Entrega: Pedidos iniciados pelo servidor (aprovação, entrada) respondidos pelo cliente, ligados ao operador autenticado.
- Depende de: PAR-T11, PAR-A05.
- Aceite: Resposta de cliente sem identidade válida é negada; aprovação vale uma única vez.

### PAR-A08 — SDK Python completo e pacote verificável

- Fase F3 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `IN_PROGRESS`.
- Origem: G4/SDK-04, SDK-07, DST-03. Absorve: P100-025.
- Hoje: Cliente stdlib experimental (CPython 3.12.3, Linux), quatro RPCs, distribuído por cópia de fonte.
- Entrega: Paridade de superfície com o cliente TS e wheel verificável com matriz de versões.
- Depende de: PAR-A06.
- Aceite: Wheel instala num ambiente limpo e passa a suíte de cenários; hash publicado com a candidata.

### PAR-A09 — Suíte de cenários equivalentes do SDK

- Fase F3 · prioridade P1 · tamanho M · trilha T2 · relevância hospitalar média · estado `TODO`.
- Origem: G4/SDK-08. Absorve: P100-025, P100-004.
- Hoje: Interop TS↔Python testada; sem cenários equivalentes aos da referência.
- Entrega: Cenários multi-turn, ferramenta com aprovação, cancelamento, EOF e shutdown comparados com a referência.
- Depende de: PAR-A05, PAR-Q02.
- Aceite: Cada cenário passa pelo comparador diferencial nos dois motores.

### PAR-P01 — MCP governado (stdio e HTTP)

- Fase F3 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/MCP-01..06. Absorve: P100-030.
- Hoje: Só o tipo de origem `mcp` no registry de capabilities; nenhum cliente.
- Entrega: Cliente MCP como adaptador de capabilities: allowlist de servidores por tenant, credencial por servidor, classificação de efeito obrigatória, validação de schema, recursos e instruções limitadas.
- Depende de: PAR-X02, PAR-T12.
- Aceite: Ferramenta externa só executa pelo pipeline (policy, aprovação, journal); servidor desconhecido, schema hostil e timeout são recusados; processo stdio morre no dispose.

## F4 — Orquestração

11 cartões, cerca de 186 dias de engenharia (faixa 125–250).

| Cartão  | Título                                                 | Tam. | Prio. | Estado | Depende de       |
| ------- | ------------------------------------------------------ | ---- | ----- | ------ | ---------------- |
| PAR-O01 | Subagentes com herança estrita de autoridade           | G    | P1    | `TODO` | PAR-K06, PAR-S04 |
| PAR-O02 | Filhos continuáveis com mailbox durável                | G    | P2    | `TODO` | PAR-O01          |
| PAR-O03 | Jobs de agente em segundo plano                        | G    | P1    | `TODO` | PAR-S01, PAR-A01 |
| PAR-O04 | Agendamento persistente com entrega idempotente        | G    | P1    | `TODO` | PAR-O03          |
| PAR-O05 | Webhooks genéricos com regras confiáveis               | M    | P1    | `TODO` | PAR-O03          |
| PAR-O06 | Workflow durável                                       | G    | P2    | `TODO` | PAR-O01, PAR-O03 |
| PAR-O08 | Goal durável por sessão                                | G    | P2    | `TODO` | PAR-S02          |
| PAR-O09 | Modo de planejamento e todos da sessão                 | M    | P2    | `TODO` | PAR-S02, PAR-T11 |
| PAR-O10 | PTC: programas do modelo em Node contido               | G    | P2    | `TODO` | PAR-X03, PAR-K03 |
| PAR-T10 | Shell com jobs em segundo plano e relatório de negação | M    | P2    | `TODO` | PAR-X01, PAR-O03 |
| PAR-A04 | Controlador de jobs observáveis na API                 | M    | P2    | `TODO` | PAR-O03, PAR-A01 |

### PAR-O01 — Subagentes com herança estrita de autoridade

- Fase F4 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G3/SUB-01, 02, 03, 05, 08. Absorve: P100-033.
- Hoje: Nenhum mecanismo de delegação; orçamentos existem no loop iterativo.
- Entrega: Registro de subagentes e driver no mesmo kernel (spawn e fork); filho recebe subconjunto de ferramentas, orçamento e tenant; linhagem no audit.
- Depende de: PAR-K06, PAR-S04.
- Aceite: Filho nunca executa ferramenta fora do grant do pai; falha do filho volta como erro; linhagem correta na auditoria.

### PAR-O02 — Filhos continuáveis com mailbox durável

- Fase F4 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G3/SUB-04. Absorve: P100-033.
- Hoje: Ausente.
- Entrega: Enviar mensagem, interromper e listar filhos, com mailbox em PostgreSQL e retomada.
- Depende de: PAR-O01.
- Aceite: Restart retoma a mensagem sem entregar duas vezes; filho de outro tenant não é endereçável.

### PAR-O03 — Jobs de agente em segundo plano

- Fase F4 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G3/JSW-01..03. Absorve: P100-037.
- Hoje: Fila do worker e outbox durável; sem job por agente com dono.
- Entrega: Iniciar, listar, ler saída e encerrar jobs com posse por sessão; aviso de conclusão que acorda o agente com teto.
- Depende de: PAR-S01, PAR-A01.
- Aceite: Crash, retry e duplicata não criam efeito extra; só o dono lê ou encerra o job.

### PAR-O04 — Agendamento persistente com entrega idempotente

- Fase F4 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G3/JSW-04..06, JSW-09. Absorve: P100-037.
- Hoje: Só varredura periódica de aprovações expiradas.
- Entrega: Lembretes únicos, por intervalo, diários, semanais e cron com fuso IANA, entregues na sessão original; gestão e registro de entregas.
- Depende de: PAR-O03.
- Aceite: Tick perdido entrega uma ocorrência; recorrente entrega só a última perdida; agenda clínica real nunca é alterada automaticamente.

### PAR-O05 — Webhooks genéricos com regras confiáveis

- Fase F4 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G3/JSW-07, JSW-08. Absorve: P100-037.
- Hoje: Webhooks de canal assinados (Chatwoot, Evolution); sem registro genérico de regras.
- Entrega: Regra confiável registrada transforma evento externo em nova sessão ou tarefa pelo mesmo pipeline.
- Depende de: PAR-O03.
- Aceite: Assinatura inválida, replay e tenant errado são recusados; resposta 202 sem esperar o turno.

### PAR-O06 — Workflow durável

- Fase F4 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G3/WF-01..04. Absorve: P100-035.
- Hoje: Loop iterativo com checkpoint por passo; sem coordenação de filhos.
- Entrega: Workflow com agentes, paralelo, pipeline e fases, checkpoints e execução em segundo plano; a forma (script do modelo ou definição declarativa) sai da decisão D4.
- Depende de: PAR-O01, PAR-O03.
- Aceite: Workflow interrompido retoma do checkpoint; reexecução mantém um efeito; cancelamento vira erro, nunca sucesso parcial.

### PAR-O08 — Goal durável por sessão

- Fase F4 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G3/GPT-01..04. Absorve: P100-036.
- Hoje: Objetivo existe só dentro do run.
- Entrega: Goal persistido com compare-and-set, ferramentas de leitura e atualização, driver de rodadas com limite e comandos de operador.
- Depende de: PAR-S02.
- Aceite: Corridas de pausa, parada e rodada preservam a intenção; goal encerrado não reabre; goal nunca concede autorização.

### PAR-O09 — Modo de planejamento e todos da sessão

- Fase F4 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G3/GPT-05..07; G5/INT-06. Absorve: P100-036.
- Hoje: Aprovação e handoff cobrem revisão humana; sem modo de plano nem todos.
- Entrega: Plano revisável aprovado antes de efeitos; lista de todos por sessão com posse e projeção.
- Depende de: PAR-S02, PAR-T11.
- Aceite: Aprovar o plano não aprova efeito; todos são dado não autoritativo.

### PAR-O10 — PTC: programas do modelo em Node contido

- Fase F4 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/PTC-01, 02, 04, 05, 06. Absorve: P100-034.
- Hoje: Ausente; `shell.run` só executa argv puro.
- Entrega: Execução de programa escrito pelo modelo em processo contido, com bindings para as ferramentas registradas e taxonomia de falhas.
- Depende de: PAR-X03, PAR-K03.
- Aceite: Programa com N subchamadas gera N entradas de audit e journal; loop, escape e saída excessiva são negados e o processo termina.

### PAR-T10 — Shell com jobs em segundo plano e relatório de negação

- Fase F4 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G2/SH-03, SH-05. Absorve: P100-023.
- Hoje: Timeout mata o comando (máx. 120 s); sem background.
- Entrega: Comando longo vira job com id, dono, saída e kill; negações de política reportadas como fato.
- Depende de: PAR-X01, PAR-O03.
- Aceite: Job de outro tenant não é legível; cancelar mata o grupo inteiro.

### PAR-A04 — Controlador de jobs observáveis na API

- Fase F4 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G4/API-07 (jobs). Absorve: P100-040.
- Hoje: Jobs de worker sem superfície de cliente.
- Entrega: Progresso e saída de jobs por stream na API.
- Depende de: PAR-O03, PAR-A01.
- Aceite: Somente o dono acompanha; reconexão retoma a saída do ponto certo.

## F5 — Console, operação e interação hospitalar

15 cartões, cerca de 204 dias de engenharia (faixa 135–270).

| Cartão  | Título                                            | Tam. | Prio. | Estado | Depende de                                  |
| ------- | ------------------------------------------------- | ---- | ----- | ------ | ------------------------------------------- |
| PAR-H01 | CLI de operação                                   | M    | P1    | `TODO` | PAR-K05                                     |
| PAR-H02 | Configuração tipada com dump e catálogo           | M    | P1    | `TODO` | PAR-K05                                     |
| PAR-H03 | Credenciais por referência e autorização humana   | G    | P1    | `TODO` | PAR-H02                                     |
| PAR-H04 | Configurações por formulário e gestão de plugins  | G    | P2    | `TODO` | PAR-H02, PAR-K04                            |
| PAR-U01 | Console: chat ao vivo                             | G    | P1    | `TODO` | PAR-A01, PAR-T04, PAR-A02                   |
| PAR-U02 | Console: sessões, fork e trajetória               | M    | P1    | `TODO` | PAR-S04, PAR-S05, PAR-U01                   |
| PAR-U03 | Console: planos, goals, jobs, agenda e subagentes | G    | P2    | `TODO` | PAR-O04, PAR-O08, PAR-O09, PAR-O01, PAR-U01 |
| PAR-U04 | Console: entregáveis e preview seguro             | G    | P1    | `TODO` | PAR-T05, PAR-T06, PAR-U01                   |
| PAR-U05 | Comandos, atalhos e gatilhos                      | M    | P2    | `TODO` | PAR-U01                                     |
| PAR-U06 | Console: i18n, tema, acessibilidade e reconexão   | M    | P2    | `TODO` | PAR-U01                                     |
| PAR-U07 | Presets de permissão                              | M    | P2    | `TODO` | PAR-X04, PAR-K05                            |
| PAR-I01 | Voz e transcrição revisável                       | G    | P1    | `TODO` | PAR-K04, PAR-U01                            |
| PAR-I02 | Feedback por mensagem e por sessão                | M    | P1    | `TODO` | PAR-S01                                     |
| PAR-I03 | Inspetor de runtime autenticado                   | M    | P2    | `TODO` | PAR-S05                                     |
| PAR-I04 | Invariantes de runtime por pacote                 | M    | P2    | `TODO` | PAR-K04                                     |

### PAR-H01 — CLI de operação

- Fase F5 · prioridade P1 · tamanho M · trilha T2 · relevância hospitalar média · estado `TODO`.
- Origem: G4/HOST-01, 03, 05; G1/BUNDLE-02. Absorve: P100-040.
- Hoje: Entrada só por `apps/api` e `apps/worker` com variáveis de ambiente.
- Entrega: Comando `cvg` com api, worker, migrate, doctor, dump de configuração e execução headless de uma tarefa.
- Depende de: PAR-K05.
- Aceite: `cvg doctor` e o dump rodam sem rede e sem segredo na saída; ação sensível em headless vira handoff.

### PAR-H02 — Configuração tipada com dump e catálogo

- Fase F5 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G4/HOST-04. Absorve: P100-040.
- Hoje: Variáveis documentadas em `.env.example`, sem schema exportável.
- Entrega: Schema único de configuração, validação no boot, dump da configuração efetiva sem segredos e catálogo gerado.
- Depende de: PAR-K05.
- Aceite: Configuração inválida falha com uma mensagem única; o dump nunca contém valor de segredo.

### PAR-H03 — Credenciais por referência e autorização humana

- Fase F5 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G4/HOST-09, HOST-10. Absorve: P100-040.
- Hoje: Segredos por arquivo com rotação documentada; sem serviço de credenciais.
- Entrega: Configuração guarda só o nome; valor no cofre; rotação vale na chamada seguinte; fluxo de autorização humana para credencial de provider ou canal.
- Depende de: PAR-H02.
- Aceite: Rotação sem reinício vale na próxima chamada; segredo não aparece em log, dump ou erro.

### PAR-H04 — Configurações por formulário e gestão de plugins

- Fase F5 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G4/HOST-06, HOST-08; G5/CL-09, CL-10; G3/EXT-05. Absorve: P100-040, P100-012.
- Hoje: Versões de agente, catálogo de plugins e aprovação de capability existem; sem edição por schema nem inventário carregado.
- Entrega: Formulário derivado do schema com revisão; inventário somente leitura do que está carregado; instalar e remover plugin revisado com aprovação.
- Depende de: PAR-H02, PAR-K04.
- Aceite: Plugin não revisado não instala; plugin nunca libera o que um controle negou.

### PAR-U01 — Console: chat ao vivo

- Fase F5 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G5/CL-01. Absorve: P100-041.
- Hoje: Console lista conversas e mostra timeline somente leitura.
- Entrega: Composer, anexos, estado do turno em tempo real e feedback por mensagem.
- Depende de: PAR-A01, PAR-T04, PAR-A02.
- Aceite: Console nunca marca sucesso sem evento do motor; mensagem enviada passa pelo pipeline como qualquer entrada.

### PAR-U02 — Console: sessões, fork e trajetória

- Fase F5 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G5/CL-02, CL-03. Absorve: P100-041.
- Hoje: Trace de execução e auditoria em telas separadas.
- Entrega: Navegação por sessões, fork, histórico e trajetória por turno.
- Depende de: PAR-S04, PAR-S05, PAR-U01.
- Aceite: Cada passo exibido liga ao evento do log; sessão de outro tenant não aparece.

### PAR-U03 — Console: planos, goals, jobs, agenda e subagentes

- Fase F5 · prioridade P2 · tamanho G · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G5/CL-03, CL-04, CL-05. Absorve: P100-041.
- Hoje: Lista de tarefas operacionais.
- Entrega: Painéis de plano, goal e todos, jobs com saída ao vivo, agenda e lembretes, subagentes e workflow.
- Depende de: PAR-O04, PAR-O08, PAR-O09, PAR-O01, PAR-U01.
- Aceite: Aprovar plano na UI não aprova efeito; reenvio não duplica job.

### PAR-U04 — Console: entregáveis e preview seguro

- Fase F5 · prioridade P1 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G5/CL-08. Absorve: P100-041.
- Hoje: Ausente.
- Entrega: Cartão de arquivos alterados, diff e preview de PDF, imagem e Markdown; Office e HTML em origem isolada.
- Depende de: PAR-T05, PAR-T06, PAR-U01.
- Aceite: HTML ativo não executa na origem do console; documento só leitura.

### PAR-U05 — Comandos, atalhos e gatilhos

- Fase F5 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G5/CL-11, INT-05. Absorve: P100-041.
- Hoje: Comandos só no produto (WhatsApp).
- Entrega: Registro de comandos no núcleo sem ida ao modelo; `/` e `@` no console; tabela de atalhos.
- Depende de: PAR-U01.
- Aceite: Comando com efeito passa por policy e aprovação como qualquer ação.

### PAR-U06 — Console: i18n, tema, acessibilidade e reconexão

- Fase F5 · prioridade P2 · tamanho M · trilha T2 · relevância hospitalar média · estado `TODO`.
- Origem: G5/CL-12. Absorve: P100-041.
- Hoje: pt-BR fixo e marcações ARIA básicas.
- Entrega: Camada de i18n (pt-BR e en), tema, navegação por teclado auditada e reconexão.
- Depende de: PAR-U01.
- Aceite: Jornadas principais completas só com teclado; queda de rede reconecta sem perder estado.

### PAR-U07 — Presets de permissão

- Fase F5 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G5/INT-04. Absorve: P100-041.
- Hoje: Policy e policy-engine sem seletor.
- Entrega: Presets de sandbox e política de aprovação como contrato público e seletor no console.
- Depende de: PAR-X04, PAR-K05.
- Aceite: Nenhum preset relaxa controle obrigatório.

### PAR-I01 — Voz e transcrição revisável

- Fase F5 · prioridade P1 · tamanho G · trilha T3/T4 · relevância hospitalar alta · estado `TODO`.
- Origem: G5/VOZ-01..06. Absorve: P100-044.
- Hoje: Transcritor Whisper só dentro do produto de plantão.
- Entrega: Contrato de transcrição no núcleo com cancelamento e retenção; provider local com assets aprovados; UI de gravação com texto editável; áudio de canal transcrito com marca.
- Depende de: PAR-K04, PAR-U01.
- Aceite: Baixa confiança gera revisão humana; transcrição nunca vira registro definitivo sem aprovação.

### PAR-I02 — Feedback por mensagem e por sessão

- Fase F5 · prioridade P1 · tamanho M · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: G4/OBS-01, OBS-02. Absorve: P100-046.
- Hoje: Ausente.
- Entrega: Nota, categoria e observação por mensagem e por sessão, por tenant, fora do contexto do modelo; exposto em API e SDK.
- Depende de: PAR-S01.
- Aceite: Feedback não entra no histórico do modelo; observação respeita limite e redação.

### PAR-I03 — Inspetor de runtime autenticado

- Fase F5 · prioridade P2 · tamanho M · trilha T3 · relevância hospitalar média · estado `TODO`.
- Origem: G3/INS-01, INS-02, EXT-03; G4/OBS lacuna 4. Absorve: P100-046, P100-045.
- Hoje: Trajetória e traces administrativos existem; sem inspetor do registro do kernel.
- Entrega: Inspeção somente leitura de serviços, hooks, ferramentas e eventos por correlação, para operador autenticado.
- Depende de: PAR-S05.
- Aceite: Falha reconstruída por correlationId sem payload sensível; acesso sem credencial é recusado.

### PAR-I04 — Invariantes de runtime por pacote

- Fase F5 · prioridade P2 · tamanho M · trilha T2 · relevância hospitalar média · estado `TODO`.
- Origem: G4/OBS-05. Absorve: P100-046.
- Hoje: Verificações de cadeia e preflights isolados.
- Entrega: Registro de invariantes por pacote com chave global, filtro e falha atribuída ao dono.
- Depende de: PAR-K04.
- Aceite: Invariante violada aponta o pacote dono; desligada não custa nada no caminho quente.

## F6 — Cauda integral (escopo a confirmar na decisão D2)

28 cartões, cerca de 469 dias de engenharia (faixa 313–622).

| Cartão  | Título                                           | Tam. | Prio. | Estado | Depende de       |
| ------- | ------------------------------------------------ | ---- | ----- | ------ | ---------------- |
| PAR-P02 | LSP somente leitura                              | M    | P3    | `TODO` | PAR-X01          |
| PAR-P03 | Perfil ACP por stdio                             | G    | P3    | `TODO` | PAR-A05, PAR-P01 |
| PAR-P04 | Execução remota por SSH                          | GG   | P3    | `TODO` | PAR-X04, PAR-P03 |
| PAR-P05 | Protocolo remoto tipado por decorador            | GG   | P3    | `TODO` | PAR-A03          |
| PAR-T14 | Terminais PTY persistentes                       | G    | P3    | `TODO` | PAR-X03, PAR-T10 |
| PAR-T15 | PowerShell                                       | M    | P3    | `TODO` | PAR-T10          |
| PAR-U08 | Console: terminal e árvore de arquivos           | G    | P3    | `TODO` | PAR-T14, PAR-U01 |
| PAR-U09 | Aplicativo desktop                               | GG   | P3    | `TODO` | PAR-U01          |
| PAR-I07 | Browser use                                      | G    | P3    | `TODO` | PAR-P01, PAR-X03 |
| PAR-I08 | Computer use                                     | G    | P3    | `TODO` | PAR-I07          |
| PAR-O11 | Subagentes por providers externos                | G    | P3    | `TODO` | PAR-O02, PAR-P03 |
| PAR-O12 | PTC em Python                                    | M    | P3    | `TODO` | PAR-O10          |
| PAR-O13 | Agent Teams com mailbox e quadro de tarefas      | G    | P3    | `TODO` | PAR-O02, PAR-O06 |
| PAR-O07 | Loop Ralph                                       | M    | P3    | `TODO` | PAR-O06          |
| PAR-E01 | Extensões dinâmicas host e cliente               | G    | P3    | `TODO` | PAR-K04, PAR-H04 |
| PAR-E02 | Guest em Web Worker                              | G    | P3    | `TODO` | PAR-K05, PAR-U01 |
| PAR-K10 | Pontes de hooks do Claude Code e do Codex        | M    | P3    | `TODO` | PAR-K09          |
| PAR-I09 | Telemetria de produto e identidade anônima       | P    | P3    | `TODO` | PAR-H02          |
| PAR-I05 | Exportação de log de sessão por OTEL             | M    | P3    | `TODO` | PAR-S01          |
| PAR-I06 | Revisor automático consultivo                    | P    | P3    | `TODO` | PAR-K04          |
| PAR-D02 | Backends JSON e SQLite                           | G    | P3    | `TODO` | PAR-D01          |
| PAR-M04 | Provider DeepSeek e campos de extensão           | M    | P3    | `TODO` | PAR-M01, PAR-H03 |
| PAR-T13 | Providers de busca web                           | M    | P3    | `TODO` | PAR-T12, PAR-H03 |
| PAR-T08 | Skills de Office e relatório de dependências     | M    | P3    | `TODO` | PAR-T07, PAR-T06 |
| PAR-T03 | Editor str_replace                               | P    | P3    | `TODO` | PAR-T01          |
| PAR-C05 | Compactação manual                               | P    | P3    | `TODO` | PAR-C01          |
| PAR-C06 | Instruções de workspace e referências a arquivos | M    | P3    | `TODO` | PAR-T09          |
| PAR-Q10 | Executável e distribuição por plataforma         | G    | P3    | `TODO` | PAR-Q08          |

### PAR-P02 — LSP somente leitura

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G2/LSP-01..03. Absorve: P100-032.
- Hoje: Ausente.
- Entrega: Serviço LSP por extensão e ferramenta com quatro consultas somente leitura.
- Depende de: PAR-X01.
- Aceite: Arquivo fora do workspace, timeout e EOF do servidor recusados; subprocesso encerra no dispose.

### PAR-P03 — Perfil ACP por stdio

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G2/ACP-01..04; G1/BUNDLE-03. Absorve: P100-026.
- Hoje: Ausente.
- Entrega: Servidor ACP sobre o mesmo contrato de sessão: criar, listar, retomar, prompt, cancelar, MCP por sessão.
- Depende de: PAR-A05, PAR-P01.
- Aceite: Sessão ACP herda tenant e grants; cancelamento não duplica efeito; MCP não aprovado é recusado.

### PAR-P04 — Execução remota por SSH

- Fase F6 · prioridade P3 · tamanho GG · trilha T3/T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G2/SSH-01..04. Absorve: P100-026.
- Hoje: Ausente.
- Entrega: Carrier remoto com helper verificado, fs e subprocesso remotos e sandbox remoto.
- Depende de: PAR-X04, PAR-P03.
- Aceite: Fixture remota controlada passa; desconexão e retry não duplicam efeito; remoto real só com gate T4.

### PAR-P05 — Protocolo remoto tipado por decorador

- Fase F6 · prioridade P3 · tamanho GG · trilha T3 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G1/TYP-01, TYP-02. Absorve: P100-025.
- Hoje: Ausente; o CVG expõe contratos versionados.
- Entrega: Exposição de métodos do host por decorador e gerador de tipos.
- Depende de: PAR-A03.
- Aceite: Método sem autorização explícita não é exposto.

### PAR-T14 — Terminais PTY persistentes

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G2/TRM-01..04. Absorve: P100-023.
- Hoje: Ausente.
- Entrega: Seis ferramentas de terminal (abrir, enviar, ler, fechar, listar, sinalizar) com PTY dentro da contenção.
- Depende de: PAR-X03, PAR-T10.
- Aceite: Terminal só responde ao dono exato; encerrar a sessão mata todos os descendentes; `send` repetido não repete efeito.

### PAR-T15 — PowerShell

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G2/SH-08. Absorve: P100-023.
- Hoje: Ausente.
- Entrega: Executor PowerShell local, contido e persistente.
- Depende de: PAR-T10.
- Aceite: Mesma suíte de contenção do bash passa.

### PAR-U08 — Console: terminal e árvore de arquivos

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G5/CL-06, CL-07. Absorve: P100-041.
- Hoje: Ausente.
- Entrega: Abas de terminal recuperáveis e árvore de arquivos com seletor de diretório.
- Depende de: PAR-T14, PAR-U01.
- Aceite: Somente papéis administrativos acessam; nada fora do workspace do tenant.

### PAR-U09 — Aplicativo desktop

- Fase F6 · prioridade P3 · tamanho GG · trilha T3/T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G5/DK-01..07. Absorve: P100-042.
- Hoje: Ausente.
- Entrega: Shell desktop com host local, seletor nativo, deep links, instalador e atualização.
- Depende de: PAR-U01.
- Aceite: Jornadas do desktop iguais às do Web numa plataforma suportada; preload sem API genérica de execução.

### PAR-I07 — Browser use

- Fase F6 · prioridade P3 · tamanho G · trilha T3/T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G5/BRW-01..06. Absorve: P100-043.
- Hoje: Ausente.
- Entrega: Provider único por sessão (Playwright via MCP, DevTools, Stagehand) com allowlist de destinos.
- Depende de: PAR-P01, PAR-X03.
- Aceite: Jornada em site sintético; destino fora da allowlist negado; submit exige aprovação; fechar a sessão encerra o browser.

### PAR-I08 — Computer use

- Fase F6 · prioridade P3 · tamanho G · trilha T3/T4 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G5/CMP-01..04. Absorve: P100-043.
- Hoje: Ausente.
- Entrega: Provider de desktop em VM descartável, com screenshots sob retenção.
- Depende de: PAR-I07.
- Aceite: Jornada em app sintético numa VM isolada com aprovação por ação e kill.

### PAR-O11 — Subagentes por providers externos

- Fase F6 · prioridade P3 · tamanho G · trilha T3/T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/SUB-06. Absorve: P100-033.
- Hoje: Ausente.
- Entrega: Filhos via ACP, SDK, Codex e Claude Code em processo isolado, sem credenciais do pai.
- Depende de: PAR-O02, PAR-P03.
- Aceite: Filho externo nunca recebe credencial do pai; falha volta como erro.

### PAR-O12 — PTC em Python

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/PTC-03. Absorve: P100-034.
- Hoje: Ausente.
- Entrega: Backend Python do PTC com protocolo de descritor e limites.
- Depende de: PAR-O10.
- Aceite: Mesma suíte de falhas do PTC Node passa.

### PAR-O13 — Agent Teams com mailbox e quadro de tarefas

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/AT-01..07. Absorve: P100-038.
- Hoje: Ausente.
- Entrega: Roster com limite, mailbox durável, quadro de tarefas com DAG e versão otimista, ferramentas, perfil e UI.
- Depende de: PAR-O02, PAR-O06.
- Aceite: Mensagens e DAG sobrevivem a restart; duplicata não executa duas vezes; conflito de versão é explícito.

### PAR-O07 — Loop Ralph

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/WF-05, WF-06. Absorve: P100-035.
- Hoje: Loop iterativo do kernel sem filhos frescos.
- Entrega: Rodadas de filho novo sobre objetivo imutável, com relatório limitado e `maxRounds`.
- Depende de: PAR-O06.
- Aceite: Relatório inválido encerra a rodada com erro; o limite de rodadas é respeitado.

### PAR-E01 — Extensões dinâmicas host e cliente

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/EXT-01, EXT-02, EXT-04. Absorve: P100-045.
- Hoje: Divergência deliberada pela ADR-011 (código de plugin gerado em runtime).
- Entrega: Definições dinâmicas com grant, capabilities declaradas e controles fora do alcance; painel de gestão.
- Depende de: PAR-K04, PAR-H04.
- Aceite: Extensão nunca registra controle nem executa sem grant; unload de controle negado.

### PAR-E02 — Guest em Web Worker

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G3/WW-01..03. Absorve: P100-045.
- Hoje: Ausente.
- Entrega: Empacotador de imagem VFS e runtime de plugins num Web Worker com túnel HTTP.
- Depende de: PAR-K05, PAR-U01.
- Aceite: Jornadas mapeadas iguais entre guest e host; CSP e limites testados.

### PAR-K10 — Pontes de hooks do Claude Code e do Codex

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/HOOKS-02, HOOKS-03. Absorve: P100-012.
- Hoje: Ausente.
- Entrega: Execução de configurações de hooks de outras ferramentas sob o protocolo do PAR-K09.
- Depende de: PAR-K09.
- Aceite: Comando não revisado não roda; ponte nunca altera controle obrigatório.

### PAR-I09 — Telemetria de produto e identidade anônima

- Fase F6 · prioridade P3 · tamanho P · trilha T4 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G1/IDENT-01, 02; G4/OBS-04, OBS-06. Absorve: P100-046, P100-040.
- Hoje: Ausente; o CVG usa operador identificado.
- Entrega: Identificador de instalação e telemetria de produto com consentimento.
- Depende de: PAR-H02.
- Aceite: Nada sai do ambiente sem autorização; identificador não deriva de dado pessoal.

### PAR-I05 — Exportação de log de sessão por OTEL

- Fase F6 · prioridade P3 · tamanho M · trilha T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G4/OBS-03; G1 session-telemetry. Absorve: P100-046.
- Hoje: Adaptador OTEL de spans e métricas com redação.
- Entrega: Canal de log de sessão com fila limitada, retry e shutdown com deadline.
- Depende de: PAR-S01.
- Aceite: Exporter fora do ar não altera o turno; nada sai sem redação.

### PAR-I06 — Revisor automático consultivo

- Fase F6 · prioridade P3 · tamanho P · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G3/AR-01..03. Absorve: P100-046.
- Hoje: Divergência: no CVG ação sensível exige humano.
- Entrega: Revisor por modelo que só pode rebaixar para aprovação humana.
- Depende de: PAR-K04.
- Aceite: O revisor nunca converte "requer aprovação" em "permitido".

### PAR-D02 — Backends JSON e SQLite

- Fase F6 · prioridade P3 · tamanho G · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/STOR-02, STOR-03. Absorve: P100-015.
- Hoje: Só PostgreSQL, por decisão da ADR-011.
- Entrega: Backends JSON e SQLite com a mesma suíte de conformidade.
- Depende de: PAR-D01.
- Aceite: A suíte única passa nos três backends; não há dual-write silencioso.

### PAR-M04 — Provider DeepSeek e campos de extensão

- Fase F6 · prioridade P3 · tamanho M · trilha T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/LLM-04, LLM-05. Absorve: P100-014.
- Hoje: Providers OpenAI-compatível, Ollama e determinístico.
- Entrega: Adaptador DeepSeek com chave por referência e campos de extensão.
- Depende de: PAR-M01, PAR-H03.
- Aceite: Sem chave falha fechado; provider real só com gate T4.

### PAR-T13 — Providers de busca web

- Fase F6 · prioridade P3 · tamanho M · trilha T4 · relevância hospitalar baixa · estado `TODO`.
- Origem: G2/WEB-03. Absorve: P100-031.
- Hoje: Ausente.
- Entrega: Exa, Perplexity e DeepSeek atrás do seam web.
- Depende de: PAR-T12, PAR-H03.
- Aceite: Provider ambíguo é erro; provider real só com gate T4.

### PAR-T08 — Skills de Office e relatório de dependências

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G2/SKL-04, SKL-05. Absorve: P100-022.
- Hoje: Ausente.
- Entrega: Pacote de skills de Word, PowerPoint e Excel com checagens; relatório de interpretadores.
- Depende de: PAR-T07, PAR-T06.
- Aceite: Skill carrega só com as ferramentas do grant.

### PAR-T03 — Editor str_replace

- Fase F6 · prioridade P3 · tamanho P · trilha T3 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G2/FS-08. Absorve: P100-022.
- Hoje: Redundante com `fs.edit`.
- Entrega: Ferramenta view, create, str_replace e insert.
- Depende de: PAR-T01.
- Aceite: Mesma política de leitura antes de editar.

### PAR-C05 — Compactação manual

- Fase F6 · prioridade P3 · tamanho P · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/COMP-02. Absorve: P100-021.
- Hoje: Sem comando manual.
- Entrega: Compactação manual por rota e comando, com poda opcional.
- Depende de: PAR-C01.
- Aceite: Compactação manual cancelada não grava resumo.

### PAR-C06 — Instruções de workspace e referências a arquivos

- Fase F6 · prioridade P3 · tamanho M · trilha T3 · relevância hospitalar baixa · estado `TODO`.
- Origem: G1/CTX-01..03. Absorve: P100-021.
- Hoje: Ausente.
- Entrega: Instruções de origem aprovada no runtime e menções `@arquivo` e `@sessão`.
- Depende de: PAR-T09.
- Aceite: Instrução de origem não aprovada não entra no prompt; nada fora do workspace é listado.

### PAR-Q10 — Executável e distribuição por plataforma

- Fase F6 · prioridade P3 · tamanho G · trilha T4 · relevância hospitalar nenhuma · estado `TODO`.
- Origem: G4/DST-02, SDK-07. Absorve: P100-052.
- Hoje: Entrega é imagem de contêiner.
- Entrega: Executável autônomo com sidecars e wheels por plataforma.
- Depende de: PAR-Q08.
- Aceite: Instalação limpa por plataforma suportada passa o smoke.

## F7 — Prova e aceite

4 cartões, cerca de 46 dias de engenharia (faixa 30–60).

| Cartão  | Título                                       | Tam. | Prio. | Estado | Depende de       |
| ------- | -------------------------------------------- | ---- | ----- | ------ | ---------------- |
| PAR-Q06 | Gates de paridade no CI                      | M    | P0    | `TODO` | PAR-Q05, PAR-Q02 |
| PAR-Q07 | Recuperação, concorrência e performance      | G    | P0    | `TODO` | PAR-Q06          |
| PAR-Q08 | Candidata reproduzível com SBOM e assinatura | M    | P1    | `TODO` | PAR-K02          |
| PAR-Q09 | Auditoria independente e aceite de 100%      | M    | P0    | `TODO` | PAR-Q07, PAR-Q08 |

### PAR-Q06 — Gates de paridade no CI

- Fase F7 · prioridade P0 · tamanho M · trilha T2 · relevância hospitalar alta · estado `TODO`.
- Origem: P100-050; G4/TST-07. Absorve: P100-050, PDSH-033.
- Hoje: Gates fortes de E2E, mutação e cobertura por arquivo; sem gate de snapshot por superfície nem de paridade.
- Entrega: Snapshot por superfície (SDK, sessão, API, web), diferenciais e medidor como checks obrigatórios.
- Depende de: PAR-Q05, PAR-Q02.
- Aceite: Regressão de capacidade já aprovada derruba o CI.

### PAR-Q07 — Recuperação, concorrência e performance

- Fase F7 · prioridade P0 · tamanho G · trilha T3 · relevância hospitalar alta · estado `TODO`.
- Origem: P100-051. Absorve: P100-051.
- Hoje: Provas de restore e pausa existem para o núcleo atual.
- Entrega: Restart, replay, cancelamento, duplicata, crash no efeito, troca de tenant e carga em todas as famílias aprovadas.
- Depende de: PAR-Q06.
- Aceite: Cada família tem caso negativo de recuperação passando na candidata.

### PAR-Q08 — Candidata reproduzível com SBOM e assinatura

- Fase F7 · prioridade P1 · tamanho M · trilha T4 · relevância hospitalar média · estado `TODO`.
- Origem: G4/DST-01, DST-04, DST-06. Absorve: P100-052.
- Hoje: SBOM, licenças e registro de imagem existem; sem assinatura nem instalação limpa comprovada.
- Entrega: Instalação limpa sem fonte nem legado, hash e assinatura ligados ao SBOM.
- Depende de: PAR-K02.
- Aceite: Imagem ou pacote sintético instala num diretório limpo e passa o smoke.

### PAR-Q09 — Auditoria independente e aceite de 100%

- Fase F7 · prioridade P0 · tamanho M · trilha T4 · relevância hospitalar alta · estado `TODO`.
- Origem: P100-053. Absorve: P100-053.
- Hoje: Sem auditoria de paridade.
- Entrega: Auditoria que reexecuta amostra crítica e negativos de cada família e confere o catálogo inteiro.
- Depende de: PAR-Q07, PAR-Q08.
- Aceite: Medidor marca 100% PASS_CURRENT no escopo decidido, sem exceção funcional aberta; sem auditoria o estado é AUDIT_PENDING.
