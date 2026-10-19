# C100-G03 — reconciliação de reuso da primeira jornada

ExecuçãoClaude100,17/10/2026. Insumo:[scoutHerschel](reuse-scout.txt), somente leitura, contexto separado. Não é nova certificação nem promoção de estadoPAR.

## Saldo atual

O [inventário datado](reuse-inventory.json) cobre os58cartões do fecho, seus consumidores e os hashes das seções lidas; é evidência de reconciliação, não controlador de tarefas. Os estados vigentes continuam exclusivamente no0380. O envelope herdado conserva625dias nominais e desconto zero por falta de qualificação integrada; isso não afirma ausência de código nem reestima individualmente cada entrega.

R1 da revisão independente encontrou erro no extrator: DOTALL no título absorvia a cauda do arquivo e deixava metadataUNKNOWN/null. A [saída defeituosa](reuse-inventory-r1-parser-failure.json.gz) e o parecer original foram preservados. R2 limita título à linha do cabeçalho e seção ao próximo cabeçalho de cartão/fase. Cada registro informa linhas start/end_exclusive (1-based, fimexclusivo), hash dos bytes dessa seção e metadata própria. Os58registros agora são confrontados campoacampo com as seções, incluindo dependências; dez adulterações documentais são recusadas pelo verificador do Lead. Isso corrige o inventário, sem qualificar um PAR ou descontar esforço.

Os nove pré-requisitos deQ01 sãoQ03,Q04,K01,K03,S01,X01,X02,X03,X04. Nenhum teve prova localizada de entrega integrada e qualificada paraClaude100 no mesmo candidato. Portanto, o saldo do plano não recebe desconto por existência de arquivo, autorização parcial,aceite local ou pipeline de outra candidata.

- K01/0217 e K03/0224 têm BUILD sintético aprovado nos escopos próprios. As implementações completas em andamento permanecem na worktreePARE100, sem promoção ao checkout nem aceite global.
- 0221/0222/0225 foram aprovadas somente com os ajustes do registro decisório; fontes atuais ainda contêm a versão anterior. Aplicar apenas os ajustes listados e obter revisão técnica antes do BUILD correspondente; não presumir que o hash original permite ignorar condições.
- Q03 e Q04 são T2 e não têm dependência de novos gates humanos se a mudança for estritamente de suporte privado, sem contrato público, segurança de runtime ou lockfile compartilhado. Cada nova unidade exige task/claim/SPEC curta e os gatesT2. Não reabrir a unidade224 encerrada emREVISE/TH06.
- X01–X04 não estão demonstrados como serviço/contensão completa e mantêm seus gates de contrato/segurança. Os wrappersbwrap atuais não provam Landlock real ou política persistida por sessão.

## Propriedade e autoridade

WorktreePARE100, controllerAUD0592 e carteiraCODEX100 permanecem de seus donos. Uma nova extração de test-support deve usar paths/candidata próprios e preservar cada família de testes original; o statusPAR só muda no0380 quando houver integração e prova suficientes.

O pedido de implementar o plano autoriza executar trabalho disponível, mas não substitui a revisão de SPECnova T3/T4 que o próprio objetivo conserva. O reuso aprovado é verificável nos registros0217/0224 e na decisão de16/10; nada é marcado como aprovado por associação.

Migrations conservam ordem0029→0030/0225→0031/0221.0220/0226 adiadas não são retomadas implicitamente. O trabalhoB6/0228 possui claim próprio e seu estado deve ser lido nos registros correntes, pois a autorização pode ter sido atualizada após os ledgers.

## Unidade independente em execução

A [SPEC0230](../../../02_spec/0230_private_governed_test_kit.md) delimita uma extração T2 **privada** do kitQ03: normalização explícita de logs, manifesto de suíte e portas sintéticas compartilhadas por três famílias reais de testes. Baseline focada103/103PASS, antes de código, na candidata própria7ecc5b53. BUILD em execução; integração e qualificação ainda pendentes. Nenhuma API/contrato de aplicação ou capability é alterada; caso o desenho exija export público ou mudança de segurança, subir paraT3 e obter a revisão antes de código. Esse trabalho não substitui os nove pré-requisitos da jornadaM1 nem concede paridade ao programa.
