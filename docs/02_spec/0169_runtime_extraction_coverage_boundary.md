# SPEC 0169 — UP91-004-R1: preservar cobertura crítica após extração

Task UP91-004-R1 registrada como subfatia independente do cartãoUP91-004, T2 sobD12; sem comportamento, contrato, schema, security/approval change. BUILD autorizado somente a metadata de medição, mantendo critérios.

## Recon e escopo

O grupo kernel em scripts/critical-coverage-manifest.json contém apenas runtime.ts. Após a extração mecânica0165/0168, recovery/approval/identity migraram para módulos internos; deixá-los fora reduziria o denominador crítico. Incluir runtime-effect-recovery.ts, runtime-approval-request.ts, runtime-effect-identity.ts e runtime-execution-context.ts no mesmo grupo. Grupo/piso95, outros grupos e pisos globais90/85/90/90 permanecem.

## Pronto e validação

Manifesto mantém pathsoriginais e adiciona exatamente quatro paths presentes/ligados ao kernel; schema do grupo não muda. Coverage full emNode22 comPG obrigatório, critical gate recalculado ponderado, sentinelas known-good/bad de threshold/denominador existentes e regressãoT2. I1 revê delta e confirma que não oculta controle ou baixa piso. Main UP91-004 permanece aberto para catálogo/workspace/cobertura de outros deltas.

## Resultado e recuperação

NOT_RUN. BaselineJSON preservada antes de mutação emUP91-EXEC. Correção restrita da própria metadata por patch; sem Git destrutivo/lockfile/recursoscompartilhados. Snapshot55592 Node22 exclusivo. Falha de coverage não será corrigida baixando limite ou removendo arquivo. Release NO_GO.
