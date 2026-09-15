# Final Critic I1 — auditoria delimitada independente

Veredito do sistema contra a barra integral: **FAIL**. A implementação contém fluxos controlados executáveis, mas ≥97 em todas as 20 áreas não é suportável: há defeitos reproduzidos em requisito BLOCKING e gates integrais não exercitados. Não é declaração de inadequação de todos os fluxos nem autorização de produção.

Independência: fresh-context; sealed prior-review material: **none**. Nenhum relatório, notas ou narrativa de críticos anteriores foi consultado. Foram lidos código candidato, requisitos normativos e evidências brutas atuais fornecidas pelo coordenador. Runtime/log/backlog exigidos foram apenas capturados como contexto operacional, não usados como veredito. Produto/candidato não alterados.

## Evidências e limites

- FC-I1-01 (BLOCKING, Q-A14-02): `apps/api/src/server.ts:446` invoca evaluateReadiness sincronicamente usando apenas modo de persistência/durabilidade. `readiness.ts` declara PostgreSQL saudável por configuração. Probe `/tmp/cvg-final-ready.ts`, resultado `/tmp/cvg-final-ready-controlled.log`: /ready 200, ready true, zero queries apesar de adapter que sempre rejeita queries; /live 200. NODE_ENV=test, HTTP Fastify inject, sem socket e sem banco externo. Primeira tentativa com ambiente padrão falhou corretamente no guard de bootstrap de PostgreSQL produção (`/tmp/cvg-final-ready.log`); isso não corrige a ausência de probe após startup. Não se alega teste de queda real do banco em produção.
- FC-I1-02 (HIGH/BLOCKING de requisito, Q-A11-01): `journeys-postgres.ts:450,514,524` grava draft e audit em operações separadas; `tenant-scoped-postgres.ts:84` configura contexto e limpa conexão, mas não abre transação. Probe bruto `/tmp/cvg-audit-backend-pg-probe.ts/.log` injeta trigger que falha somente audit e observa 1 draft persistido, replay draft e 0 audits. Probe usa schema real/migrations e PostgreSQL descartável, porém chama repositório diretamente, com superuser de teste; prova atomicidade/audit, não RLS nem paridade HTTP. Os três arquivos de persistência importados do original conferem byte a byte com candidato.
- FC-I1-03 (HIGH de UX/isolamento de apresentação): `apps/web/src/features/journeys/index.tsx:47,83` limpa estado ao mudar identidade, mas resposta pendente repõe matches sem verificar identidade corrente/cancelar. Probe bruto `/tmp/cvg-audit-ui/race.cjs/.log` segura resultado tenant A, troca para B, devolve A, observa nome de A sob B. Código original/candidato iguais. Rede interceptada no navegador: evidencia apresentação stale, NÃO vazamento concedido pelo backend ou bypass de RLS. Elemento skip link teve foco correto no mesmo probe.
- Logs atuais: PostgreSQL 131/131, worker PostgreSQL 2/2, E2E Chromium 6/6; typecheck e lint exit0. Leitura desses resumos não substitui revisão semântica de todos os testes nem associação de cada teste aos 80 critérios.
- format:check falhou (161 arquivos). Cert verifier falhou com hashes de artefatos divergentes e manifesta explicitamente ausência de candidate binding no manifesto legado. Esses resultados não devem ser convertidos em PASS atual. Coverage ainda ativo na coleta desta revisão: nenhum percentual ou PASS presumido.
- Não foram executados por este crítico: holdout/comparador, mutação de guards, benchmark/soak, restore/RPO/RTO, imagem, instalação limpa, integrações externas reais, autorização humana. NOT_RUN abaixo é ausência de conclusão integral deste crítico, não afirmação de inexistência de implementação.

## Disposição dos 80 critérios

Critério integral só recebe PASS quando a evidência disponível sustenta seu escopo. Amostras parciais positivas não elevam critério inteiro.

