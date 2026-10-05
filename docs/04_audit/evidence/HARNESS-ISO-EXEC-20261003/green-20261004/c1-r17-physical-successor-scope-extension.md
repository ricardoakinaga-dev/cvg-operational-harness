# Extensão corretiva local C1 R17

Task: `HARNESS_ISO_GREEN_20261004`. Trilha T2, correção de mecanismo interno, sem mudança de contrato público. BUILD local sintético já autorizado pelo usuário para continuidade e regressões; nenhuma aprovação externa é inferida.

A revisão R16 reproduziu atalhos de workspace que descartam sucessores instalados fisicamente, workspace ausente que perde o testemunho de produto e diretório instalado sem manifesto raiz que perde metadados aninhados. A correção retém as arestas declaradas e físicas na ordem efetiva do Node, governa todo contexto canônico alcançado e preserva diagnósticos não comprovados. A continuação diagnóstica das referências locais ausentes em pacote publicado continua bloqueante; não concede exceção a vendor, testes ou campos de dependência.

Escrita exclusivamente em cópia isolada: checker, helper de manifestos e acréscimos ao teste estático próprio. Os 253 testes originais e o prefixo de 658 controles permanecem intactos. Dependência: resultados brutos R16 preservados; Source R16, Main e checkout compartilhado permanecem sem alterações de runtime.

Pronto para revisão quando controles inertes discriminantes reproduzirem as falhas antes da correção, passarem depois e conservarem as recusas de metadata inválido, symlinks ou caminhos externos. Exigir regressões nativas, tipos, lint, capturas antes/depois, hashes/asserções e crítico novo. Uma revisão do mecanismo não concede aceite do gate instalado: todo desconhecido efetivamente alcançado continua bloqueante. Integração e promoção ficam sujeitas às condições anteriores e aos gates aplicáveis.

Sem execução de payloads de fixtures, provider, rede, PostgreSQL nesta frente, dados reais, push ou implantação. NO_MODEL permanece. [Revisão bruta R16](c1-installed-manifest-review-r16-reject.json).
