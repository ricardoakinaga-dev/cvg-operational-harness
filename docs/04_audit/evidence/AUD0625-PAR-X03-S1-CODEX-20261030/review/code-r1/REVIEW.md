# CODE R1 — CHANGES_REQUESTED

Revisão independente e direta de `AUD0625-PAR-X03-S1-CODEX-20261030`, limitada à inspeção estática dos 14 caminhos do manifesto. **0 P1, 1 P2 obrigatório, 1 P3 não bloqueante.** Não há aceite runtime, qualificação B ou liberação de produção.

## Finding obrigatório — CODE-R1-F01 / P2

**O verificador aceita relatórios de recursos que violam o contrato congelado.** Critérios S1-01/S1-03; freeze linhas 35–44 e SPEC0294R2 §4.3.

Âncoras: `packages/sandbox/src/process-service/containment.ts:199` e `:204`; `packages/sandbox/src/run.ts:161` e `:175`; testes `par-x03-contracts.test.ts:153`.

O ramo `namespace-observed` verifica apenas executor e independência, sem validar resources/seccomp. Portanto, partindo do outcome A coerente de `par-x03-adapter.test.ts:21`, trocar somente `containment.resources` por um bloco `applied/cgroup-v2` completo com limite `pidsMax:-1` conserva os espelhos e leva o verificador a retornar true. Os campos numéricos admitem esse valor no tipo TypeScript. Com causa exit, código 0 e cleanup limpo, o adaptador projeta sucesso. É uma contraprova por fluxo estático, **não executada**.

No ramo guardian, limits são conferidos, mas events/peaks e `seccomp.profileId` não. Partindo do guardian sintético em `par-x03-contracts.test.ts:53`, um contador `{value:-1,reason:null}`, `{value:null,reason:null}` ou um profileId fora da união não é rejeitado. Os construtores `processCounter` e `validProcessResourceLimits` não obrigam todos os relatórios recebidos pelo adaptador a passar por eles.

Impacto limitado e preciso: o gate de coerência novo permite sucesso com diagnóstico inválido. **Isso não demonstra lançamento B nem escape da recusa:** o serviço real recusa B em `service.ts:158–159` e seu produtor A emite resources/seccomp `not_required`. Aceitar uma forma futura coerente como schema tampouco autentica prova nativa.

Correção: conferir variantes presentes, motivos fechados, limites, todos os contadores e profileId antes de projetar exit, inclusive quando resources está presente no perfil A. Preservar estados unknown/not_required legítimos da SPEC. Fechamento com testes puros/seams do verificador e adaptador, incluindo preservação de causa e A coerente; **sem helper, launcher, payload ou execução B**.

## Finding não bloqueante — CODE-R1-F02 / P3

**Falha de close pode escapar como exceção bruta do diagnóstico.** Critério S1-04; freeze linhas 75–78.

Âncoras: `packages/sandbox/src/process-service/cgroup-preflight.ts:110`, `:199` e `:209`; `par-x03-preflight.test.ts:44`.

`small` captura open/read, mas `closeSync` no finally não é protegido. Uma exceção no close substitui tanto o retorno quanto a falha de leitura já capturada. As chamadas para membership, rootEmpty e controllers não possuem conversão externa para um relatório refused com motivo fechado. O mock de close nunca lança.

É um caso raro de erro de diagnóstico, sem falso candidate ou admissão: continua falhando fechado. Não foi induzido erro real de descritor. Recomenda-se converter a leitura em incerta/refused quando close falhar e cobrir isso pelo seam de filesystem, mantendo a exceção de cancelamento por AbortSignal.

## Conferência dos invariantes

| Critério | Resultado desta revisão |
| --- | --- |
| S1-01 | Não conforme estaticamente: F01. União readonly transcrita, mirrors centrais e IOCTL_DEV sem grant conferidos. |
| S1-02 | Conforme estaticamente. B é recusado antes de slots, prepare e spawn; cache encaminha o requisito sem downgrade. Criação do objeto de serviço em cache pode anteceder a recusa, sem executar workload. |
| S1-03 | Versão/estado/cleanup/mirrors rejeitados conservam causa; F01 limita a completude da validação. |
| S1-04 | qualified:false constante; paths normalizados, lstat, fs magic, UID efetivo, vazio/supervisor, ancestrais/controladores, disponibilidade de arquivos e runtime0700 conferidos. F02 documenta exceção rara. |
| S1-05 | Unit/entry sem ativação ou interface de payload, ExecStart e argumentos fechados, oneshot e runbook explícito. Instalação/build/efeito da unit não provados. |
| S1-06 | Fontes dos quatro testes novas inspecionadas; três baseline hashes preservados. Testes/mutantes não executados por este revisor. Regressões nativas continuam NOT_RUN pelo freeze R2. |
| S1-07 | Manifesto, 14 fontes e quatro inputs exatos PRE/POST. Inventário integral de pins, gates T1 e commit final pertencem ao parent. |

Compatibilidade A: o diff dos cinco arquivos existentes mantém causas, timers, fila persistente e cleanup; centraliza construção de mirrors, acrescenta recusa de requisito B e o filtro do adaptador. Nenhum consumidor externo é considerado migrado ou qualificado. Os nove arquivos novos foram lidos diretamente, pois ainda não constam no diff de arquivos rastreados da base. O candidato parcial tem documentação rastreada ausente; isso não foi interpretado como remoção da implementação nem como árvore global certificada.

## Identidade e limites

- Base: `9a8ab4c7a8980b8de61e2cfc5c56b1e6f902c5f2`.
- Manifesto: `5d20f175eb8e8f46b07a2d45cd72816f2f8b2fa80c5f218324590b5a8d6ad56f`.
- Freeze aprovado: `5ad836fe812aee7f43e6aa7393c68f26cc3f7d09d98dd046dd8cf2bb5fe78089`.
- SPEC R2: `551f477ac2bcf1a531c719ac6a660b1dbaae3ef9ce7998ced9cbfef70465dc1e`.
- human26: `ae6a077850f8db3aa8d2b01f10055a1917814e9389677577f941a415245acef1`.
- Parecer freeze-r2: `ed57ccabc4dec9b659509d5a8bf3916c886b46ec70f673f2cabbe7fc5fcc391c`.

Hashes individuais, âncoras e contraprovas constam de [findings.json](findings.json); entrada local/escopo em [intake.json](intake.json), preservação em [source-post.json](source-post.json), digests finais em [artifact-hashes.json](artifact-hashes.json).

Sem filhos/agentes delegados, imports da aplicação, testes, compilação, payload/helper, escrita em cgroup, systemd, PG/Docker ou rede. Apenas leitura/hash/diff e criação destes artefatos próprios. Nenhum PASS de teste, mutante, coverage ou diagnóstico do parent foi incorporado ao parecer. Leituras iniciais de paths no checkout principal não encontraram a evidência privada; os quatro inputs foram então lidos e hash-conferidos na candidata indicada.

**Largest gap:** completar a validação de coerência de recursos antes de retornar sucesso (F01). A maior lacuna nativa continua propositalmente fora desta fatia: não existe qualificação B. A revisão estática não prova comportamento runtime.

Próxima ação: parent dispõe o P2 e o P3, preserva estes pins e registra eventual reparo sob novo freeze com regressões puras/seams. Claim local foi reconciliado com a atribuição explícita e o claim ativo S1 do parent; nenhum claim/ledger raiz foi alterado. GBrain **NOT_ATTEMPTED_NETWORK_PROHIBITED**; pendência local de append/readback e deltas canônicos para o parent, sem alegação de sincronização. Produção **NO_GO**.