| Área | PASS | FAIL | NOT_RUN nesta revisão |
|---|---|---|---|
| A01 | — | — | Q-A01-01, Q-A01-02, Q-A01-03, Q-A01-04 |
| A02 | — | — | Q-A02-01, Q-A02-02, Q-A02-03, Q-A02-04 |
| A03 | Q-A03-01 | — | Q-A03-02, Q-A03-03, Q-A03-04 |
| A04 | — | — | Q-A04-01, Q-A04-02, Q-A04-03, Q-A04-04 |
| A05 | — | — | Q-A05-01, Q-A05-02, Q-A05-03, Q-A05-04 |
| A06 | — | — | Q-A06-01, Q-A06-02, Q-A06-03, Q-A06-04 |
| A07 | — | — | Q-A07-01, Q-A07-02, Q-A07-03, Q-A07-04 |
| A08 | — | — | Q-A08-01, Q-A08-02, Q-A08-03, Q-A08-04 |
| A09 | — | — | Q-A09-01, Q-A09-02, Q-A09-03, Q-A09-04 |
| A10 | — | — | Q-A10-01, Q-A10-02, Q-A10-03, Q-A10-04 |
| A11 | — | Q-A11-01 | Q-A11-02, Q-A11-03, Q-A11-04 |
| A12 | — | — | Q-A12-01, Q-A12-02, Q-A12-03, Q-A12-04 |
| A13 | — | — | Q-A13-01, Q-A13-02, Q-A13-03, Q-A13-04 |
| A14 | — | Q-A14-02 | Q-A14-01, Q-A14-03, Q-A14-04 |
| A15 | — | — | Q-A15-01, Q-A15-02, Q-A15-03, Q-A15-04 |
| A16 | — | — | Q-A16-01, Q-A16-02, Q-A16-03, Q-A16-04 |
| A17 | Q-A17-04 | — | Q-A17-01, Q-A17-02, Q-A17-03 |
| A18 | — | — | Q-A18-01, Q-A18-02, Q-A18-03, Q-A18-04 |
| A19 | — | — | Q-A19-01, Q-A19-02, Q-A19-03, Q-A19-04 |
| A20 | — | — | Q-A20-01, Q-A20-02, Q-A20-03, Q-A20-04 |

Justificativas das decisões integrais:

- Q-A03-01: PASS — typecheck exit 0 atual; strict true em tsconfig.base.json.
- Q-A11-01: FAIL — Draft PostgreSQL persiste sem audit após falha de INSERT de audit; replay não reconstitui audit.
- Q-A14-02: FAIL — Probe próprio /ready=200 e zero queries com query sempre indisponível; código não implementa probe real.
- Q-A17-04: PASS — E2E bruto: testes visual-shell em Chromium concluídos; 6/6 suite. Não extrapola acessibilidade completa.

## Suficiência e notas

Escopo suficiente para refutar aprovação integral ≥97 e detectar gaps de readiness, audit transacional e identidade assíncrona da UI; insuficiente para certificar todos os requisitos PRD/SPEC, atribuir cinco subnotas altas em todas as áreas ou declarar qualidade externa. Não uso quantidade de testes como denominador de requisitos. As notas integradas do coordenador devem discriminar implementação inspecionada, negativos integrados, persistência pública, operação e evidência; áreas com requisitos críticos FAIL/NOT_RUN não podem receber ≥97 pela própria rubrica. Não atribuo notas numéricas novas nesta revisão delimitada para evitar precisão inventada.

## Mutation sentinel

Sentinel amplo apps/packages/tests/scripts: pré `f86215104eb6467340755aee1b4a3c9d4d0a1be36c68df0923626ba0e504fd66` (525 arquivos), pós `0978b4db49af6890249f6124b3130cd24f663c48b2f28def9f804d1191feb4df` (528 arquivos), portanto **DRIFT detectado**. As únicas diferenças são três arquivos novos gerados em apps/web/dist (index.html, assets/index-BUjBxes9.css e assets/index-bk-5Onvn.js), provenientes de execução concorrente externa a este crítico. Nenhum byte pré-existente mudou. Separação diagnóstica transparente, sem apagar o drift: removendo dist de ambos os mapas, o conjunto de fontes permanece igual (`True`), hash `f86215104eb6467340755aee1b4a3c9d4d0a1be36c68df0923626ba0e504fd66`. Mapas preservados /tmp/cvg-final-pre.json e /tmp/cvg-final-post.json. O sentinel não cobre todo o manifesto nem logs/evidências; nenhuma alteração de produto pelo crítico. A identidade integral deverá ser revalidada pelo coordenador antes da publicação.
