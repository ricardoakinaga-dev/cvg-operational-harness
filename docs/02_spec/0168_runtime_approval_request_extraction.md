# SPEC 0168 — UP91-021-R2: extração interna de solicitação de approval

Task UP91-021-R2, continuação interna de UP91-021/PR-202; T2 sob D-12. Build autorizado apenas como organização pura, sem alteração de contratos/policy/approval/security/SQL/budget.

## Recon e escopo

ApósR1, runtime.ts tem1.591 linhas e requestApprovalTurn permanece com95linhas. Extrair seu corpo intacto e a mesma assinatura em módulo interno `runtime-approval-request.ts`, usando as mesmas options por referência. Delegar o mesmo ponto da execução pública. Mover helper approvalResource intacto ao módulo interno de identidade existente e importar onde necessário, sem duplicação.

Paths exclusivos já claimados: runtime.ts, runtime-effect-identity.ts e novo runtime-approval-request.ts. Contratos e barrel público intocados; docs/código PR-L04 somente leitura. R1 permanece estruturalmente igual.

## Regras e pronto

1. Preservar AST normalizado, ordem, criação da proposta e seu hash, TTL, audit/spans, args/return/catch/messages/codes e fluxo de approval. Sem segurança nova nem eliminação de controles.
2. Mesma options/contexto por referência, tipos originais, sem casts/ciclos/export público. Runtime e novos módulos internos abaixo1.500linhas após formatação, sem manipulação de linhas para cumprir limite.
3. Snapshot Node22: typecheck/lint/unit completos, PG/E2E obrigatórios zero skips; ASTknown-good/bad; crítico I1 somente leitura com sentinela aceita apenas a refatoração.
4. Se exigir qualquer alteração de comportamento/contrato, parar T2 e preparar T3 antes BUILD. Não transferir aceites antigos, não encerrar UP91-021 pelas duas subfatias: seus outros hotspots/integração/dependências continuam abertos.

## Recuperação e evidência

Fonte original preservada em evidência UP91-EXEC; reconstrução é patch dos próprios módulos, sem Git destrutivo. SnapshotPG55592 e browser3252/4252. Gates pendentes/NOT_RUN; release NO_GO. SPEC/CVGledgers via handoff depois da verificação.
