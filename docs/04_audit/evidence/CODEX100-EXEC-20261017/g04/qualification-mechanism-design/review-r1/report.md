# Review R1 — HOW SPEC0231

**Veredito: REVISE. Uma correção obrigatória (HOW-01/P1).** Rodada 1 de no máximo 2; 12 condições; nenhum descendente. Revisão fresh-context documental e de fontes como texto, sem BUILD.

SPEC revisada: `docs/02_spec/0231_codex100_initial_qualification.md`, SHA-256 `14af535242b5105a7fedac7016a88115493efcf11207cebadc2c66784f23cbbd`.

## Correção obrigatória HOW-01 — schema incompatível com a baseline

A SPEC:54 exige que toda `requirements[].family` exista em `families`; SPEC:55 preserva os 509 bindings id/family/kind; QK01 (SPEC:95) exige aceitar o catálogo corrente. Esses requisitos entram em contradição nos 22 controles transversais.

Contraprova concreta, já contida no input congelado:

```json
{"id":"CDX100-CVG-01","family":"CROSS_CUTTING","kind":"CVG_CONTROL","mandatory":true}
```

O catálogo traz essa row em `docs/03_build/tracking/codex100_catalog_v1.json:8902` (family na linha 8904). O array `families`, linhas 27–182, contém somente CDX-01 a CDX-22; `family_count=22` está na linha 15. Todos os 22 CVG_CONTROL usam CROSS_CUTTING. A baseline reproduz corretamente esses triples: `catalog-baseline-proposal.v1.json:930`, com CROSS_CUTTING na linha 931, enquanto sua lista de famílias está nas linhas 9–32. A divergência é entre a regra proposta e os dados que ela precisa aceitar, não entre baseline e catálogo.

Consequência estática: o validador descrito rejeitaria o próprio catálogo com INVALID_INPUT. Não existe implementação CodeX executada nesta revisão. Reatribuir os controles a CDX-xx quebraria a preservação exigida; incluir artificialmente uma 23ª família não permite aceitar os bytes congelados originais.

**Correção mínima:** distinguir as famílias funcionais declaradas do agrupamento transversal reservado. Exigir família declarada para FUNCTIONAL_PARITY e permitir CROSS_CUTTING somente em CVG_CONTROL, sem sua declaração em families nem inclusão no family_count funcional. Preservar os 509 triples, as 22 famílias e adições válidas reconciliadas. Ajustar o positivo corrente QK01 e os negativos QK03 para cobrir FUNCTIONAL_PARITY com CROSS_CUTTING e família desconhecida fora da exceção. Não alterar catálogo/baseline para acomodar um validador incompatível.

Fechamento documental rejeitável: a regra revista admite os bytes atuais com 487 funcionais +22 controles em 22 famílias funcionais e agrupamento transversal, sem abrir exceção para órfãos arbitrários. A revisão humana T3 deve receber o novo hash somente após esse ajuste e recheck. Nenhuma autorização de BUILD é concedida aqui.

## As 12 condições

