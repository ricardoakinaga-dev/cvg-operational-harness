# Conferência limitada do reparo F01 — R2

**APPROVE_SCOPED_FREEZE — F01/P2 fechado; 0 mandatory, 0 P1/P2/P3 abertos.** Aprovação somente do plano técnico da fatia1, sem aceite de BUILD ou produção e sem início de S1/C03 nesta rodada.

Freeze revisto: [TECHNICAL-FREEZE.md](../../TECHNICAL-FREEZE.md), SHA-256 `5ad836fe812aee7f43e6aa7393c68f26cc3f7d09d98dd046dd8cf2bb5fe78089`. Confere com `new_sha256` de [repair.json](../freeze-r1/repair.json), SHA-256 `f641539a02b667d37d9291a19743617bb0b31cdb4f424bebb57cfb537c36e23d`.

O [original preservado](../freeze-r1/TECHNICAL-FREEZE-input.md.txt) conserva SHA-256 `ed576494b88e13e141394254e7430d96e4968c2b31233c14e8bfde86266dfe4c`, exatamente o input da R1. SPEC R2 e human26 conservam os hashes conferidos anteriormente, respectivamente `551f477ac2bcf1a531c719ac6a660b1dbaae3ef9ce7998ced9cbfef70465dc1e` e `ae6a077850f8db3aa8d2b01f10055a1917814e9389677577f941a415245acef1`.

## Fechamento de F01

**Anchors:** freeze revisto:149–151 e :162; human26:22; core.test.ts:1–30; landlock-status.test.ts:1–12; spawn-boundary.test.ts:36–72,87–112,126–179.

A nova seleção fecha explicitamente os três arquivos baseline:

- `packages/sandbox/src/__tests__/par-x01-process-service-core.test.ts`;
- `packages/sandbox/src/__tests__/par-x02-landlock-status.test.ts`;
- `tests/par-x01-spawn-boundary.test.ts`.

O primeiro cobre validações, parser de status e observação procfs; o segundo alimenta o parser Landlock com documentos sintéticos; o terceiro analisa texto/AST de fontes, sem executar as strings de spawn usadas como fixtures. A referência indireta ao módulo capabilities no segundo arquivo fornece constante, sem chamar o probe nativo. Há I/O de fixtures temporárias e leitura de procfs; “puros” aqui não significa ausência de todo I/O, mas ausência de payload/compilação/probe nativo nesses procedimentos.

Os novos testes S1 ficam limitados a spies/mocks/spawn fictício; a seção proíbe substituir o seam por Node, shell, bwrap ou helper reais. As suítes helper/launch/serviço nativo/persistência e qualificação de CPU/memória/pids/seccomp ficam expressamente `NOT_RUN`. Assim a correção também evita a coleta dos arquivos nativos apontados na R1. **F01 está CLOSED_STATIC**; nenhum novo gate executável é necessário para esse diagnóstico readonly.

`repair.json` declara baseline118 e zero payloads; o registro `baseline-pure.json` enumera exatamente esses três caminhos e registra exit0. Esse é registro do responsável, lido estaticamente: o crítico não repetiu testes nem certifica a execução ou a contagem118 nesta conferência. O fechamento decorre da correção do procedimento e da inspeção das fontes, não de um PASS nativo inferido.

## Ausência de regressão no escopo

O diff entre original e revisto contém somente dois trechos: a seção de seleção fechada e a substituição do procedimento S1-06. S1-01..05 e S1-07, contratos de relatório/espelhos, recusa de B antes de efeito, diagnóstico sempre qualified:false, limites de unit e gates prospectivos não foram alterados. Os sete arquivos de código inventariados na R1 mantêm os mesmos SHA-256. Não há implementação nova aceita nesta revisão.

Permanecem os limites já revisados: nenhum payload, pressão, ativação de unit ou escrita de cgroup; nenhuma qualificação B; provas nativas e filho cgroup vazio `NOT_RUN`; unit/entry e manifesto ainda sujeitos à inspeção dos artefatos quando existirem. Não se amplia a revisão para detalhes executáveis das fatias seguintes.

## Continuidade e método

Revisão direta de reparo único, limitada a F01 e regressões do diff. Somente leitura/hash/diff local e escrita dos dois arquivos deste novo diretório. Sem testes, imports de aplicação, compilador/helper, processos nativos de qualificação, systemd, PG/Docker, rede ou agentes filhos. Fontes, freeze, R1, claims e ledgers não foram alterados pelo crítico. GBrain permanece sem consulta/gravação pela proibição de rede; sincronização fica com o responsável.

DF28745 e a nova prioridade de C03 repairs `a9319a10b` foram recebidas do usuário, sem executar ou revisar C03. Este parecer encerra a conferência do freeze; **não inicia S1 nem C03**, não altera a fila de prioridades e não concede produção. Próxima ação pertence ao responsável, respeitando C03 antes de S1.
