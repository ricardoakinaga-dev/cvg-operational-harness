Maior lacuna restante: certificação corrente, verificador oficial, projeções compiladas/consumidor e fronteira real ainda dependem do trabalho separado do Lead. Este parecer não os qualifica.

**APPROVE — 0 achados obrigatórios**, somente para o reparo conservador revisado. Fonte `d8e3f8f2d346d4f8d3ddd162384ebbb79a322137`; SPEC SHA-256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`. [Parecer estruturado](review.json).

| Critério | Resultado independente |
| --- | --- |
| C1 / BI01 | PASS: sete cenários de builtin, homônimo ou autorreferência seguem a seleção nativa; kernel UNKNOWN, zero provas e nenhum corpo homônimo selecionado. Os cinco CLI correspondentes ficam INCOMPLETE. [Resultados](results.json) |
| C2 / BI02 | PASS delimitado: subpath, prefixo e builtin exclusivo de prefixo recusados; `test`, `fs-extra`, arquivo relativo e pacote comum mantêm positivos. Os quatro arquivos selecionados pelo Node constam dos inputs e provas CLI atuais. [Vínculos físicos](positive-selection-bindings.json), [runtime](native-bindings.json) |
| C3 / BI03 | PASS delimitado: produto conhecido mantém FAIL, inclusive com limite reduzido; default/P1 byteiguais à base no mesmo fixture; normal/strict iguais sem telemetria. Os44controles anteriores permanecem em35chamadas de teste byteiguais; inputs100+15inalterados. Preservação estática não equivale a reexecução da suíte. [Compatibilidade](S12.json), [prioridade](S11.json), [preservação](control-preservation.json) |
| C4 | PASS:17fontes iguais antes/depois; somente2paths diferem da base e15permanecem iguais;9inputs imutáveis preservados. [Antes](source-before.json), [depois](source-after.json), [comparação](base-source-comparison.json) |

A inspeção do Node22.23.2 pinado confirma que CJS resolve builtin antes da busca de pacote (`_resolveFilename`, linha1347), e ESM retorna `node:` antes de procurar manifesto (`packageResolve`, linha764). O novo guard usa a identidade literal desse runtime antes da autorreferência/pacote. Nenhum resumo positivo nativo foi acrescentado. Nos testemunhos equivalentes aos antigos S13/S20, o kernel atual recusa a substituição indevida; o ciclo antigo continua rejeitado e selado.

Foram12cenários e40chamadas controladas:12oracles somente de resolução,13kernels supervisionados e15CLI;12/12atenderam aos critérios, sem tentativa inválida/incompleta. [Comandos, ambientes, exits e resultados](raw-result-index.json), [premissas sintéticas de identidade](S01.physical-identity.json), [fixtures mínimas](fixture-manifest.json). Nenhum alvo foi importado, avaliado ou executado. MATCH sintético atesta bytes/inventários físicos, sem atestado npm/SRI. As173execuções do produtor não fundamentam o veredito independente.

Limites: amostra finita, duas autorreferências verificadas por oracle/kernel sem CLI, compatibilidade default/P1 em um fixture, sem suítes amplas ou gates. BI04 está parcial (crítica concluída; gates pendentes) e BI05 permanece com o Lead. Nenhuma qualificaçãoB6/produção ou regra positiva0237. Sem escrita de fonte/contrato/evidência anterior, commits, instalação, rede, PG, Docker ou descendentes.

Round1 concluída; próximo passo do Lead: gates/verificador e projeções correntes, reconciliação dos ledgers e promoção guardada conforme autoridade existente. [Inputs e SHA256](input-manifest.json), [critérios congelados](criteria.json), [manifesto de artefatos](artifact-manifest.json).
