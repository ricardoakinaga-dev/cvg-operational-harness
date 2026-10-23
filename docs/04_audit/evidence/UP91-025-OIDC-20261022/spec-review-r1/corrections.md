# SPEC0254 r2 — correções da revisão r1

- Revisão: [review.md](review.md) (`REVISE`, r1 sha256 `2681db98…39bc`).
- Decisões: [user-decisions-20261022.json](../user-decisions-20261022.json) (P1–P4 do usuário, P5–P7 do lead).
- SPEC r2: [`docs/02_spec/0254_oidc_login_case_principals.md`](../../../../02_spec/0254_oidc_login_case_principals.md); hash em [spec-r2.json](../spec-r2.json).
- Convenção: "opcional O#" é item da revisão; "prova O#" é teste da §7 da SPEC.

## Obrigatórios

| Item | Onde mudou                       | Como                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | I1, §4.2, §4.10, prova O5, §8, §11 | `discovery` com `execute: [enableNonRepudiationChecks]`, sem `allowInsecureRequests`, com as âncoras da 6.8.8 citadas pela revisão. O texto do JWKS diz: recusa sem nova busca com cache < 60 s; uma nova busca com ≥ 60 s; expira em 300 s. A prova O5 afirma 401 sem sessão para outra chave com `kid` conhecido e para `kid` desconhecido. Mutante novo M23. A rotação positiva usa app novo ou relógio falso > 60 s. |
| M2   | §4.2 item 1, §4.3, §4.10, provas O2 e O5, §8 | O IdP sintético conta as chamadas a `token` e `jwks`. As recusas dos passos 1 a 4 afirmam zero chamadas a `token`, inclusive o replay. Sequência nova: state divergente → 401; o mesmo code com o state certo e o mesmo pendente → 303. O2 inclui o issuer que só difere na normalização (maiúsculas, `:443`, barra final). M13 cita o replay com chamada nova a `token`; M19 cita a normalização; M3 passa a citar O9 e O3; M14, O3. Mutante novo M24 (troca antes de validar o state). |
| M3   | I9, prova O11, aceite 13         | Única exceção à redação: a `authorizationUrl` da resposta 200 do start. O O11 cobre também o 303 do callback, os 401/503 e o audit.                                                                                                                                                                                                                                      |
| M4   | §2, I5, §4.1, §4.8 passo 2, §7 (ambiente), aceite 1 | O modo OIDC exige `POSTGRES_RLS_ENFORCEMENT=true` e, em teste, `DATABASE_MIGRATION_URL` com papel distinto do runtime e do de sessão (P6). As recusas de DDL no serving continuam só em `production` (`production-bootstrap.ts:52-56`, `server.ts:5359-5368`). O ambiente de O6 (parte PG), O9 e O10 está declarado em lista antes da tabela de provas, sem `stubEnv` de produção. |

## Opcionais

| Item | Onde mudou                  | Como                                                                                                                                                                       |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1   | §0                          | O store de state existe, mas nada o compõe (R4.6, R6.1); só o de sessão é composto em produção.                                                                            |
| O2   | I8, §4.9                    | O pendente é apagado pelo handler do callback a partir do passo 2, salvo store de state fora. Respostas antes do handler (429, 426, 403, 503 da readiness) não o tocam.     |
| O3   | §4.3 start passo 2, prova O4 | A checagem de `Origin` fica num `onRequest` da rota; O4 prova o 403 antes do 400 com corpo inválido.                                                                       |
| O4   | §4.7, prova O8, §8          | Mesmo corte de `parseOperatorSessionCookie` (`operator-session.ts:92-111`) e `cookie` em array. Mutante novo M28.                                                         |
| O5   | §4.2 (D12), §4.9, prova O5, §8 | Invólucro de transporte marca rede, TLS, timeout e HTTP ≥ 500 como indisponível (503); demais erros da biblioteca dão 401. JWKS fora e token 500 dão 503. Mutante novo M27. |
| O6   | §4.3, §5                    | A frase sobre login CSRF agora exclui o cookie tossing sem `__Host-`, cuja defesa vai para a 0254-B.                                                                       |
| O7   | §4.1, §4.8, I3, prova O7    | A §4.1 lê o `env` do builder; as guardas de `buildServer` leem `process.env`. A guarda I3 lê `process.env`, preservando `postgres-persistence-mode.test.ts:1826`.           |
| O8   | §4.1, §4.4, §8              | `claim` não pode ser `__proto__`, `constructor` nem `prototype`; leitura por `Object.hasOwn`. Mutante M29 (config). A leitura por propriedade própria fica como defesa: com esses nomes recusados, nenhum valor herdado é array, e um mutante de leitura não teria como ser morto. |
| O9   | §4.6, §6                    | Cita o caminho atual (`server.ts:884-897,958-965`) e põe a mudança do handler no conjunto de escrita.                                                                      |
| O10  | §11, provas O2 e O10        | Runner `ubuntu-latest` (`verify.yml:20`). Casos de 5 s com timeout de teste explícito ≥ 30 s. Errata do recon: R13.6 dizia `ubuntu-24.04`; vale `ubuntu-latest` (o recon não foi reescrito). |
| O11  | §4.1, prova O1, §5          | `CVG_LOCAL_OIDC_*` recusadas no modo OIDC; conciliação com o discriminante da SPEC0151/0152 §1 registrada para a 0254-C.                                                   |
| O12  | §5                          | Limite de start por IP atrás de NAT registrado para a 0254-C.                                                                                                              |

