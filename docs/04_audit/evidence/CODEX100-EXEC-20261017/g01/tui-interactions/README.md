# G01 — comandos, eventos e interações TUI

Unidade T1 de `DX100-G01:MAP-TUI-INTERACTION-SURFACES`, sob o
[contrato congelado](contract.json). O objetivo integral continua ativo. Este
pacote vincula fontes; não qualifica funções nativas do Operational Harness.

| Frente                         | Evidência e limite                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Comandos](commands/README.md) | 65 variantes, atributos/grafias candidatas, disponibilidade, 63 braços sem argumentos e 26 com argumentos, composer e dispatch. Tiers de modelo e alias de Goal preservados como famílias dinâmicas. |
| [Eventos](events/README.md)    | 291 variantes/477 campos, produtores, consumidores, imports e chamadas candidatas. Todos os eventos têm braços no dispatcher central; execução e entrega no canal continuam abertas.                 |
| [Views](views/README.md)       | Oito requisitos U01, 14 famílias de fonte, ações/keymaps/defaults, panes, composer, render, mídia e acessibilidade; herança modular e gramática de macros não são avaliadas.                         |
| [Censo](scope/README.md)       | 1.131 paths Rust TUI/src, fontes adicionais de targets, imports/includes, módulos/cfg e assets auxiliares; testes e suporte retidos.                                                                 |

O [integrador](integrate.py) autentica manifestos estritos, fontes Git e todos os
trechos UTF-8, conserva os oito pacotes anteriores e cria os joins em
[integration.json](integration.json). Sua [verificação](verification.json)
inclui determinismo e negativos de omissão, ownership, contexto e falsa
qualificação. As verificações das quatro frentes têm controles próprios,
incluindo mutações de fonte somente em memória. Os comandos e exits observados
pelo Lead são registrados separadamente da entrega dos workers.

Cada comando recebe o requisito de entrada `CDX100-17-01` e, quando cabível,
links candidatos aos requisitos de efeito já existentes. Por exemplo, Pets liga
ao `CDX100-17-08`, de U02, e Voice aos requisitos de mídia. Isso conserva os donos
de domínio. Um `AppEvent` literal em um braço ou uma referência de view cria um
join candidato; não prova causalidade completa nem transfere ao dono da TUI a
responsabilidade pelo efeito. O ownership detalhado dos efeitos dos eventos
permanece explicitamente aberto para consolidação e qualificação.

São famílias futuras de variantes por comando, evento e família de view, todas
`NOT_RUN`. Não são novos recibos ou aumento automático do denominador. Há também
duas famílias dinâmicas de comandos; seus valores dependentes de catálogo/conta
não viram uma enumeração finita inferida da fonte. A consolidação de G01 deverá
integrar essas famílias à matriz canônica, manter variantes compartilhadas entre
superfícies e resolver lacunas sem apagar obrigações.

Reprodução somente leitura, depois das quatro verificações de frente:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/tui-interactions/integrate.py --check
```

Os readers de comandos/censo importam apenas um helper local de auditoria
previamente revisado e autenticado. Eventos/views usam leitores próprios. Nenhum
deles importa ou executa o alvo. A [primeira falha lexical](first-scope-lexer-failure.txt)
preserva o caso de string continuada não coberto pelo helper histórico; a extensão
é local e o helper anterior permanece byte a byte intacto.

O catálogo normativo permanece com 487 obrigações funcionais e 22 controles,
todos `NOT_RUN` e zero recibos. Os seis gaps SDK e cinco limites externos
anteriores são conservados. Permanecem obrigatórios G01, autenticação da
referência/oráculos G02, aceite de reuso G03 e SPEC/gates G04. Nenhum grant CVG,
BUILD de runtime, paridade integral ou release é concedido por este inventário.
O parecer independente e a verificação final são acrescentados ao fechamento.
