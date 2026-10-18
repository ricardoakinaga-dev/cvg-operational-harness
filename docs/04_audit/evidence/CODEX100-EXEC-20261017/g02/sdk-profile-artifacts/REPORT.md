# SDK — sete dependências obtidas e verificadas como dados

A aquisição limitada está concluída: sete artefatos, **7.116.743 bytes**,
conferem com os locks do pin. [Aceite](acceptance-status.json),
[validação](validation.json), [próxima tarefa](next-task.json).

Seis wheels tiveram nomes, versões, tags CPython/Linux, requisitos e todos os
registros RECORD conferidos. O TypeScript5.9.2 teve SHA512 e manifesto conferidos.
São301 arquivos extraídos e169 arquivos copiados para a árvore Python privada,
sem installer. Os scripts presentes no pacote npm não foram executados.
A closure verificada é a dos metadados dos pacotes selecionados; não representa
um call graph dinâmico completo nem instalação completa do SDK Codex.

O coletor inicial terminou com erro ao ajustar o timeout após a leitura final.
A [falha original](acquisition.json) foi preservada. A [recuperação offline](offline-recovery.json)
recalculou os digests e o Content-Length dos sete arquivos completos; não houve
repetição HTTP ou substituição. Os caminhos originais terminam em attempt1.part
por proveniência; somente o receipt de recuperação os qualifica como completos.

Uma segunda leitura comparou cada arquivo físico com o archive e os RECORDs.
[Oito controles negativos](validator-controls.json) rejeitaram traversal, symlink,
startup hook, conteúdo/versionamento adulterado e expressões não admitidas.
Não são testes dos SDKs. Os [vazios originais](empty-source-files.json) ficam
inventariados no cache privado; não há nova evidência vazia no repositório.

Não houve import do Pydantic/SDK, execução do compilador, provider ou função
nativa. Carregamento de bibliotecas, comportamento real dos clientes, wheel/npm
Codex distribuídos e demais plataformas continuam abertos. O catálogo509 e as
seis lacunas SDK permanecem não qualificados. A SPEC0239 e seus anexos continuam
aguardando a decisão T3 já solicitada.

Próxima ação: implementar e qualificar os drivers/adapters/peers/FIFOs/captura
conforme o HOW aprovado. Código alvo só poderá executar depois da admissão
concreta de identidades, isolamento, limites e limpeza dessa etapa.
