# Export da fonte pinada e schemas do companheiro

O pin inclui um arquivo pré-computado de exports experimentais, usado pelo código de produção para gerar schemas e TypeScript. O [comparador](../compare_pinned_exports.py) descomprime esse arquivo como JSON e compara seus membros com a captura REA do companheiro instalado. Não compila nem executa o alvo.

[Resultado](comparison.json): 452 schemas na fonte e no companheiro, com **423 arquivos idênticos byte a byte e 29 estruturalmente diferentes**. Nenhum arquivo extra no companheiro. A comparação registra hashes de todos os membros e diferenças por JSON pointer, sem concluir compatibilidade semântica ou identidade de build.

A fonte de geração exclui explicitamente `getConversationSummary`, `gitDiffToRemote`, `getAuthStatus`, `rawResponseItem/completed` e `rawResponse/completed` do JSON público. Portanto, a ausência desses cinco contratos é explicada pela política de export. Seus caminhos de execução e obrigações continuam preservados; essa explicação não torna fonte e binário equivalentes.

O arquivo também contém 897 exports TypeScript e nenhum membro `internal_json_schema`. Estão preservados seis tipos legados e quatro envelopes JSON em [reference](reference). O export não substitui a reconciliação com os tipos Rust e suas regras de serialização.

```text
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/entrypoints/compare_pinned_exports.py
```

Próxima ação: reconciliar as 29 diferenças e usar dados do pin na matriz de variantes, mantendo as lacunas entre tipos Rust, dados pré-computados e referência executável explícitas. A matriz anterior continua identificada como projeção do companheiro; seus hashes e pareceres anteriores não são reescritos. Nenhuma obrigação foi removida ou qualificada.
