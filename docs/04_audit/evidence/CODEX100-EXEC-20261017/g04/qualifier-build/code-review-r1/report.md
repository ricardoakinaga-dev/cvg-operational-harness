# CODEX100 — crítica independente da implementação, R1

**REVISE — 1 obrigatório (R1-01 / P1 / QK08).** A revisão cobre a implementação privada congelada em nove caminhos e a honestidade da evidência QK12. Não concede aceite global, paridade, CQ01–14, promoção ou release.

SPEC0231 integral: `e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af`. A aprovação humana real está registrada em `authority.json` e vinculada por `gate.json`; o status de draft no corpo imutável da SPEC não reabre esse gate. Candidata: `/mnt/ia/cvg-codex100-exec-20261017/qualification-candidate`.

## Obrigatório agrupado

### R1-01 — remoção de zeros finais com custo quadrático

- **Critério e fonte:** QK08 e seção “Números, JSON e bytes” da SPEC0231: “Coeficientes e trabalho permanecem lineares no input bounded.”
- **Código:** `tests/claude100/qualification/strict-json.mjs:102`, `digits.replace(/0+$/, '')`, SHA `2c62c4345dfa0eebad19d437e7dc46e9a76b9a443048e7d97540f9a5d5ff42f9`.
- **Contraprova:** `parseStrictJson('1' + '0'.repeat(n) + '1e-' + (n + 2), { numericDomain: 'CODEX_EXACT_DECIMAL' })`. O token é JSON válido, finito e converte a `0.1`, mas seu decimal exato contém uma parcela que deve ser recusada.

| Zeros internos | Bytes  | Tempo local Node 22 |
| -------------- | ------ | ------------------- |
| 10.000         | 10.009 | 63,03 ms            |
| 20.000         | 20.009 | 247,29 ms           |
| 40.000         | 40.009 | 1.014,75 ms         |
| 80.000         | 80.009 | 3.773,42 ms         |

A recusa semântica está correta; o trabalho até a recusa não é linear. A regex tenta o sufixo em cada início da longa sequência de zeros seguida por `1`, repetindo varreduras. O custo cresce aproximadamente quatro vezes ao dobrar o input. Não há expansão de potência/BigInt; o problema é o backtracking da própria regex.

A contraprova também alcança `qualifyCodex`: catálogo sintético de **644.381 bytes**, abaixo de 1 MiB, com o token de 40.000 zeros em `execution.synthetic_decimal`, recusado em INTEGRITY por perda decimal após **1.071,88 ms**. Fixture sem chave duplicada, hashes/receipts sintéticos rebinculados somente em TMP privado. Ver [controle final](controls/final-controls.results.json) e [amostras](controls/numeric-cost.stdout.jsonl).

**Correção exigida:** substituir o trim por trabalho linear limitado, por exemplo índice percorrendo o sufixo uma vez e um único slice. Preservar caps, rejeição decimal exata, -0, safeInteger, equivalências válidas e domínio Claude default. Acrescentar contraprova de coeficiente longo com expoente compensatório, no parser e no entrypoint. Reduzir caps, aceitar epsilon ou ocultar metadata não atende ao contrato.

**Rechecagem final R2:** novo freeze, revisão da varredura linear e crescimento limitado, contraprova corrigida, semântica numérica preservada e resultados focais atuais. Um retrabalho agrupado; nenhuma terceira revisão ou barra adicional.

## Demais critérios