## Premissas

| Item | Onde mudou                            | Como                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | §4.2, §11, §12.1                      | Autorizado; versão exata registrada no BUILD, com a API reconferida (inclusive `enableNonRepudiationChecks`).                                                                                                                                                                                                                                                               |
| P2   | §4.4, §12.1                           | Grupos alheios ignorados.                                                                                                                                                                                                                                                                                                                                                   |
| P3   | §4.5 linha 9, §12.1                   | Regra literal: deriva de role recusa sem escrita.                                                                                                                                                                                                                                                                                                                           |
| P4   | §4.5 linha 4 e parágrafo de leitura, §12.1 | Linha 4 desativa e recusa. Texto explícito: sob a mesma versão, o login só tira acesso; dar acesso só no primeiro cadastro (linha 1) ou com N maior (linha 7). A antiga D9 saiu.                                                                                                                                                                                     |
| P5   | I12, §4.1, §4.5, §4.8 passo 6, provas O1/O2/O6/O9, §8, §11 | `matrix.version` inteiro de 1 a 999999999. `authorityVersion = oidc-v<N>-<D>`: a ordem é a de N; o digest D só detecta edição sem subir N. Linha 3 nova: recusa sem escrita com Np > N ou Np = N e Dp ≠ D. "Versão nova" = N maior (linha 7). Checagem de boot pelo método de leitura `hasPrincipalVersionMismatch` sobre `case_principals` (sem tabela, coluna nem migração). Mutantes M25 e M26. A antiga D1 saiu. |
| P6   | I5, §4.1, §7, §12.1                   | Premissa explícita só em teste.                                                                                                                                                                                                                                                                                                                                             |
| P7   | §5, §11, §12.1                        | Só informativo.                                                                                                                                                                                                                                                                                                                                                             |

## Linhas da tabela do produtor (§4.5), r1 → r2

| r1 | r2 | Mudança                                                                                      |
| -- | -- | -------------------------------------------------------------------------------------------- |
| 1  | 1  | igual                                                                                        |
| 2  | 2  | igual                                                                                        |
| —  | 3  | nova: Np > N, ou Np = N com Dp ≠ D → recusa sem escrita (P5)                                  |
| 3  | 4  | igual, agora justificada pela P4                                                             |
| 4  | 5  | igual                                                                                        |
| 5  | 6  | "versão = V" vira "Np = N"                                                                   |
| 6  | 7  | "versão ≠ V" vira "Np < N"                                                                   |
| 7  | 8  | igual                                                                                        |
| 8  | 9  | "versão = V" vira "Np = N"; P3 decidida                                                      |

## Pontos para o crítico da r2

- A checagem de boot da P5 acrescenta um método de leitura em `packages/persistence` (§4.8, §6). Não cria estado novo, mas amplia o conjunto de escrita da r1. Se o crítico achar o custo alto, a alternativa da decisão do lead é tirar o passo 6 e registrar como resíduo; a linha 3 do produtor continua cobrindo a segurança.
- O `authorityVersion` mantém o digest como sufixo. A decisão do lead diz "não por digest" no sentido de ordem: a ordem agora é só a de N. Sem o sufixo, a edição sem subir N não seria detectável sem estado novo.
