# AUD0600 — evidência da reauditoria — 06/10/2026

- Task `AUD0600-REMEDIATION-REAUDIT-20261006`, Codex. Candidato `5c97b40a751233a2fdd2babcbabba80387faa7cc`; três commits locais recebidos, base `d893ea9`.
- [Relatório](../../0600_reauditoria_remediacao_aud0599_2026-10-06.md): correções dos cenários originais confirmadas, aderência integral parcial, dois P2 remanescentes. Produção `NO_GO`; sem commit/push/deploy.
- [Identidade](source-manifest.json), [contagens e limites](proof.json). Código e lockfile compartilhados somente leitura; Node 22.23.2, worktree e dependências físicas próprios; PostgreSQL 16 descartável próprio em loopback 55722, dados sintéticos, `PHASE4A_PG_REQUIRED=1`.

| Prova | Resultado e artefato |
| --- | --- |
| Suíte completa | 352 arquivos; 2.844 PASS ordinários + duas falhas esperadas I6/I7; zero skips. [Recibo](full.result.json), log `full.log.gz`, JSON `full.json.gz`. |
| PostgreSQL exclusivo | 35 arquivos, 288 PASS, zero skips. [Recibo](postgres.result.json), log `postgres.log.gz`, JSON `postgres.json.gz`. |
| Typecheck/lint/formato/links | PASS; recibos `typecheck.result.json`, `lint.result.json`, `format.result.json`, `links.result.json`, logs comprimidos correspondentes. |
| Dependências | Audit completo zero; `audit.log.gz`, [recibo](audit.result.json). Lockfile muda somente `source-map-js` 1.2.1 → 1.2.2. |
| Bootstrap real sem pacotes | Candidato exit 0 antes do install, base exit 1 por `zod` ausente. [Prova](bootstrap-proof.json), logs `bootstrap.log.gz`/`bootstrap-old.log.gz`. |
| Regex/parsers/aliases | [Sondas do lead](security-probes.json): 300 mil frases com seed fixa + 234 variações sem diferenças; entradas de até um milhão de espaços/barras; três parsers × seis fixtures; três aliases confirmados por TypeScript e rejeitados somente no candidato; SSRF byte-exato. |
| Cenários originais | [12 PASS](lead-probes.json), com asserções restauradas sobre comportamento corrigido; [negativos da base](kernel-negative-controls.json) falham em F01/F02. |
| Achados novos | [Cinco casos próprios confirmados](lead-new-findings.json), agrupados em dois P2; [suplemento reexecutado](lead-viability-results.json), dois casos adicionais confirmam retornos viáveis do dispatcher. |
| Revisão independente | Matriz principal 26 PASS/5 FAIL; suplemento 0 PASS/2 FAIL. `reviewer/results.json.gz`, `reviewer/viability-results.json.gz`, comparações com a base e [parecer](reviewer/review.txt). Exit 0 do runner captura os FAIL e não significa aprovação. |
| Remoto | [Captura GitHub](remote-summary.json): `main=d893ea9`, proteção false, nenhum run do candidato; 19 high + um medium abertos no SHA anterior. |

Os dois P2 também falham na base; nenhuma regressão diferencial demonstrada. F01: indisponibilidade em `tool/result` **e** `turn/end` volta a apagar o motivo. F02: cancelamento/ferramenta ausente na retomada, ou ausência de ferramenta/prazo no dispatcher antes do pipeline, persistem checkpoint terminal e mantêm etapa aberta. Corpo zero e nenhum efeito nesses casos.

Fontes dos runners arquivadas como `.txt`, sem inserir sondas na coleta canônica. Para reprodução, usar cópia no mesmo candidato com `npm ci` em Node 22, ajustar o root absoluto dos runners e extrair o loader. O suplemento com imports estáticos exige `node --import <loader.mjs> <lead-viability.mjs>`; a tentativa inicial com hook registrado tarde falhou por sintaxe TypeScript e está preservada em `lead-viability-loader-first-attempt.log.gz`. Essa falha do runner foi corrigida antes da medição; não é falha da entrega.

Limites: stores/autoridade das sondas em memória; não provam crash/concorrência durável. Suíte PostgreSQL real não equivale a prova dos novos casos no banco. CodeQL não executado localmente; sem E2E/certify/imagem/restore/alerta operacional nesta rodada. Revisor não consultou o bundle do construtor, mas viu incidentalmente seu resumo nos ledgers obrigatórios; não se alega cegamento documental perfeito. PostgreSQL próprio removido após as suítes e revisor encerrado; claim concluído.
