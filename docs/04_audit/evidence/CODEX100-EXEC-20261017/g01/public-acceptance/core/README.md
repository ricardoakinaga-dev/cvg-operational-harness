# Aceites públicos — execução, estado e segurança

Lane `core`, CDX-01 a CDX-07: 58 requisitos históricos, 116 propostas de caso
(baseline e edge), sem qualificação funcional. [Casos](cases.json),
[contrato](../contract.json) e [validador documental](../validate.py).
Status de entrega: IMPLEMENTED, sujeito à integração e crítica independente.

As fixtures são propostas documentais de dados/estado/falhas sintéticos. Os
campos de projeção são observáveis propostos do driver de teste, não nomes
inventados do protocolo público. G02 precisa mapear cada campo a transcript,
estado ou efeito realmente capturado na referência autenticada. Configuração,
formato do estímulo, gramática/erros e suporte efetivo ainda exigem execução.
Nenhum caso desta lane foi executado no Codex ou no motor CVG.

A comparação proposta é exata sobre projeções nomeadas por capacidade. Valores
esperados vêm de captura autenticada G02 do mesmo caso. Somente renomeação
bijetiva de IDs e deslocamento da origem temporal são candidatos a normalização;
relações, ordem, duração, orçamento, efeitos e erros permanecem significativos.
Cada known-bad altera um campo projetado ou acrescenta/perde efeito. Seu ID aponta
para a assert que deve rejeitar a alteração no futuro comparador.

Seletores usados como operação inicial são ClientRequest no inventário pinado;
notificações ficam como observações. Sequências adicionais ainda são ações
propostas, a mapear pelo driver. Os snippets de funções históricas são contexto;
uma declaração de selector não prova toda a semântica esperada do caso.

Três eixos ficam sem cobertura por estes casos, com dono/evidência/gate:
interrupção do estado de turno (01-02), limite de custo (01-03) e pausa (01-05).
Isso não remove os eixos nem afirma que as demais variantes foram executadas.
Limites como grant, tenant, budget, checkpoint durável, sink de evidência e
revisor automático exigem SPEC CVG própria. Divergência governada não é igualdade
literal e não recebe aprovação por existir na fonte Codex.

Reprodução somente documental, na raiz:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/validate.py --lane core --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/validate.py --lane core --self-test
```

`--check` verifica contratos, donos, eixos, fontes Git/UTF-8 e manifesto sem
escrita. `--self-test` verifica onze violações estruturais/semânticas do documento,
sem executar fixtures ou comparar runtimes. [Comandos observados](commands.json).
G01, G02, G03, G04 e os gates de BUILD continuam necessários.
