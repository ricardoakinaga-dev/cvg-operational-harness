# CODEX100 — revisão final R2

**APPROVE_BOUNDED_IMPLEMENTATION — zero obrigatórios remanescentes.** R1-01/QK08 está fechado no freeze R2. Aprovação limitada à implementação privada dos nove caminhos sob SPEC0231/e3af. **Aceite global e QK12 integral continuam não satisfeitos.** Rodadas 2/2 e retrabalho agrupado 1/1 esgotados; nenhuma terceira revisão.

## Fechamento de R1-01

O único delta do mecanismo está em `tests/claude100/qualification/strict-json.mjs:102`, SHA `76d59be98c4969a9a6770fbc6666f49ee967fbc23cc537b45a1002bebc838e48`: regex de sufixo substituída por índice reverso decrescente e um slice. Cada zero final é visitado uma vez; o ajuste de expoente conta exatamente os mesmos zeros removidos. Coeficiente não zero já foi estabelecido antes dessa etapa. Não muda caps, domínio exato, safeInteger, -0, igualdade decimal ou default Claude.

Os demais deltas são somente as duas contraprovas novas. Seis arquivos permanecem byteidênticos à R1; os nove arquivados R1 conferem com o freeze anterior. [Diff completo](source-diff.json).

| Zeros internos | R1          | R2 Node 22 |
| -------------- | ----------- | ---------- |
| 10.000         | 63,03 ms    | 1,01 ms    |
| 20.000         | 247,29 ms   | 0,63 ms    |
| 40.000         | 1.014,75 ms | 0,60 ms    |
| 80.000         | 3.773,42 ms | 1,74 ms    |

Mesmo token conhecido ruim da R1: `'1' + '0'.repeat(n) + '1e-' + (n + 2)`. Todos continuam recusando a perda decimal exata. Tempos locais incluem aquecimento; a prova de linearidade está na varredura monotônica, não em inferir uma curva de quatro amostras.

## Contraprovas e semântica

**86 controles próprios PASS, zero FAIL**, em Node v22.23.2 com TMPDIR privado. São 80 comparações de semântica R1/R2 (domínio Claude default e CodeX), um positivo exato com 200 mil zeros finais, um controle de limite numérico e quatro controles de fechamento:

- Parser R1 arquivado, cópia byteidêntica, token de 200 mil zeros internos: timeout esperado em 2 s. O controle detecta o defeito anterior.
- Parser R2, mesmo token: recusa com a mensagem exata de perda decimal em **30,84 ms**, dentro dos 2 s da contraprova incorporada.
- CLI R2, catálogo bruto conhecido ruim da R1 **reutilizado byte a byte**, 644.381 bytes: recusa decimal em **126,32 ms**, antes da projeção.
- CLI R2, token de 200 mil zeros em metadata não projetada, 804.382 bytes e uma única chave `execution`: recusa decimal em **124,48 ms**, dentro dos 5 s; checks posteriores NOT_RUN e reviewStatus PENDING.

As duas contraprovas incorporadas são válidas: a fixture mínima do teste CLI não contém previamente `execution`, o catálogo fica abaixo de 1 MiB, os três vínculos de hash são atualizados e o erro exigido contém `decimal`. O teste do parser verifica conclusão normal, ausência de erro/sinal e recusa INVALID_INPUT. Os controles independentes exigiram a mensagem exata e mostraram que o parser antigo excede o prazo. Nenhuma falsa cobertura por chave duplicada/cap foi usada para fechar R1-01.

A comparação semântica inclui safeInteger e adjacentes inseguros, -0 e variantes, frações de alta precisão, underflow/expoentes extremos, equivalências decimais, zeros finais, metadata e JSON estrito. [Resultados](controls/closure-controls.results.json), [benchmark](controls/numeric-cost.stdout.jsonl).

QK01–07 e QK09–11 conservam a evidência limitada R1: superfícies inalteradas e hashes/diff conferidos nesta rodada, acrescidos da regressão focal atual. Não foi repetida toda a bateria R1 nem a suíte global.

## Evidência atual e limite global obrigatório

Conferi o JSON real `candidate-focused-r3.report.json`: **539 PASS, 0 FAIL, 0 pending/skip**. As 399 assertions Claude têm o mesmo multiset de nomes/status/multiplicidade da baseline original; os testes não foram relaxados. Os dois novos testes aparecem PASS no relatório, em aproximadamente 33 ms e 96 ms. Isso sustenta a regressão focal, sem transferir crédito funcional.

O JSON real `unit-r1.report.json` continua **FAILED: 4.798 = 4.704 PASS + 94 FAIL; zero skips**. As primeiras linhas de erro conferidas distribuem-se em:

- 92 falhas por inputs `dist` ausentes: 62 em compiled-kernel-boundary e 30 em sdk-boundary-qualification;
- uma prova PARE ausente (`lead/doc-portability-r2.json`);
- uma recusa `MISSING_DISPOSABLE_PG` por falta da flag/URL exigidas.

Essas falhas não são dispensadas nem reclassificadas como PASS. O preparo Builder 7ecc/20 workspaces informado pelo Lead e o registro `runtime-build-r1` exit0 não constituem gates globais verdes nem qualificação da aplicação. As flags devem refletir o PostgreSQL realmente privado/descartável d6a1 indicado pelo usuário e por `owned-postgres.json`; este crítico não inspecionou Docker/PG ao vivo. Registrar resultados atuais e preservar o relatório falho como histórico. [Inventário das 94 falhas](global-unit-r1-failures.json).

Type/lint anteriores, emits, prova PARE, PostgreSQL, E2E e certificação permanecem no ciclo de verificação do Lead. Nenhum deles foi executado pelo crítico ou recebeu PASS inferido. O defeito R1-01 do qualificador está fechado; os gates da aplicação continuam dependências reais antes de aceite global.

## Integridade e decisão

SPEC integral `e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af`; autoridade humana já resolvida. Nove hashes R2, nove arquivados R1, 40 pré-imagens C100 originais, locks e artefatos históricos conferidos antes/depois. Evidência em [review.json](review.json), [evidence.json](evidence.json) e manifestos de hashes.

Escrita somente nesta revisão e em `/mnt/ia/cvg-codex100-exec-20261017/qualification-review-r2`. Sem editar fonte, lock, SPEC ou revisão anterior; sem descendentes agentes, aplicação alvo, ELF, provider/modelo, rede, PG, Docker, suíte ampla, commit, promoção ou release. Os children de parser e CLIs são controles sintéticos finitos do mecanismo; o timeout do parser antigo é resultado esperado.

**Próxima ação:** Lead conclui os gates globais atuais e seus inputs/flags verdadeiros, registra evidência no candidato exato e confere pré-imagens antes de qualquer promoção seletiva. Este parecer não concede aceite global, paridade ou promoção e encerra o orçamento de revisão de código.
