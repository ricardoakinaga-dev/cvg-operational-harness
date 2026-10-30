# AUD0625 F13 — fatia 2 (SPEC 0283 §5): associação por tupla paciente/campo/valor/unidade

Task `AUD0625-F13-BUILD-07-20261029` (Claude Sonnet, sessão 07). Branch
`claude/aud0625-f13-07`; sem push. SPEC 0283 aprovada (`human-decisions-13.json`);
fatia 1 aprovada pelo DF (relatório `f6829abeb`). Não libera release, piloto,
provider/canal real, ação clínica nem a D2.

## O que mudou

- `source-evidence.ts` (novo, determinístico, sem modelo): `checkAssociation(rawText, organized)`.
  - **Blocos de fonte** por âncora de paciente (nome em palavra inteira e ID
    literal), sem diferenciar caixa nem acento (`fold` preserva os índices).
    Homônimos só se ancoram pelo ID; sem ID não têm bloco.
  - **Ocorrência de valor** = número com unidade da lista fechada (`mg, g, mcg,
    ml, l, ui, %, bpm, rpm, mmhg, °c, kg, h, min, vezes, mg/kg, mg/ml, ml/kg,
    ml/h, ui/kg`) e/ou rótulo de medida (`temperatura`, `frequência
    cardíaca`/FC, `frequência respiratória`/FR, `peso`, `glicemia`) sem outro
    número entre o rótulo e o valor. Número sem unidade nem rótulo (ID, leito)
    não é checado. Escala preservada (`1,0` ≠ `1`); vírgula e ponto são o mesmo
    separador; sem conversão de unidade.
  - **Correspondência** por saída (campos `motivo`, `evolucao`,
    `exames_pedidos`, `condutas` e `pendencias[].descricao`): mesmo número na
    fonte → no bloco do paciente → unidade igual quando as duas existem →
    rótulo igual quando os dois existem. Códigos: `UNSOURCED_VALUE`,
    `VALUE_PATIENT_MISMATCH`, `VALUE_UNIT_MISMATCH`, `VALUE_FIELD_MISMATCH`,
    `SOURCE_ASSOCIATION_AMBIGUOUS` (paciente não localizável, homônimo sem ID,
    tarefa sem paciente com vários pacientes).
- `assistant.ts`: as mensagens das issues entram em `blockingIssues`, logo o
  preview mostra `⛔ Antes de confirmar` com o código, o valor, o campo e o
  paciente, e `ok` é recusado até um `corrigir` limpo (a revisão nova tem outro
  token). A lista numérica por conjunto (`⚠️ Confira estes valores`) segue como
  aviso.

## Consequências assumidas (SPEC 0283 §5, DECISÃO D = bloquear)

- `UNSOURCED_VALUE` agora **bloqueia** em vez de só avisar quando o valor tem
  unidade ou rótulo. Dois fixtures de teste (`support/harness.ts` e
  `shift-assistant.test.ts`) tinham "Vomitou 2 vezes" com fontes sem esse
  número; passaram a "Vomitou duas vezes" (sem numeral). Nenhuma asserção foi
  enfraquecida.
- Falso positivo é esperado e aceito: numeral por extenso (C2 da 0179) e fonte
  sem âncora do paciente pedem `corrigir` com nome/ID e dígitos.

## Provas

- R6–R8 (`preview-receipt-reliability.test.ts`) viraram `it`; nada mais usa
  `it.fails` nesse arquivo.
- Novo `source-evidence.test.ts` (23): positivos (blocos por paciente, rótulo
  com e sem unidade, IDs/leitos ignorados, tarefa do único paciente,
  acento/caixa), negativos (troca entre pacientes, unidade, campo, valor sem
  fonte, escala, sem conversão, paciente não localizado, homônimos com e sem
  ID, tarefa sem paciente, tarefa no paciente errado), bordas (vírgula/ponto,
  `mg/kg`, palavra inteira, rótulo com número no meio, homônimo em tarefa) e
  pelo webhook (preview com o código e `ok` recusado; revisão corrigida
  confirma).
- Suíte do produto: 15 arquivos, 185 testes, todos passam. eslint e prettier
  OK; `tsc` do produto só com o erro preexistente (TS7006 de
  `classification-no-model`, referência de projeto não construída).
- Mutação (`mutate-s2.py`, 16 mutantes): 15 mortos (S10 sobreviveu na primeira
  rodada e foi morto com `Alfa`/`Al` em ordem inversa; `mutations-s2.json` +
  `mutations-s2-rerun.json`). **S16 sobrevive e é equivalente**: sem o ramo
  `'unbound'` o mesmo caso cai em `!anchored.has(...)` e dá o mesmo código
  `SOURCE_ASSOCIATION_AMBIGUOUS`; só muda a mensagem.
- Nenhum arquivo catalogado em `scripts/skip-catalog.json` nem
  `scripts/mutation-manifest.json` foi tocado.

## Não executado

Suíte global, PG, Docker, canal/modelo reais; equivalência por extenso (C2) e
`SourceEvidence` com `quote` (C3), fora do escopo da SPEC 0283 (dependem de D2).
