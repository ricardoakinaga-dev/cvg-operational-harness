# Contratos de fonte TypeScript e wrappers

Estado: **IMPLEMENTED_SOURCE_CONTRACTS**. T1 de
`DX100-G01:RECONCILE-OPEN-SDK-CONTRACTS`, pin
`8d9f6466ff0294785d56f55b1fe363d132fe4133`.
Todos os oráculos funcionais permanecem **NOT_RUN**, recibos `null`.
`GAP-TS-LANGUAGE` e a parcela TS/wrappers de `GAP-PLATFORM-PACKAGING`
continuam **OPEN**. Não há DONE, fechamento G01, release ou BUILD autorizado.

[sources.json](sources.json) arquiva doze fontes pinadas com Git blob,
SHA-256, tamanho e cópias `.source.txt` byteidênticas. Os excertos em
[contracts.json](contracts.json) têm bytes UTF-8 em intervalos semiabertos,
linhas inclusivas, hash e texto literal. Há 24 cenários agrupados com owner,
gap/obrigação/requisitos anteriores, cadeia pública→helpers→efeito,
condições, efeitos observáveis esperados e obrigação futura específica.
Os 34 exports, 36 assinaturas, dez módulos e cinco regras do inventário
anterior são insumos históricos preservados; não foi repetido o censo.

O SDK liga `Codex` a `Thread`, prepara schema e entrada, chama `CodexExec.run`
e usa `exec --experimental-json`. O caminho normal do resolver SDK seleciona
o **executável nativo**, não o wrapper JS. Override explícito pode escolher
outro executável; sua identidade continua externa. Python/app-server RPC
é trabalho do Lead, fora deste recorte. Relações entre membros são candidatas
lexicais, sem checker ou prova de dispatch/publicação.

| Cenários | Recorte |
| --- | --- |
| TS01–TS04 | Entrada pública/defaults, iteração preguiçosa, normalização, schema e fronteiras de limpeza |
| TS05–TS09 | Ordem de argv/config, flatten/TOML, guardas de opções e ambiente |
| TS10–TS12 | Spawn/stdio, JSONL/readline, exit, AbortSignal e finally |
| TS13–TS15 | Parse, mutação de id/usage, agregação e falhas/EOF |
| PK01–PK03 | Plataformas, resolução de pacotes/layouts e PATH SDK |
| PK04–PK06 | Wrapper CLI, ownership de package manager, ambiente e sinais |
| PK07–PK09 | Wrapper JS do proxy, lifecycle e identidades de distribuição |

Alguns ramos exigem atenção no futuro: normalização da entrada acontece
**antes** do try que limpa o schema; falha nessa janela pode deixar o temporário.
O predicado chamado plain object só testa object/não-null/não-array. Config
flatten não escapa segmentos pontuados nem detecta ciclos. `runStreamed` retorna
um gerador preguiçoso: obter o objeto não cria processo, mas abandonar um
gerador suspenso não comprova cleanup. `run` ignora evento de tipo `error`,
aceita EOF sem terminal e usa último texto/usage; `turn.failed` interrompe,
mas só lança se `event.error` for truthy. JSON.parse mais cast não valida eventos;
`null` e `turn.completed` sem usage podem falhar fora do catch de parse.

No exec, checks de stdin/stdout e criação de readline antecedem o try/finally.
Sinal é delegado a `spawn`, sem deadline ou escalonamento próprio. O error event
é armazenado para depois do loop, e a Promise só resolve em `exit`, sem barreira
por `close` ou stderr final. O finally fecha readline, remove listeners do child
e tenta kill se `!child.killed`, sem esperar término; falhas de close/remove
podem impedir passos seguintes. Listeners dos streams não são removidos por
`child.removeAllListeners()`. As mensagens e falhas da fonte foram mantidas;
nenhuma limpeza desejada foi inventada.

O SDK requer resolver `@openai/codex/package.json` e o pacote de plataforma;
prefere `bin/codex` com marker `codex-package.json`, depois legacy `codex/codex`.
O wrapper CLI tem fallback vendor local só quando resolução do pacote falha,
testa `existsSync` de `bin/codex` e não aceita aquele legacy. O proxy usa outro
layout, `vendor/triple/codex-responses-api-proxy/codex-responses-api-proxy`,
sem resolução opcional nem precheck. Heurísticas vite-plus/pnpm têm precedência
sobre bun e usam ownership por realpath/metadata, não só env.
Ambos os wrappers mantêm handlers de SIGINT/SIGTERM/SIGHUP ao enviar sinal ao
próprio PID depois do exit do child. Portanto a fonte **não comprova** que o
wrapper morre pelo sinal; esse caminho precisa observação externa com timeout.

A verificação em [verification.json](verification.json) confere Git/bytes,
linhas, spans, relações call-site da AST, joins dos owners/requisitos e rejeições
de mutações documentais significativas. O parser TypeScript local é autenticado
por hash a partir do pacote anterior, usado apenas para `createSourceFile`.
Sua versão 6.0.3 não prova comportamento do compilador declarado pelo SDK.
[manifest.json](manifest.json) vincula inputs/outputs e comandos; exclui seu
próprio hash para evitar autorreferência. Nenhum SDK/app/wrapper foi importado
ou executado, nenhuma rede/install/PG/Docker/gate foi usado.

A lista de pontos de controle da AST registra if/switch/case/default,
condicionais, short-circuit, loops, catch e finally. Um ponto sem excerto de
ramo vinculado é marcado `INCOMPLETE_NO_ANNOTATION`, listado em
`coverage_limits.unannotated_control_flow_site_ids`. Ausência nessa lista
significa somente que os pontos selecionados têm anotação lexical: **não prova
exaustividade semântica**, alcance runtime, todas as exceções implícitas nem
cobertura de branches executados. As contraprovas testam o leitor/joins de dados,
sem crédito de funcionalidade, e não são revisão independente do Lead.

Os limites L-NODE, L-CLI, L-SCHEMA, L-PACKAGE, L-PLATFORM,
L-CONCURRENCY e L-AUTH permanecem UNKNOWN, com obrigações precisas nos contratos.
Faltam processos sintéticos supervisionados, schedules de Abort/EOF/exit/close,
fs faults, liveness/PIDs, host Windows/OS real e procedência de pacotes/binários.
Git pin, SDK/CLI `0.0.0-dev` e artefato distribuído são identidades distintas;
nenhum wheel/binário/dist foi autenticado. Nenhum nome de teste upstream foi
usado como prova de execução.

Reprodução estática na raiz, sem escrever em `--check`:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-open-contracts/typescript/reader.py --check
```

Continuidade para o Lead: integrar os seis gaps e suas fontes Python/generated/
proveniência, realizar revisão independente no orçamento da task e selar o
manifesto pai. Masters, coordenação, catálogo, SPEC0239 e pacotes anteriores
permaneceram sem escrita por este scout. Nenhum descendente foi criado.
