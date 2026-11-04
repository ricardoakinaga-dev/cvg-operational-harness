# Integração seletiva na base publicada

Os três componentes próprios foram transportados por hunks para uma candidata privada baseada em `a2f345a3b7fac79f8a1506d369b9371f92e187c8`. São sete caminhos: assets nativos, cleanup interno e captura dos perfis do gateway. Nenhum merge da branch doadora, alteração de produto ou lock foi incluído. A [SPEC0312](../../../../02_spec/0312_codex_component_main_intake.md) define a unidade T2. Revisão independente e gates globais desta base ainda pendentes nesta fotografia.

## Evidência executada

- Baseline do gateway com as três regressões aplicadas primeiro: 17 PASS e 2 FAIL, exit1. Após a correção: 321 testes do gateway, 37 de cleanup e 16 de assets, total374 em20arquivos, zero falhas/pendentes. O alvo não contém os oito casos de budget-placement da base doadora; esse código alheio não foi importado.
- Regressão complementar original: oito casos de host e três de runtime-image-contract, total11 em dois arquivos. Total executado385/22arquivos. Brutos JSON ficam na candidata em `.main-intake`; serão copiados ao freeze para revisão.
- Typecheck, lint dos sete caminhos, formato e build real dos vinte workspaces PASS. O primeiro typecheck falhou porque o checkout reduzido omitia quinze arquivos originais de `examples`; esses bytes foram materializados do mesmo commit, sem patch de código, e o mesmo comando passou. A falha original permanece em `checks/typecheck.json`.
- Cinco pacotes foram empacotados com `npm pack --offline --ignore-scripts`, extraídos para consumidor físico sem links e conferidos byte a byte contra o build. O mesmo oráculo original SHA256 `45c7c4500bb7df36f61fbf7e8b484d9c0c42a8daf0cc588f4f04d73034594a23` passou nove cenários, exit0/0,181s. Recursos ativos antes/depois: somente `PipeWrap` herdado, sem aumento.
- Comparação estática TS6.0.3: declaração do gateway idêntica; módulo interno do host inclui os seams de cleanup previamente previstos. A declaração da classe pública `KernelHost` é idêntica. Manifests de exports e barrels fonte são byte idênticos aos do alvo; pacote do harness apresenta210 nomes raiz, gateway38. Isso não é comparação de dois builds completos da main.
- Lock do alvo `e1ff410e164e6ee39eeb98b93029d116e386d3008e9e822fa705584ef566549e` preservado. Dependências físicas conferidas:17605arquivos e50links internos na candidata; o consumidor empacotado não usa links.

## Limites

A preparação inicial deixou o índice privado vazio; a correção ocorreu antes de qualquer patch ou execução de aplicação e está preservada em `setup-attempt-r1.json`. Os registros distinguem essa falha de preparação, o RED deliberado e o typecheck inicial incompleto de falhas de aplicação.

Checkout reduzido não concede qualificação global. Nenhum T2 completo, PostgreSQL, E2E ou certificado desta base foi executado. A certificação separada da fonte5be segue na sessão96143 e não será convertida em certificado deste port. Não existe promoção canônica, push ou aceite de paridade por este relatório. O objetivo integral permanece18KR/12CLI/CQ01–14; contratos públicos pendentes mantêm seus gates.