- **H01 — SATISFIED_IN_DESIGN — Unidade técnica inicial, pipeline e autoridade humana separados do aceite integral.** PRD permite mecanismo primeiro; T1 documental não é decisão humana T3. CQ01–14, M1, G04/Q01 e objetivo integral continuam abertos.
- **H02 — SATISFIED_STATIC — 15 inputs congelados; baseline corresponde aos bindings correntes.** 15/15 tamanhos e SHA-256 iguais antes/depois. Mesmos 509 IDs únicos e mesmos triples id/family/kind entre catálogo e baseline; ordem diferente é irrelevante ao contrato. 487 FUNCTIONAL_PARITY +22 CVG_CONTROL; 22 famílias declaradas; 509 mandatory=true, status NOT_RUN, receipt=null.
- **H03 — REVISE — Schema proposto aceita o próprio catálogo corrente sem reclassificação.** A exigência universal de family declarada contradiz os 22 CVG_CONTROL com family=CROSS_CUTTING, agrupamento ausente de families. QK01 é insatisfazível para os bytes congelados.
- **H04 — SATISFIED_IN_DESIGN_EXCEPT_HOW_01 — Preservação de escopo e adições, sem redução pelo formato inicial.** Baseline fixa IDs/famílias/classes e permite adições válidas. 1MiB catálogo e 4MiB artifact são limites de representação; não encerram variantes grandes. A exceção transversal de HOW-01 deve preservar isso.
- **H05 — SATISFIED_IN_DESIGN — Catálogo bruto CodeX separado da vista privada de bindings.** Vista requirements/id/verification_class é compatível com o consumidor estático; validar rows CodeX antes. Hashes continuam vinculados ao raw CODEX-CAP-v1, sem CLAUDE-CAP intermediário.
- **H06 — SATISFIED_IN_DESIGN — Perfil executável fechado e reuso do fluxo inteiro sem bypass ou clone.** Dois exports fechados; função com perfil privada. Reutilizar parseArgs não executa main sob o guard atual. Preservar oito estágios, normalização e projection-budget; dados não selecionam callback/import/profile.
- **H07 — SATISFIED_IN_DESIGN — Guard CodeX finito/safeInteger/negative-zero antes de digest e projeção.** Modo deve chegar a todo load JSON, inclusive controles/receipts e documento inteiro selecionado. Inteiros 9007199254740992/9007199254740993 recusados; -0/-0.0/-0e0 recusados. Default C100 permanece Number finito legado.
- **H08 — SATISFIED_IN_DESIGN — Roundtrip decimal exato com custo limitado e sem expansão exponencial.** Igualar sinal/coeficiente/expoente normalizados do token e JSON.stringify(Number) impede alias decimal. Limitar magnitude do expoente não zero a maxBytes+400 antes de conversão limitada, sem potência expandida/BigInt arbitrário. Zero tem tratamento separado. 1e0/1 e 1.2300e2/123 são equivalências pretendidas; decimal longo divergente/underflow são recusados. Esta é análise do algoritmo descrito, não execução.
- **H09 — SATISFIED_IN_DESIGN — EXACT_BYTES compara o documento completo selecionado e mantém domínio lossless honesto.** Buffer integral do role selecionado é comparado sem parse/normalização. Outros roles são autenticados por integridade, não automaticamente iguais. Regra nova é necessária para equivalência semântica lossless além de byte igualdade; nenhuma função recebe crédito por essa limitação.
- **H10 — SATISFIED_IN_DESIGN — SafeIO, caps, snapshots, publicação e recuperação herdados.** Reuso conserva controles físicos, bytes de handles/snapshots, caps agregados, saída nova exclusiva e publicação após cleanup com checagem final de autoridade. Nenhuma alegação de proteção contra operador local malicioso além da fronteira declarada.
- **H11 — SATISFIED_IN_DESIGN — Origem, autoridade, execução, precedência e revisão pendente.** Reutiliza índices/receipts separados e exatos. APPROVED atual não é inferido de hash ou fixture; timeout/infra não viram MATCH; revisão da SPEC não aprova regra/função. MATCH_REQUIRES_REVIEW conserva PENDING.
- **H12 — SATISFIED_IN_DESIGN_EXCEPT_HOW_01 — Plano condicional, testes rejeitáveis e compatibilidade C100 sem tocar runtime público.** QK01–12 e regressões/gates atuais exigidos após T3 e claim próprio. Fontes C100 congeladas nesta revisão; nenhuma mudança pública/journal/SQL/SDK/provider/default0226. Falha de G03 permanece encerrada, não é BUILD desta SPEC. Validação de implementação e compatibilidade real continuam NOT_RUN.

## Precisão numérica e limite da prova

A evidência `existing-helper-diagnostic.json` registra execução anterior dos helpers: dois IDs 9007199254740992/9007199254740993 colapsaram no Number e no digest C100, apesar de bytes distintos. `serde-json-feature-evidence.json` registra arbitrary_precision no artefato serde_json compilado de perfil release, além de outro evento com features diferentes. Esses são registros fornecidos e hash-bound; não reexecutei helpers nem reabri o registro compilado externo aos 15 inputs. A feature não prova que todo campo tipado aceite qualquer decimal.

O guard CodeX proposto é coerente com o problema registrado: finitude, inteiro seguro, recusa de negative-zero e comparação exata dos decimais do token original e de JSON.stringify(Number). Não exige igualdade do decimal com a expansão binária do float. Normalizar sinal/coeficiente/expoente evita epsilon e expansão de potências; o limite maxBytes+400 para expoente não zero deixa a aritmética limitada. Equivalências 1e0/1 e 1.2300e2/123 são pretendidas. O modo alcança todo JSON efetivamente parseado antes de digest/projeção; não apenas os campos retidos na projeção. A implementação desses invariantes continua NOT_RUN.

EXACT_BYTES é igualdade integral dos bytes de **um role selecionado por regra**, com os demais roles exigidos autenticados por integridade. Isso corresponde ao core atual, qualify.mjs:428–439/493, e ao wire herdado; não significa comparar automaticamente todos os roles. Bytes distinguem i64 adjacentes, -0 e decimais longos sem passar por Number. Uma mudança só de espaços/ordem de chaves também produz MISMATCH em EXACT_BYTES, legitimamente. Se a futura jornada exigir equivalência JSON semântica lossless desses domínios, será necessário contrato/RULE próprio, ligado aos brutos; SPEC:71 já conserva essa dependência. Isso não bloqueia esta primeira unidade técnica nem autoriza qualificar o domínio inteiro.

## O que esta revisão verificou

Leitura dos documentos, dos seis arquivos C100 congelados como texto, inventário JSON e comparação de bindings, tamanhos e SHA-256. Há 509 IDs únicos em cada catálogo/baseline e os conjuntos de triples id/family/kind são idênticos, ainda que sua ordem difira. Há 487 FUNCTIONAL_PARITY nas 22 famílias declaradas e 22 CVG_CONTROL em CROSS_CUTTING. Todos os 509 mandatory são true, statuses NOT_RUN e receipts null. Os oito estágios do core, a vista consumida por validateRequirementBindings, o guard do main do CLI, os caps e a publicação após cleanup foram confrontados estaticamente com o HOW.

