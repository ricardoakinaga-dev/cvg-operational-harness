# Handoff ao Lead — EXEC-TRANSITIVE-EXTERNAL

Entrega `IMPLEMENTED`, T1, sem aprovação independente e sem fechamento de G01.
Worker direto, sem descendentes; nenhum slot adicional consumido. Zero
retrabalhos por crítica até esta entrega, limite dois; slot posterior do crítico
preservado. Não houve alteração de internals, integrações, catálogo, ledgers,
backlogs, fontes CVG, locks ou pacotes anteriores.

O join deve usar os IDs estáveis em `inventory.json.crates[]`:
`external:serde_json::Value`, `external:url::Url`, `external:uuid::Uuid`.
`original_owners` preserva as seis refs originais (4/1/1). O Lead informou 17/32
operações transitivamente externas e um vínculo aditivo `initialized.params`
antes classificado builtin; essa integração é responsabilidade do Lead e não
é contada como owner histórico adicional nesta lane.

Os três archives oficiais têm SHA256 igual ao lock pinado. São 303.160 bytes
comprimidos e 1.644.415 bytes regulares, 137 members; 24 membros selecionados,
141 sources, 246 declarações locais, três codecs, seis variantes Value,
2.503 spans lexicais e 2.677 spans verificados. Os 38 controles negativos
rejeitaram mutações. Duas gerações produzem bytes idênticos. A baseline de
253 arquivos históricos/contratos/catálogo permaneceu íntegra no check.

`binding.qualification` é texto histórico congelado de antes do download;
`source_status` registra a situação atual da fonte autenticada. Nenhum deles
fecha runtime: `qualified_runtime=false`, `functional_receipts=0`, cinco
limites explicitamente `OPEN`. O pacote não executou/compilou crates ou alvo,
não resolveu a closure Cargo nem auditou dependências terceiras completas.

O check é `python3 -B .../external/reader.py --check`. Requer cache próprio e
objetos Git locais; não busca rede. `--write` regenera inventory/verification/
manifest. `--fetch` só lê os três archives pinados; downloads desta entrega
sem falha de rede/checksum. A primeira falha de preparação (diretório existente,
verificado vazio) está preservada em `first-preparation-output.txt`; não foi
erro dos sources. Uma consulta exploratória ao member inexistente
`uuid/src/external/mod.rs` foi corrigida por leitura de `src/external.rs`,
sem executar código ou omitir o cfg serde; saída preservada separadamente.

Próxima ação: Lead unir estes três IDs aos contratos internos/32 operações,
preservar o adendo initialized e os históricos, congelar o pacote integrado e
encaminhar ao crítico independente. Só o Lead atualiza continuidade externa
ou ledgers concorrentes. Os cinco limites OPEN e demais gaps globais seguem
obrigatórios após esse join. Sem autoapprove, commit, push ou deploy.
