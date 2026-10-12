# PDSH-020 — SPEC de sessão — 12/10/2026

- Escopo documental: [SPEC 0202](../../../02_spec/0202_pdsh020_session_event_format.md), sob autorização T3 do plano 0375. Código/store/catalog ainda pertencem ao próximo cartão 021.
- Recon executado: `KernelLogEvent`/`KernelLog` e HookMap em harness/kernel/types, migrações 0000/0019/0015 e lista de migrações do persistence (última 0027). Não existe session_events atual.
- Decisão: envelope v1, nove tipos fechados (seis atuais do kernel, três novos explícitos para SDK/compactação), schemas JSON determinísticos com SHA-256 canônico, port append/read, stream neutro independente da sessão legada, RLS no setting cvg.tenant_id, journal de sessão imutável, cursor transacional, dedup/conflito por eventId/input e migrações adjacentes preservando geração antiga.
- Barra S01–S09 define provas de concorrência, restart, rollback, RLS non-BYPASSRLS, UPDATE/DELETE/TRUNCATE recusados, unknown-version e drift. Não afirma executar nenhum desses checks de BUILD nesta task.
- Evidência T1: formatação e docs/links/higiene PASS, capturados em [docs.log](docs.log). Sem dado real/provider/commit/push/release; produção NO_GO.
- Próxima ação: PDSH-021, schemas/port/store e migração nova 0028 com testes sintéticos/PG próprio.
