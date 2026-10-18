# Revisão independente — HISO005-P1-INTEGRATION-20261018

**APPROVE_SCOPED_DIFF. Zero achados obrigatórios.** Parecer sobre o port T2 dos contratos0228/0234 já aprovados, emitido por crítico de contexto fresco, sem participação no BUILD e sem descendentes. Não é revisão da SPEC0236.

Candidata física readonly `/home/ricardo/cvg-candidates/hiso005-integrated-20261018`, HEAD `9b494a4d70c3899e25cb249a78316055c306fc99`; base qualificada `26d866c39060669680aca01b34a916d45e1ba362`. O diff tem exatamente os dez paths de `source-freeze.json`. As 55 fontes Claude100 preexistentes foram conferidas contra a base, candidata e root; pertencem à qualificação ClaudeQ04 e não são autoria/crédito desta integração.

## Achados obrigatórios

Nenhum observado no escopo congelado. Não há correção de implementação ou teste solicitada.

## Verificação do port

- **Integridade:** 10/10 hashes congelados coincidem com commit, candidata física e snapshot próprio antes/depois. Os outros nove paths coincidem exatamente com b703. Todos os paths rastreados fora dos dez são idênticos à base26d, incluindo lock, configuração, manifests, runtime e fontes Claude. As dez pré-imagens do root e seus blobs de índice ficaram intactos nesta janela. [Inicial](source-integrity.initial.json), [final](source-integrity.final.json).
- **Mescla:** reconstrução independente por `git merge-file -p --diff3 BASE26D CORE5A B703`, exit0, reproduz o checker `a3893ca1c5f4e440532a40a0edf532e99b92e390de8796ecbe6745e9af4e0503`. O catálogo inteiro é byteidêntico ao root/base, incluindo seis grupos PARE posteriores e pins atualizados. Preservados os guards `lstat.isFile`/realpath e os sites literais SDK/example/child. Os quatro helpers físicos compartilhados são exatos à base/b703. O patch do preflight foi aplicado somente em reconstrução própria e reproduziu as dez pós-imagens. [Prova independente](merge-preservation.independent.json), [diff](scoped.diff.patch).
- **Contrato conservador:** inspeção do checker/verifier/comparador, CLI e runner confirmou catálogo inativo, nenhum caminho de supressão por exceção ou confiança nominal instalada. O default mantém diagnósticos por ocorrência; `exceptions:true` acrescenta recusa e conserva FAIL conhecido. MATCH continua `verified:false`/INCOMPLETE; MISMATCH acrescenta identidade sem apagar diagnóstico original. O runner/comparador/helper de processo são byteexatos ao mecanismo0234 aprovado; nenhuma instalação/recipe foi executada pelo revisor.
- **Execução focal:** Node22.23.2, binário SHA256 `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`. Três suítes originais em snapshot mínimo físico/config própria: **160 PASS**, zero falhas, skips ou todo: product-boundary131, contenção0228=11, integração0234=18. [Resultado bruto](vitest.json).
- **Sondas independentes:** **12 grupos PASS**, comparando checker root/base, b703 e mesclado quando pertinente. Cobrem fonte neutra; receiver/pin real sem supressão; preservação de diagnósticos root strict; catálogo SDK posterior presente/inativo; FAIL de produto com pedido legado; recibo sintético independente com encoder próprio; MATCH concatenado sem confiança; MISMATCH opaco; opt-in CLI normal=strict byteexatos e graph conservador; nove variantes CLI inválidas exit2; API malformada recusada. [Resultados](independent-probes.json), [fonte executada](independent-probes-v3.mjs.source.txt).

A API completa recusa symlink no inventário de fontes ou no censo físico antes de avaliar pins. Duas tentativas iniciais das sondas esperavam atingir esse estágio e terminaram exit1; foram preservadas com seus erros, sem serem contadas como PASS ou defeito do candidato. A versão final mantém essas recusas estruturais e exercita adicionalmente a expressão **exata** `pinsHold` extraída, sem alterar a implementação: guard do root/mesclado recusa symlink/diretório; b703 isolado aceita hash por symlink ou lança EISDIR. Esse controle extraído é unitário, não alegação de que a API alcançou pins em árvore já recusada. [Primeira tentativa](independent-probes.stderr.txt), [segunda](independent-probes-v2.stderr.txt).

## Comandos, limites e handoff

[Comandos exatos e exitcodes](commands.json), [inputs físicos/config isolada](snapshot-inputs.json), [parecer estruturado](review.json) e [hashes dos artefatos](SHA256SUMS.txt). `git diff --check base26d HEAD9b494a4d` passou. Os testes/probes originais e fontes da candidata não foram editados. Nenhum teste0234 comparer/runner com pais antigos foi executado; nenhum filho daqueles pais foi criado por esta revisão.

Somente evidências desta revisão e temporários próprios receberam escritas. Root, candidata, índice, leitor compartilhado, worktree P1 e selos anteriores permaneceram readonly para o revisor. Ledgers/backlog/coordenação centrais ficam com o Lead, conforme restrição explícita de escrita do usuário; `review.json` contém a continuidade desta lane.

Limite deliberado: fixtures sintéticas e revisão do port. Não executei gates completos, typecheck/lint globais, PostgreSQL, E2E, certify, SBOM/licenças, install, rede ou dado real. Não reconstruí uma referência real para o lock/config atual e não transfiro a certificação b703 para o novo checker. A referência sintética usada nos probes não atesta recipe/proveniência de uma referência operacional.

O Lead deve concluir sua certificação separada e consumidor fresco, verificar evidências e pré-imagens novamente antes de promover exclusivamente as dez fontes aprovadas. **Este parecer não aprova B6, HISO005 integral, semântica0236, produção, push ou deploy.** Revisão encerrada; nenhuma implementação pendente nesta lane.
