# T1 — insumos de fonte da próxima jornada nativa completa

Task `DX100-G04:NATIVE-JOURNEY-CONTRACT-RECON`. Recon finito concluído: 12 fontes de implementação e quatro documentos canônicos, cinco portas, CQ01–14 e ND01–08. **Somente fonte; todos os aceites integrados continuam NOT_RUN.** Não é revisão/auditoria fechada, SPEC aprovada nem autoridade de BUILD.

HEAD observado: `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5`. Checkout compartilhado dirty; as 12 fontes selecionadas estavam tracked/limpas. PRD0030 e proposta estavam untracked; PUBLIC_API estava modificado. Os 16 SHA-256 vinculam os bytes lidos e foram reconferidos sem alteração. Inventário, linhas, assinaturas, trechos, owners e dependências estão em [source-recon.json](source-recon.json); escopo em [task.json](task.json) e [claim.json](claim.json).

| Porta                       | Fonte atual                                                                | Limite do achado                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Sessão / recovery / journal | `ExecutionStepStore`, `EffectJournal`, `createSessionKernelLog`            | PARTIAL: load/save e replay confirmado; journal lido é memória. Adapter durável, lease/fence e commit conjunto UNKNOWN.         |
| Loop / resultado / contexto | Factory iterativa, `ContextEngine.build`, `IterativeOrchestrator.decide`   | PARTIAL: ROOT limita payload e histórico; dispatch/RESPONSE externo UNKNOWN. SPEC0224 é mecanismo do PARE, sem reimplementação. |
| Approval / cancel / resume  | `ApprovalEngine.request`, lifecycle opcional, `RuntimeInput.resume/signal` | PARTIAL: bindings e gates visíveis; decisão institucional, first cause e terminal CAS dependem dos owners.                      |
| Stream incremental          | `complete` e `Provider.execute` agregados                                  | MISSING nas superfícies lidas: deltas antes do terminal. Eventos de chamada e polling de sessão não demonstram esse contrato.   |
| SDK wire / lifetime         | Protocolo1, quatro métodos, stdio limitado                                 | PARTIAL: server fixa `single_pass`; sem método remoto de cancel/resume/push. `close()` local não cancela kernel remoto.         |

| CQ   | Fonte   | Pendência determinante                               |
| ---- | ------- | ---------------------------------------------------- |
| CQ01 | PARTIAL | Wiring público compatível e composição completa.     |
| CQ02 | PARTIAL | READ real / contexto admitido; dispatch externo.     |
| CQ03 | PARTIAL | Dois ramos; RESPONSE completo depende de PAR0224.    |
| CQ04 | PARTIAL | PENDING/DENIED sem corpo; enforcement externo.       |
| CQ05 | PARTIAL | Intenção exata, bindings e fence durável.            |
| CQ06 | MISSING | Porta incremental nativa ainda ausente no recorte.   |
| CQ07 | PARTIAL | Cursor confirmado, reconexão e pressão de stream.    |
| CQ08 | PARTIAL | Erro / deadline / cancel distintos e primeira causa. |
| CQ09 | PARTIAL | CAS terminal, ordem de commits e ACK durável.        |
| CQ10 | PARTIAL | A→B, journal/events/accounting duráveis.             |
| CQ11 | PARTIAL | Incerteza e falha da própria reconciliação.          |
| CQ12 | PARTIAL | Dois processos; attempt em memória não basta.        |
| CQ13 | UNKNOWN | Qualificador/candidata fora do recorte.              |
| CQ14 | UNKNOWN | Referência, regra e autoridade fora do recorte.      |

Matriz: 11 PARTIAL, 1 MISSING, 2 UNKNOWN. CURRENT_SOURCE rotula fatos/assinaturas observados; nenhum CQ recebeu prova funcional. MISSING aplica-se às superfícies delimitadas, sem inferir ausência global. Dependências fora das 12 fontes ficam UNKNOWN referenciadas.

PARE conserva resultado completo/admissão/checkpoint0224 e os contratos canônicos aplicáveis0221/0225; não duplicar stores/migrations nem inferir adoção default0226. Compatibilidade de fixtures, servidor de falhas, capturas/comparador e adapters C100 continua UNKNOWN neste recorte. A referência e a certificação viva do qualificador pertencem ao Lead.

ND01–08 permanecem abertos: procedência da referência; fatia de reuso; recovery/ownership; wire e negociação; terminal/ACK; limites/accounting; matriz de referência; gate da próxima jornada. A SPEC0224 documenta CAS/admissão; isso não comprova sua integração no ROOT. Nenhuma porta ou versão wire nova foi desenhada.

Continuidade para o Lead: usar este mapa para reconciliar provas dos owners e preparar o contrato **completo CQ01–14**, preservando responseIntent/responseText, stream, restart e concorrência. Ledgers99/20/30, coordenação, fontes e candidatas permaneceram readonly nesta lane. Nenhum target/import, CLI, probe, modelo, PG/Docker, rede, gate, build ou descendente; o diagnóstico g03 esgotado não foi repetido nem convertido em defeito PARE.

Verificação T1 de artefatos: hashes, cardinalidades, referências e links locais conferidos; formatação do próprio REPORT.md via Node22/Prettier da raiz registrada no JSON.
