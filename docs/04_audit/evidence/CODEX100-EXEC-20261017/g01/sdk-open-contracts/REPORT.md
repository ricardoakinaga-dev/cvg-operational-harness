# G01 — contratos restantes dos SDKs reconciliados na fonte

UnidadeT1 `DX100-G01:RECONCILE-OPEN-SDK-CONTRACTS` **concluída no recorte de fonte**, snapshot openai/codex8d9f6466. [R2 independente](review-r2/report.md): ACCEPT_BOUNDED_SOURCE_CONTRACTS,15checks/zero obrigatórios. [Aceite delimitado](acceptance-status.json) e [conferência do Lead](Lead-review-acceptance-r2.json). Foram reconciliadas as seis lacunas obrigatórias com seus donos e requisitos existentes. [Integração](integration.json), [contratos Python](python-contracts.json), [contratos TypeScript apresentados](typescript-report.formatted.md) e [limites dos oráculos](oracle-boundaries.json). Os seis gaps continuam OPEN; fonte não é paridade funcional ou fechamento globalG01.

O censo histórico Python25 foi preservado e explicado:20requests literais,1notification initialized semACK e4encaminhamentos genéricos abertos. Todos os21seletores literais têm ID real do catálogo na classe correta. Os tipos de resultado têm binding à classe local importada ou continuam explícitos como modelo do caller/resultado interno; a conversão/validação Pydantic é outra fronteira. [Bindings de transporte](python-rpc-bindings.json).

Há350 relações de fonte com alvo selecionado, incluindo7cadeias de dois receivers e32referências de callable passadas a bridges. Oito declarações/construtores sustentam esses vínculos; AsyncThread/AsyncTurnHandle usam `_codex→_client`, sem atalho fictício. Lambda e encaminhamento são marcados separadamente; não representam350funções, chamadas realizadas ou grafo completo de dispatch Python. [Relações](python-call-edges.json), [evidência dos receivers](python-alias-evidence.json).

Vinte cenários Python e24TS/wrappers ligam ramos/defaults/erros/cleanup a fontes e provas futuras.33declarações geradas selecionadas preservam bases, aliases, defaults e ConfigDict; o inventário completo anterior permanece intacto. A dependência declarada pydantic>=2.12 e o lock2.13.4/core2.46.4 são fatos de fonte, sem biblioteca importada ou semântica herdada comprovada. SDK/runtime fonte0.0.0-dev, runtime distribuído0.153.4, mínimo0.151.0, lock, Git e referênciaCLI são identidades distintas. [Modelos](generated-boundaries.json), [proveniência/plataformas](versions-and-packaging.json).

Quatro separações precisam orientar o futuro BUILD/qualificação:

- O cliente Python responde accept por padrão a dois requests de approval. Esse dado de cliente não pode conceder a autoridade institucional do harness; paridade literal e controle governado seguem separados.
- Campos novos passam por guard de versão ou schema do mesmo executável/config. Metadados CVG verdadeiros e compatibilidade real são requisitos; não falsificar versão para contornar o guard.
- O SDK TS pode retornar agregados parciais em certos EOF/error. Retorno do cliente não é prova de terminal nativo SUCCEEDED; journal/settlement/terminal devem ser observados independentemente.
- Fechar stream, cancelar task, chamar finally ou enviar sinal não prova fim do processo nem ausência de efeito. Goalcancel, ordinaryturncancel e normalreaderclose possuem ramos diferentes.

O Lead verificou24fontes Python e o scout12fontesTS; blobsGit/bytes/linhas e relações selecionadas estão autenticados. Oito grupos estáticos e24contraprovas do Lead passaram; a laneTS informa dez contraprovas estáticas e ausência de ponto selecionado sem anotação lexical. [Verificação](verification.json), [verificaçãoTS](typescript/verification.json). Não são34testes de runtime, nem exaustividade semântica. SDK/app/provider/Codex não foram importados/executados; não houve rede, instalação, PG/Docker ou gate amplo.

As hipóteses de junção que falharam durante construção foram preservadas: [request versus notification](source-binding-recovery.json) e [receiver async de dois níveis](alias-binding-recovery.json). A formatação do relatório bruto do scout falhou; os18outputs originais ficaram intactos, com [view própria formatada](typescript-report.formatted.md) e [disposição](format-recovery.json). Nenhum desses ajustes altera a fonte SDK ou esconde teste funcional falho.

R1 independente retornou REVISE/18checks/doisP2: precedência invertida de threadId e contrato insuficiente do cancelamento de goal. Um reparo agrupado corrigiu PY04/13/14 e acrescentou [fatos de overlay e controle](payload-and-goal-facts.json) com16exemplos de dados e guards de fonte. \_params_dict em resume/fork fica à direita: o paramsB/null pode prevalecer sobre argumentoA; \_start_turn tem ordem inversa. O startup goal usa shield/worker/callback/cleanupdaemon, enquanto cancel tenta pause e até dois interrupts sob predicados exatos; nenhum desses futuros foi executado. Cinco preimagens preservam os70inputsR1. [Resposta ao parecer](repair-response.json). A R2 final do mesmo crítico aceitou este reparo,15checks/zero obrigatórios; o ator foi encerrado. Doisreviews/umreparo agrupado consumidos, sem terceira revisão automática. A R1 permanece REVISE histórica,70inputs reconstruíveis; R2/95 também reconstruível por uma preimagem do índice de apresentação e94inplace. SPEC0239/oitoanexos e seu pedidoT3ccdf3a75 continuam intocados/pendentes;0221/0225/0231 seguem resolvidos, sem repetição de pergunta. Catálogo487+22/509NOT_RUN/nullreceipt,14CQ/22famílias/49cartões/10fases preservados. Ledgers99/20/30/0190dirtyreadonly recebem delta nohandoff próprio. Não há BUILD, release, produção, commit ou push nesta unidade.

Reprodução somente da verificação de dados/fonte, a partir da raiz, sem escrita:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-open-contracts/verify-source.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-open-contracts/typescript/reader.py --check
```

## Próxima ação e limites do ambiente

[TaskT1 pronta](next-task.json): definir um perfil honesto e finito de referência SDK, com fonte/interpreter/compiler/dependências/config/driver/observer autenticados e contenção/cutpoints/cleanup antes de executar alvo. [Observação posterior ao freeze](reference-prerequisites.json), não usada pelo crítico para conceder este aceite: Python3.12.3 em modo-I não encontrou Pydantic/SDK/runtime no perfil consultado e packaging24.0 está abaixo do mínimo26.2; o parserTS6.0.3 não é o compiler^5.9.2 declarado. Não prova ausência em outros ambientes. Nenhuma dependência foi instalada ou SDK executado.

[Checagens finais](closure-verification.json) autenticam o checkpoint documental, não execução de SDK ou runtime nativo. O pedidoT3 daSPEC0239 segue pendente, sem repetição de pergunta ou aprovação inferida. Próximo perfilG02 é trabalho obrigatório independente; a integração nativa e as dependências dos owners continuam obrigatórias.
