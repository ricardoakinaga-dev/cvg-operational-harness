# Comandos slash — fonte pinada

Unidade T1 do [contrato pai](../contract.json). O [leitor](reader.py) liga as
65 variantes de `SlashCommand`, em ordem de apresentação, aos atributos Strum,
descrições, regras de disponibilidade e braços do dispatcher. O
[inventário](inventory.json) preserva os corpos completos das funções
selecionadas; a [verificação](verification.json) registra os controles do leitor.

Há 63 braços de dispatch sem argumentos e 26 com argumentos, incluindo grupos,
guards e fallback. Isso não significa 89 comandos diferentes. São 90 corpos
selecionados, 78 nomes de chamadas simples `self.method(...)`, 92 definições
candidatas e 50 arquivos fonte autenticados. Uma definição com o mesmo nome
continua candidata: receiver, impl, herança de cfg e execução ficam abertos.
Chamadas encadeadas, outros receivers, traits e macros permanecem visíveis nos
corpos e não recebem falsa ligação de tipo.

O menu usa visibilidade e filtros; a busca por comando digitado substitui alguns
filtros para permitir erro específico no dispatcher. O composer prepara texto,
anexos e histórico, enquanto a validação do dispatcher pode preservar o draft.
Essas etapas não são intercambiáveis. Há regras distintas para thread
indisponível, tarefa ativa, review, fila, conversas laterais, conta e plataforma.

Os 11 campos de `BuiltinCommandFlags`, as declarações de `ServiceTierCommand` e
`SlashCommandItem`, a transformação do catálogo de tiers, sua inserção após Model
e o dispatch específico são preservados. Os tiers são uma família dinâmica
obrigatória; a fonte não determina todos os valores de modelo/conta. A família
de alias de Goal também conserva a sintaxe do prefixo, sufixo, predicado de byte
e overrides de lookup. Kebab-case e atributos Strum são candidatos de grafia;
a expansão da macro e os resultados reais do parser continuam pendentes.

Reprodução somente leitura, na raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/tui-interactions/commands/reader.py --check
```

O leitor importa exclusivamente o helper local de auditoria previamente revisado
e autenticado, sem importar código do alvo. A extensão lexical é local, para
strings continuadas, literais Unicode e raw strings byte/C. Duas reconstruções
devem coincidir. Sete mutações de artefato e seis mutações de fonte em memória
detectam omissão, alias, disponibilidade, calls, filtros e staging; as últimas
comparam projeções extraídas além do hash. Nenhuma fonte upstream é alterada.

O manifesto estrito da pasta é validado pelo integrador pai. Os joins de
comandos, eventos, views, requisitos e contexto modular pertencem ao pacote pai.
O catálogo permanece readonly, com zero recibos. Este mapa não comprova
disponibilidade compilada, paridade nativa, fechamento de G01, grant CVG ou
release. G02/G03/G04 e os limites herdados continuam obrigatórios.
