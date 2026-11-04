# CI003 — testes de inventário/contexto e defeito reproduzido

Oferta1873169, ACK1875104 e gateHOWR2 aprovado1859652. SubtarefaT2 somente testes, na candidata própria `ci003-inventory-codex-20261101/candidate`, base `feeda7e8ff3938b70bceb470a34f02161128ca06`. Nenhuma fonte produtiva foi alterada por esta folha.

## Entrega concreta

[Patch de um único caminho](test.patch): `tests/coverage-project-inventory.test.js`. SHA-256 `5b0f57f8ea9df4f6192e7746bb4b1ca8c00de4a66ffe6dfef17865f8eee13089`. [Hash do teste congelado](test-freeze.json), [inputs do autor](inputs-manifest.json), [aceites](HOW.md) e [resultado bruto final](red-final.raw.json).

O teste foi construído e executado:58 casos,56PASS,2FAIL,0pending. **A API não está aprovada.** Os dois casos RED reproduzem uma recusa ausente/causa incorreta no input produtivo `coverage-guarded-pool.mjs` SHA `4e0ec6084166bc9cb782f0d60b18c7273e29c574c1579f83236d774503c5cd75`. O próximo passo técnico é reparo pelo autor e reteste dos mesmos58; não adaptar as assertions ao defeito.

## Contraexemplo causal

`admitCoverageContext` transforma o diretório pai de `/__cvg_inventory_fixture__/workspace` no path relativo literal `..`. A condição que recusa paths vazios, prefixo `../` ou absoluto não recusa esse valor.

- Quando o pai aparece em ambos os inventários, a promessa resolve com contagens6/3/3 em vez de recusar `coverage_test_outside_root`.
- Quando aparece somente nas especificações agrupadas, o fluxo chega a `coverage_test_inventory_changed`; há recusa, mas pela causa posterior, sem detectar que o path está fora da raiz.

Os dois casos são separados e usam a API pública real, versão4.1.12, projetos/pool/caps válidos e globs fake no formato público absoluto. Os testes não iniciam/importam arquivos de aplicação. O defeito foi comunicado em1880915; o hold de leitura do módulo foi explicitamente devolvido ao autor para reparar e publicar um novo hash congelado.

## Cobertura e controles

Os56 casos verdes incluem whitelist fixa de três B6, inventários core/all/com extras, contagens e imutabilidade, omissão/duplicação/substituição, cada selecionado ausente, partição errada,29 desvios de configuração e recusas causais antes de glob/start/collect/import. Os positivos exercitam os dois globs públicos; nenhum resultado de geração de cobertura real é inferido dessa simulação de contexto.

Node22.23.2/Vitest4.1.12, config/cache/resultados próprios e toolchain somente leitura. Lint, sintaxe e formato do único teste passaram. Três inputs copiados byteexatos do autor continuaram iguais ao manifesto; esses arquivos não têm crédito de autoria e não integram o patch desta folha.

A primeira fixture retornava paths relativos no globroot e causou4 falhas em54 casos. Ela foi corrigida para o formato absoluto da API; o resultado inicial está preservado em [first-result.json](first-result.json). Os negativos do pai foram separados para observar ambas as situações, sem reduzir o critério. O [resultado qualificado](qualified-red-result.json) e a execução final após formatação mantêm56PASS/2FAIL.

O teste congelado também rejeitou duas cópias conhecidamente incorretas: ignorar partição adiciona3 falhas causais e ignorar caps adiciona2, além das duas falhas já existentes do pai. [Controles](mutation-controls.json). Esses controles demonstram oráculos específicos; não convertem a API original em GREEN.

## Intake, reparo e continuação

Lead0410 recebe o patch de teste, mantém os dois negativos, corrige somente sua fonte e informa novoSHA congelado. Esta sessão pode então recopiar o input autorizado e executar os mesmos58 casos, registrando RED→GREEN ou o erro restante sem ocultar o histórico. Nenhum novo BUILD da fonte produtiva ou mudança de contrato foi assumido por esta folha.

S1/S3, S1–S7 completos e F01 continuam pendentes da implementação/integração/qualificação reais do Lead. A entrega de teste com achado não é revisão independente da CI003, não concede produção e não encerra o objetivo sequencial.