| Critério | Julgamento limitado e evidência                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QK01     | Catálogo original 487 funcionais + 22 controles CROSS_CUTTING / 22 famílias; baseline509 byteidêntica à proposta; acréscimo reconciliado em família nova aceito; progresso não concede recibo.                             |
| QK02     | Troca de ID, permuta de famílias, mandatory indevido e recompensação de contagens recusadas.                                                                                                                               |
| QK03     | Duplicatas, órfãos, CROSS_CUTTING funcional/declarado, família desconhecida, tipos/campos/counts/IDs/pin inválidos recusados; perfis Claude/CodeX rejeitam o catálogo oposto.                                              |
| QK04     | Pares sintéticos funcionais e CVG_CONTROL elegíveis somente como MATCH_REQUIRES_REVIEW/PENDING; SHA bruto correto no relatório.                                                                                            |
| QK05     | Integridade precede origem e autoridade; origem/fixture/identity/collector/timeout adulterados não passam; decisão negada/pendente/escopo errado bloqueia; timeout autenticado é INFRA_FAILURE.                            |
| QK06     | Corpo, ordem, erro, efeito, identidade e custo divergentes geram MISMATCH com digests; normalização válida de IDs não apaga custo.                                                                                         |
| QK07     | JSON recusa i64 inseguro; EXACT_BYTES distingue i64 adjacentes/sinal e aceita par byteidêntico fora do domínio JSON.                                                                                                       |
| QK08     | Semântica e rejeição antes da projeção sustentadas; **FAIL obrigatório no custo linear**, R1-01.                                                                                                                           |
| QK09     | Guardas físicas compartilhadas preservadas; contraprovas próprias de symlink, traversal, diretório/FIFO, caps+1, saída exclusiva e snapshot após rename. Não repetida toda matriz de corridas de publicação.               |
| QK10     | Apenas qualify/qualifyCodex exportados; seleção privada fixa; sete flags e mau uso conferidos; import não executa main; options não desliga domínio CodeX.                                                                 |
| QK11     | Nove hashes antes/depois estáveis; 40 pré-imagens C100 originais iguais; somente três fontes compartilhadas autorizadas da candidata diferem das pré-imagens. Alterar vínculos não transfere crédito ou promove relatório. |
| QK12     | Relatórios reais conferidos, sem rerodar suíte completa: 399 assertions Claude preservadas por nome/status/multiplicidade entre 537 PASS / 0 FAIL / 0 pending. Gates amplos continuam separados do parecer de código.      |

## Evidência e limites

Procedimentos próprios em Node **v22.23.2**, TMPDIR privado em `/mnt/ia/cvg-codex100-exec-20261017/qualification-review-r1/tmp`. Foram executados 103 controles iniciais (102 PASS e um erro de fixture do revisor), oito suplementares, dois finais e quatro medições de custo. O erro do revisor selecionava a última row do catálogo como controle, embora fosse funcional; a candidata corretamente recusou a contagem inconsistente. A fixture foi corrigida em controle separado e passou. Dois controles iniciais de metadata atingiram chave duplicada antes do número: ficam preservados e não recebem crédito de cobertura numérica. Os dois controles finais exigem a mensagem exata de perda decimal e resolvem essa limitação. Resultados e fontes estão em [evidence.json](evidence.json) e [controls/controls.results.json](controls/controls.results.json).

Os 399 resultados históricos não foram presumidos: conferi os JSONs `baseline-c100.report.json` e `candidate-focused-r2.report.json`, incluindo multiplicidade de nomes repetidos. A comparação preserva exatamente as 399 assertions; os testes legados também conservam suas pré-imagens. Typecheck/lint r1 tiveram exit0 antes de dois ajustes finais de testes/metadata: são passes anteriores, não prova atual final desses gates. Os gates amplos do Lead, PostgreSQL, E2E e certificação não foram executados nem julgados aprovados pelo revisor.

Sem aplicação alvo, ELF, provider, modelo, rede, PG, Docker, instalação, alteração dos nove fontes, lock, contrato, catálogo original ou evidência anterior. Nenhum descendente agente. Acesso físico inspecionado dentro da fronteira de confiança do operador; não se alega defesa contra operador malicioso. Medições são locais, não promessa de latência de produção. Toda observação refere-se aos hashes registrados em [input-hashes-before.json](input-hashes-before.json) e [input-hashes-after.json](input-hashes-after.json).

Apenas `docs/08_runtime/agent_coordination.md` mudou durante a leitura concorrente, fora da escrita deste crítico e fora do freeze de código. O drift foi preservado nos hashes; SPEC, nove fontes, locks e 40 pré-imagens originais continuam iguais. Não há promoção neste parecer.

**Próxima ação:** Lead corrige R1-01 num único lote, apresenta novo freeze e evidência focal para a última R2. Aceite global permanece pendente dos gates aplicáveis e da correção. Ledgers globais e coordenação permanecem readonly por restrição explícita; continuidade desta rodada está no claim e nestes três artefatos.
