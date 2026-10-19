# G01 — registro aditivo de fontes, variantes e lacunas

Unidade T1 de `DX100-G01:CONSOLIDATE-VARIANT-REGISTRY`, sob o
[contrato congelado](contract.json). Os nove pacotes aceitos são reunidos sem
alterar o catálogo normativo ou conceder qualificação funcional.

| Entrega                                                       | Significado                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Projeções](projections/README.md)                            | 19.947 fragmentos tipados de contratos, variantes, campos, schemas, config, idiomas, metadados, suporte e futuros oráculos, com input/JSONpointer/digest autenticados. São registros de evidência, não 19.947 funções. |
| [Complemento dos 179 requisitos](capabilities/README.md)      | 1.828 ligações candidatas explícitas, 124 ocorrências de corpos semente e 976 dimensões propostas de teste. Seletores resolvidos não fecham a semântica dos requisitos.                                                |
| [Integração](integration.json)                                | Todos os 487 requisitos funcionais recebem relações de fonte; os 22 controles CVG continuam separados de funções do Codex. Owners normativos permanecem intactos.                                                      |
| [Lacunas e decisões](remaining-gaps.md)                       | Pendências por família, SDK, execução e correlação de efeitos; G01 permanece aberto.                                                                                                                                   |
| [Primeira jornada nativa proposta](first-native-journey.json) | 18 variantes futuras de thread/turn, stream, loop governado, cancelamento, resume e integridade, com observações reais do código CVG e dependências G02/G03/G04. Não é SPEC aprovada.                                  |

O [integrador](integrate.py) confere os dois manifestos de lane, os 386 arquivos
e nove manifestos anteriores e cada objeto normalizado por JSONpointer/digest.
Quatro filhos de packaging recebem projeções adicionais de suporte, preservando
seus objetos de origem. O [resultado](verification.json) registra determinismo e
negativos. Nenhuma reclassificação do suporte em função é aceita.

Há 1.078 relações nas quais o owner literal do papel de fonte difere do owner do
requisito e 226 relações sem owner de fonte informado. O registro conserva ambos
os papéis, sem transferir responsabilidade normativa ou inventar um owner
ausente. Por exemplo, uma declaração Python de RPC pode pertencer à fonte A01 e
dar suporte a um requisito de API D01. Isso não é, por si, conflito de domínio
resolvido. A [primeira falha do integrador](first-integration-owner-disposition.json)
preserva a suposição inicial incorreta e sua correção, além do ajuste de paths.

Os 15.153 fragmentos sem atribuição preservam seu tipo. Muitos são contexto,
metadata ou tipos privados; o número não representa funções faltantes. Os
291 eventos internos da TUI conservam a correlação de efeitos aberta, sem impor
reprodução literal de tipos privados Rust. Continuam obrigatórios os resultados
expostos por comandos, APIs e interações, sob seus donos de domínio.

Reprodução somente leitura, depois dos readers das duas lanes:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/integrate.py --check
```

A inspeção CVG da proposta confirmou que `packages/sdk/src/server.ts` seleciona
`single_pass`, e o contrato `ModelGateway` usado ali expõe `complete()`. A
composição iterativa exige orchestrator e step store explícitos. Essas fontes
impedem tratar a jornada sintética existente como prova de stream incremental ou
loop de ferramentas Codex. A SPEC futura deverá concretizar esses contratos;
eventos fabricados depois da resposta final não comprovam streaming real.

O catálogo mantém 487+22 registros, status/CVG `NOT_RUN`, observações históricas
da referência e zero recibos. Os 179 aceites específicos, seis gaps SDK, cinco
limites externos e demais provas continuam abertos. Este registro não fecha G01,
fonte/binário, G02/G03/G04, BUILD, paridade nativa ou release. O parecer
independente será registrado no fechamento, com seus inputs exatos preservados.
