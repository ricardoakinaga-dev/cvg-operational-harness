# SPEC 0210 — Replay determinístico do kernel PARE100

- Tasks: infraestrutura PDSH-032 e base de P100-004; T2 test-support, BUILD_LOCAL_AUTHORIZED_T2 pelo pedido atual. Não confundir replay CVG com comparador diferencial DeepSeek já concluído.
- Ownership Builder B: tests/replay/**, snapshots/core/**, vitest.snapshot.config.mts, scripts/snapshot-replay.mjs no worktree. Sem mudar runtime/contracts/SDK/policy/provider, produto, package.json, aliases ou lock. Lead integra scripts no manifest.

## Barra congelada de comportamento

Pelo menos dez cenários keyless executam o caminho público real createOperationalHarness ou createSdk, com store/controls reais em memória e somente model/efeito externos determinísticos. Cobrir resposta simples, chamada de tool autorizada, policy denied, approval pending/refused ou vínculo inválido, budget excedido, cancelamento antes/em voo, modelo que falha, tool que falha, pause e log/journal que falham quando a porta atual permite o cenário.

Os cenários expõem stopReason, response, usage/counters, eventos tool/call antes de tool/result, request/result de modelo, estado do efeito e ausência de efeito nos gates negados. Regras esperadas vêm dos contratos/ADRs/conformidade, não são arbitradas para coincidir com uma saída defeituosa. Se uma regra não estiver implementada, registrar FAIL e não alterar o motor nesta lane.

Fixtures de input/model plan e esperado versionadas, sem credencial/dado real. Timestamps/UUIDs podem ser substituídos por tokens estáveis explicitamente enumerados; não normalizar eventos ausentes, corpo de input/output, custos/counters, aprovação, erro ou efeito indevido. O mesmo input produz o mesmo transcript normalizado em replay.

## Harness e pronto

Script/config dedicados permitem executar só replay e falham com mismatch sem atualizar automaticamente esperado. Modo de gravação é explícito e limitado aos paths próprios. Tests adversariais adulteram um resultado/evento/efeito e confirmam rejeição, além de provar determinismo em duas execuções.

Fixture schema inválido, missing case ou nome/path hostil falham antes da execução. Expected nunca contém segredo/PII nem trilha local ~/.dsh. Logs próprios guardam comando, exit e hashes. Sem rede/provider real ou subprocesso arbitrário da fixture.

Pronto da infra PDSH-032: ≥10 fixtures executadas, replay determinístico e conhecidos-ruins rejeitados, tipos/lint/foco verdes e crítica I1. P100-004 depende ainda do oracle/reference e comparação entre os dois motores; não marcar esse cartão DONE pela infra unilateral.
