# Próximo delta da mesma frente HISO-005

Esta é uma preparação documental, sem nova autoridade de BUILD. A [SPEC0236](../../../../02_spec/0236_b6_semantic_boundary_proof.md) aprovada continua sendo o contrato do kernel v1. O [inventário atual](remaining-semantic-frontier.json) e o [relatório](REPORT.md) registram os casos reais; nenhuma recusa foi convertida em PASS.

A proposta concreta seguinte está na [SPEC0237](../../../../02_spec/0237_b6_runtime_resolution_profile.md), em revisão documental independente. Seu [estado próprio](../../HISO005-P2-RESOLUTION-SPEC-20261018/state.json) separa a preparação T1 da autoridade futura de BUILD. Este fechamento0236 não concede essa nova aprovação.

A primeira evolução proposta é demonstrar a resolução de módulos nos perfis efetivos do harness, antes de acrescentar resumos de bibliotecas ou mudar runtime. A árvore atual contém 569 recusas por symlink e 522 por resolução ambígua. Esses números são ocorrências e podem ter dependências comuns; não são uma promessa de redução de 1.091 diagnósticos nem de fechamento B6.

## Contrato a especificar antes de novo código

1. **Workspace físico.** Resolver links internos de workspace até fonte/emit regular no mesmo root, vinculando cada link, manifesto e alvo canônico. Registrar caminhos lógico e físico e revalidar a cadeia antes/depois. Destino de produto continua violação conhecida; escape, ciclo, troca de link, identidade indisponível ou limite conservam UNKNOWN. Links não concedem identidade0234 a pacotes externos nem removem os 303 nós instalados originais.
2. **Exports e condições.** Declarar exatamente os perfis Node22 ESM/CJS permitidos e o algoritmo de seleção. Demonstrar a correspondência ao resolvedor pinado sem carregar ou executar o alvo, com fixtures físicas e oracle independente. Registrar manifestos e sondas de ausência que influenciam cada decisão. Condições extras, hooks, browser, fallback não modelado ou interop não provado continuam UNKNOWN. Uma alteração de perfil invalida as provas dependentes.
3. **Código executável e tipos.** `.d.ts` não substitui implementação e não é dispensado por sufixo. Qualquer classificação como não executável requer a prova de resolução/não alcance prevista na0236. TSX, emit sem receita correspondente e projetos fora da proveniência compilada v1 continuam abertos até contrato próprio. Não trocar o runtime efetivo por resolução de tipos.
4. **Semântica existente.** O novo resolvedor apenas entrega alvos reais e premissas verificáveis ao K0–K7. Não acrescenta resumos de `vi`, shutdown, getters, Proxy, nativos, processos ou bootstrap ambiental. Resolver uma aresta não prova o corpo do módulo. Entrada externa, efeito opaco ou sucessor não fechado impede a prova consumível.

## Evidência mínima do delta futuro

- Positivo fechado em JS puro com workspace interno e exports resolvidos sob cada perfil declarado; todos os corpos e identidades necessários presentes.
- Negativos com link externo, link para produto, ciclo, troca durante aquisição, conditional export para produto, pacote aninhado, condição desconhecida, import/require divergentes, declaração distinta da implementação e manifesto mutado.
- Diagnósticos e nós antigos preservados por multiset, novas ocorrências com identidade própria; normal/strict equivalentes e nenhum aceite parcial diante de UNKNOWN.
- Worker único supervisionado e limites explícitos; nenhum target executado pelo resolvedor. Insumos físicos e bytes do algoritmo/oracle identificados.
- Revisão independente da fonte congelada, regressões e certificação atual com verificador corrente, consumidor fresco e promoção por pré-imagens.

O próximo documento deve fechar o algoritmo/oracle, perfis e limites concretos e receber revisão humana T3 antes de novas transferências positivas. A constituição D-12 e a seção5 da0236 exigem esse delta; a aprovação0236 não precisa ser repetida para os reparos já concluídos.

Mesmo após esse passo, permanecem os impedimentos de execução externa, bootstrap, formatos, parse, interop e outras configurações. Provar nativos, alterar a capacidade pública do sandbox ou substituir o bootstrap ambiental é outra decisão de contrato; nenhum desses casos pode ser aceito por observação de uma execução ou por confiança no nome do pacote. O objetivo continua a prova integral e nova B6, dentro da mesma frente.
