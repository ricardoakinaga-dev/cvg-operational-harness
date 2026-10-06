# SPEC 0165 — UP91-021-R1: extração interna da recuperação de efeitos

Task registrada: UP91-021-R1, subfatia de UP91-021/PR-202. Trilha **T2** sob D-12; BUILD interno autorizado pelo pedido de execução integral, condicionado aos gates T2. Não altera contrato público, segurança, policy, approval, SQL, schema ou efeito externo. Se surgir mudança de comportamento, parar esta fatia e abrir SPEC T3 para revisão explícita.

## Recon e escopo

`packages/agent-runtime/src/runtime.ts` tem 2.636 linhas. O bloco de recuperação/journal, de `#handleToolFailure` até `#markJournalUncertain`, ocupa cerca de 944 linhas e usa as mesmas options/contexto do runtime. PR-L04 ocupa outros arquivos; os quatro caminhos desta fatia estão reservados no claim UP91-EXEC. SPEC 0153 já integrou a primeira extração; esta é continuação interna, sem reemitir sua aprovação para mudanças T3.

Extrair esse bloco por composição em `runtime-effect-recovery.ts`; compartilhar os tipos internos de execução em `runtime-execution-context.ts` e os helpers de identidade estável em `runtime-effect-identity.ts`. Esses módulos são internos e não entram no export público de `index.ts`. O runtime delega chamadas ao módulo usando o mesmo objeto de options. Nenhum state machine é reescrito.

## Invariantes obrigatórias

- Preservar corpos e ordem das operações, argumentos, return/catch, mensagens, códigos de erro, spans/audit e transições; mudar apenas organização, referências internas e imports.
- Preservar operation key, digests, canonicalização, reservas, recuperação, replay, incerteza e negação de efeitos. Sem mudança de orçamento, timestamps, persistência ou interfaces públicas.
- Sem casts para contornar tipos, ciclo de imports de valor, duplicação de algoritmo, wrappers desconectados ou supressões de lint. Evitar exposição acidental dos módulos internos no barrel público.
- Comparação estrutural dos corpos antes/depois, normalizando apenas referências de composição, deve rejeitar alteração do algoritmo. Preservar a fonte original e os hashes em evidência.

## Critério de pronto da subfatia

1. Runtime usa a extração no caminho público `runTurn`; helpers internos têm responsabilidades coerentes; nenhum módulo novo excede 1.500 linhas.
2. Typecheck, lint, unitários completos, PG obrigatório e E2E simulation/trusted verdes em Node22, zero skips; regressões de recuperação/aproval/durabilidade exercitam implementações existentes.
3. Crítico fresco somente leitura I1 aprova esta subfatia, com fingerprint pré/pós preservado e limites declarados. Builder não decide aceite.
4. SPEC, cartão UP91, evidências e handoff de ledgers registram resultado real. Falhas preexistentes ficam explícitas e não viram verde por remoção de teste.

Esta fatia não encerra UP91-021: runtime ainda pode exceder 1.500 linhas; extrações restantes, inbox/context/executeService e integração dos consumidores têm critérios próprios. Dependências de encerramento do cartão principal não são dispensadas; esta extração interna pode ser construída independentemente, sem declarar a integração completa.

## Verificação e recuperação

Snapshot sintético exclusivo `/tmp/cvg-up91-exec-20260930/repo`, Node22.23.2, PostgreSQL descartável em loopback55592 e E2E3252/4252. Não executar testes/build/certify em paths compartilhados. Preservar baseline para comparar diff; qualquer reversão necessária é patch restrito aos arquivos desta fatia, sem comandos destrutivos de Git.

**Resultado:** NOT_RUN; BUILD permitido apenas para esta organização interna T2. Gates permanecem pendentes. Release NO_GO.
