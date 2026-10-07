# AUD0603 — evidências da reauditoria

Candidata9b85d5b4c6c1f4fb7eee4b1bb4c6e67db3f44e04, base4aa4d8f. [Parecer](../../0603_reauditoria_aud0602_2026-10-06.md): PARTIAL, dois P2 de sessão, produção NO_GO. P1 original corrigido; falha original de revoke corrigida; nova falha create após revoke e predecessor deixam remediação parcial. Sem implementação, commit, push ou alteração remota.

- [Verificações atuais](verification.json):359 arquivos/2.946 PASS com cobertura; PostgreSQL37/299; type/lint/formato/docs/critical/mutation/audit PASS. Menor grupo crítico branches96,73%, limiar95%.
- [Julgamento final](lead-adjudication.json): dois P2 canônicos. Oracles exploratórios, proposta intermediária de precedência e observações conservadoras não foram confundidos com achados confirmados.
- [Arquivo de bytes e hashes](archive-manifest.json): logs/JSONs/fonte das sondas comprimidos sem mudança de bytes. Comparação de fontes946 paths sem drift. Gzip não é decodificado pelo scanner padrão; não se alega scan do conteúdo comprimido.

## Reprodução

Extraia os .gz em diretório próprio, preservando os caminhos indicados em uncompressedSource. Fontes completas disponíveis pelo SHA Git; npm ci físico em Node22.23.2, sem mudar lock. run-gate.py registra comandos/saídas; adapte somente paths/porta/bancos sintéticos sob claim próprio. PostgreSQL da auditoria já removido,55725 agora sem recurso nosso.

Kernel: probes.mjs e loader.mjs no pacote kernel-reviewer; use novo AUD0603_LABEL para não reutilizar journals. Comparação anterior substitui somente runtime.ts da base, módulos adjacentes sem delta. Lead-kernel repete três casos: cancel/deadline corrigidos e cancel+pause como observação contratual. Aprovação real em memória e FileEffectJournal real, sem declaração de restart da aprovação persistida.

Sessão: probe.mjs, supplement.mjs, loaders e resultados nos pacotes session-reviewer e lead-session. Fixture cria quatro roles mínimas e schemas com prefixo exclusivo; NODE_ENV=production, bootstrap real, duas instâncias HTTP loopback. Lead-session repete apenas os dois findings. Suplemento da base usa fontes necessárias de git archive4aa4d8f e deps da candidata, sem diff de lock; nunca modificar a árvore compartilhada. Cada sonda apaga só seus schemas/roles/listeners. Estados de família, respostas503/401/200 e differential constam nos JSONs. Exit0 dos diagnósticos não significa PASS da candidata.

CI: remote-4aa4d8f contém logs e manifestos da base, incluindo unit ANSI, erro metrics.unit, E2E12 e browser15. São históricos. checks contém parser-probe e schema, scan exato dos cinco commits (zero) e schedule simulado105/94 evidências/11outros. Scanner8.28.0 baixado da origem e verificado por checksum. Logs/reportes de scanner redigidos; nenhum segredo real adicionado ou exceção criada. Não foi feita triagem universal dos105.

E2E/browser/certify completos e CI atual NOT_RUN. Hashes do catálogo37 conferem; ausência atual de skips está nas duas suítes, não em uma certificação completa. Não reutilizar a aprovação do CI antigo para a candidata. Recursos próprios removidos, revisores encerrados, fonte/lock e registros anteriores preservados.
