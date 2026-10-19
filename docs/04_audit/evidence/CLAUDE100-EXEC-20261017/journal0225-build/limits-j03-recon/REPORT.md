# J03 — alcance dos limites e lacunas de prova

O scout Schrodinger entregou uma investigação estática de14entradas, sem
veredito de runtime ou código. Lead conferiu6inputs,5artefatos,17links e
reexecutou o modelo aritmético independente com resultado idêntico.
[Resultado original](agent/REPORT.md),[mapa](agent/map.json),
[manifesto selado](agent/evidence-manifest.json) e[conferência Lead](lead-acceptance.json).
O manifesto f5b00231618608baa8a6e66528996847fc003ab322f3304c3004161fd6d88450
permanece intacto. Orçamento de crítica de código continua0/2.

| Limite             | Conclusão estática e prova ainda necessária                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1048576bytes/+1    | Strings ASCII e combinações de escapes atingem os dois pontos. A porta nativa deve comprovar aceite/rejeição e preservação do estado.                                     |
| depth64/65         | Arrays aninhados atingem ambos com poucos bytes, contagem de raiz1. Falta o controle nativo específico.                                                                   |
| 1000000nós/+1      | Não isoláveis sob1MiB: N valores exigem ao menos2N−1bytes. A própria aprovação0225§11.1 exige separar seam do componente e dominância pública de bytes. Não aumentar cap. |
| data1398104/+1     | O primeiro ponto é atingível; +1 não é múltiplo de4, incompatível com base64 canônico. Não chamar a rejeição conjunta de prova isolada do cap.                            |
| envelope1398616/+1 | Com4campos válidos, overhead normal modelado144 dá1398248. O scout conserva UNKNOWN para a representação PG incondicional e prova pré-driver.                             |

O [caso nativo atual](../native-1792334017586-capture/journal-limit/before-reader.json)
observou1048576bytes lógicos,1398104caracteres base64 e1398248bytes no
payload::text. Isso concorda com o modelo, mas não prova sozinho todas as
formas do serializador. O [recurso pinado](../capture-j12-final-resource-checkpoint.json)
reportou PostgreSQL16.15. Nenhum cap foi reduzido ao valor observado.

Próximo trabalho: fechar HOW em[j03-native-preparation](../j03-native-preparation/plan.json)
para controles nativos de bytes/escapes/profundidade e prova explícita de
estágios de alocação. O driver instalado evita chamar seu parser para SQLNULL;
leitura da fonte não substitui teste. Um seam de fonte virtual SQL pode testar
CASE/driver como componente, sem fingir linha persistida inválida sob constraints
validadas. Preservar essa distinção e a lacuna nativa quando aplicável.

As fontes e o pacote do scout permanecem readonly. Não é waiver, nova autoridade,
prova de paridade ou encerramento de J03/SPEC0225. Todo requisito não comprovado
continua pendente para Lead, revisão independente e gates completos.
