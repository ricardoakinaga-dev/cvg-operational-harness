# Resposta documental à revisão r2

REVISE2P2 preservado, versão original e inputs sem drift. Não há código/BUILD.

- F01: mappings explícitos CANCELLED/cancelled_by_operator e POLICY_DENIED/approval_rejected, respectivamente execution_cancelled/denied. Result anterior retido não sobrepõe a mutação; response=null e mensagens estáticas. AUTH08/09 cobrem negativos.
- F02: concessão ACTIVE exige alvo elegível; revogação existente valida gerente/tenant/root/principal/CAS mesmo com alvo inativo ou role alterada. REVOKED sem assignment409 sem criação; reativação não restaura REVOKED. AUTH04 cobre sequência e conflito.

Próxima revisão independente usa somente pacote selado atualizado, sem receber parecer/rationale.