Os estados SATISFIED_IN_DESIGN avaliam suficiência do contrato, sem afirmar código implementado ou regressões verdes. Não executei/importei helpers, testes, qualificador/CLI alvo, ELF, CVG, REA, rede, PG, gates, configurações ou controle de processos. Os únicos programas usados foram leitores/inspeção de texto e JSON/hash, sem chamar código do repositório. Nenhum benchmark numérico nem teste de runtime foi produzido nesta revisão. A compatibilidade C100 real depende da futura bateria de regressão no candidato exato; o default finito legado deve ficar intacto.

PRD0030:11 permite mecanismo primeiro. O aceite PRD0090 é documental T1, não uma falsa aprovação humana. A meta continua 22 famílias/49 cartões/10 fases/487+22 e CQ01–14/M1/G04/Q01 abertos. A revisão da SPEC não aprova regras ou funções; MATCH_REQUIRES_REVIEW permanece PENDING. Os caps de 1MiB/4MiB são do formato inicial, sem recorte de escopo nem conclusão de funções grandes. Harness público, journal, SQL, SDK, provider e default0226 ficam fora desta unidade.

G02 e suas sessões encerradas não foram controlados; G03 FAILED_DIAGNOSTIC_FIXTURE_BUDGET/2 tentativas continua fechado sem retries e não foi tratado como BUILD desta SPEC. O Lead conserva a consolidação disjunta dos ledgers e das unidades encerradas. Somente review-r1/review.json e report.md foram escritos pelo crítico.

## Hashes antes/depois

15/15 MATCH, por bytes e SHA-256, em ambas as leituras. A coluna SHA-256 é simultaneamente o valor esperado, o medido antes e o medido depois. A verificação final ocorreu após a análise e antes da gravação dos pareceres; nenhum input recebeu escrita.

| Input | Bytes antes/depois | SHA-256 antes/depois |
| --- | ---: | --- |
| `docs/02_spec/0231_codex100_initial_qualification.md` | 23166/23166 | `14af535242b5105a7fedac7016a88115493efcf11207cebadc2c66784f23cbbd` |
| `docs/01_prd/0030_codex100_initial_qualification.md` | 20052/20052 | `e8f1a99c5c93399a8dd67261d03bf289b8f7dda78c0c1ece25d79d2e678e120f` |
| `docs/01_prd/0090_prd_validation.md` | 4225/4225 | `a9479c4e4b32f0deb5a1d7972d0b5d9a64da5a8004b1aa68baea44d6472429c9` |
| `docs/02_spec/0229_claude100_initial_qualification.md` | 24203/24203 | `bb42eb61cbd30c5720b00ef3145d9fdac4196b942eb3c42bff1d94acf4fe8243` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/catalog-baseline-proposal.v1.json` | 62482/62482 | `33087dcbf76007ef251a2115b6da31a3d0a0bf0681a41ec9d22c44e49f888ea2` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/existing-helper-diagnostic.json` | 1030/1030 | `af9b2778b9d232d70f4609de947baa19481a668fabe2153b83019060f0bc534e` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/serde-json-feature-evidence.json` | 1536/1536 | `1b6000180838ee44663c5d78719c70871862884a58b6823045e94dfebd61e795` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/build-plan-proposal.json` | 2358/2358 | `800a2459be554f1c66d936e9f0dae7127014b0df9c0104547242589756b376cd` |
| `scripts/claude100-qualify.mjs` | 1676/1676 | `c09c8935e1c4681a46b73004095c41367bc2415766a728ca15ae22993760ce0f` |
| `tests/claude100/qualification/qualify.mjs` | 20407/20407 | `4eb2b8e67e5aa76b73c82efd1da4c9be524ef0094779432fc8bd1e6fb34b54dd` |
| `tests/claude100/qualification/schemas.mjs` | 16134/16134 | `de0488e6a121713f5f89855ec62b92d7383624722fe7d88a23c32bf2d60faba5` |
| `tests/claude100/qualification/strict-json.mjs` | 8079/8079 | `4e077111127f7db13de3d9d9024c5508be2a835a287847063a511c88c55923a9` |
| `tests/claude100/qualification/safe-io.mjs` | 15128/15128 | `e8c826a1e948f97f6cff3ae862e5278e686c5043ccb3a3305c7e11846f0d8bf7` |
| `tests/claude100/qualification/projection-budget.mjs` | 1667/1667 | `7cf08965d176e1ab87427c4fb93a91b0dd403dcbea756059adcd261ae107acc2` |
| `docs/03_build/tracking/codex100_catalog_v1.json` | 707586/707586 | `7526e9d172abb1eeffa6981d98f1317fe91af2b617aab2b18a6645a5fd101fa7` |

Próximo passo do Lead: uma correção documental agrupada para HOW-01, congelar o novo texto e solicitar a segunda revisão se aplicável, dentro do orçamento. Não há necessidade de reabrir G02/G03, executar runtime ou redesenhar o comparador numérico para fechar este finding.
