# SPEC0628 — Limitar a requisição antes da consulta de sessão

Estado: T3 / PREPARED_FOR_TECHNICAL_REVIEW; aprovação explícita do usuário antes de BUILD pendente. Esta SPEC não concede implantação, push, dismissal de CodeQL ou produção. Tarefa SE003/AUD0627, achado P1SDR1-F01 da revisão independente de segurança. CI003 conserva sua candidata e qualificação separadas.

## Problema observado e fonte

Na main a2f345a3b7fac79f8a1506d369b9371f92e187c8, a fábrica buildServer instala o onRequest do cookie de sessão antes do limitador global. Um identificador sintaticamente aceito, mas inexistente, faz operatorSessionStore.get e termina401 antes de alcançar a limitação. A [reprodução nativa](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/security-disposition/cookie-qualification/result.json) usa a árvore publicada integral em snapshot privado, memória e nenhum cookie válido. Nas sete rotas dos alertas40/27–32,14regressões (deny/throw) falham:401/get1/limiter0; sete controles de sessão ausente mantêm401. PRE/POST de6inputs iguais. Nenhum teste de carga ou exploração em serviço real foi feito.

A prova anterior31PASS cobre requisições SEMcookie e continua válida nesse escopo. Não fundamenta fechar os sete alertas de rate limit de forma ampla. Contratos existentes AUD19-006/global300/IP/minuto, SPEC0254/sessão/login e SPEC0296/SSE continuam canônicos.

## Mudança de comportamento e desenho exato

Mover somente o bloco de12linhas que registra installOperatorSessionHook, atualmente antes de installOperatorPrincipalGuard, para imediatamente após o registro do limitador global e antes do hook de token replay. O [patch proposto como dado](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/security-disposition/cookie-qualification/proposed-reorder.patch) não foi aplicado. APIserver fonte cc32f31ac7125ef1b5e20a6a0ce373854d771e5b82c9040b9c13e03950417379 é byteigual na main e na candidataff9e.

A ordem de onRequest fica: validação HTTP/segurança/login já existentes, início de métricas, limitador global, sessão por cookie, replay. Principal guard permanece preHandler e continua depois de todososonRequest. Não mover lógica de validação/revalidação nem trocar a store ou o algoritmo de limitação. Mesma chave ip, política300/60000ms, respostas429/retry-after/no-store e falha fechada. A consulta do limitador persistente continua sendo o custo próprio dessa fronteira.

Com cookie ausente/inexistente/expirado e orçamentoIP esgotado, responder429 antes de ler ou modificar sessão/principal. Não emitir limpeza/renovação de cookie nesse caminho. Com limite permitido, conservar401/503, limpeza de cookie quando prevista, permissões, revalidação, retomada e SSE. Sondas de saúde continuam isentas da cobrança e do cookie; login/HTTP/CSRF/origin mantêm a ordem contratada. O valor de latência de respostas de sessão passa a ter o início de métricas existente antes da consulta; não alterar contadores, rótulos nem contrato de telemetria.

## Escopo de BUILD autorizado somente após gateT3

Nova candidata própria derivada de base congelada reconciliada por SHA; nunca alterar fonte em teste. A fonte ff9e possui revisão de implementação aprovada e S6/S7 em execução; esses resultados não serão transferidos para o novo reparo. Fonte APP prevista: apps/api/src/server.ts, somente deslocamento do registro. Testes novos prospectivos de SSEsemcookie e cookie antes do limitador podem ser incorporados a paths próprios sob claim, preservando as regressões existentes e evidênciasRED. Sem mudança em schema, migration, parâmetros de limite, identidade, guards, logout, store, gateway, produto ou supressões/scanner. Caminhos canônicos de pares só por reconciliação; patch privado não transfere ownership.

## Aceites antes de conclusão local

| ID  | Prova exigida                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Mesmas14regressões7rotas×deny/throw passam429, limitercheck1 com chave/política exatas, sessionget0/principalread0/auth0/eventread0/mutation0, no-store/retry37ou60, semset-cookie.                                                             |
| A2  | Limite permitido e cookie inexistente mantém401/get1 e contabiliza a requisição; falha da sessionStore e cookie expirado mantêm o contrato503/401/SSE vigente. Casos sintéticos adicionais não criam credencial real.                           |
| A3  | Sessão sintética válida sob limite permitido preserva autorização/revalidação/correlação, tenant/principal e fluxoSSE; sob recusa não inicia nenhum desses acessos. Reaproveitar fixtures existentes adequadas, sem forjar identidade no host.  |
| A4  | Controles31no-cookie, sessão/cookie/login/CSRF/origin/principal/stream/health/metrics/tokenReplay existentes continuam verdes; quatro sondas permanecem isentas.                                                                                |
| A5  | Contraprova ao restaurar a ordem antiga apenas na cópia descartável faz as14regressões falharem; fonte real/negativos/timeouts/pins não são relaxados.                                                                                          |
| A6  | Revisão independente da implementação, Node22/types/lint/build/core completo/PG eE2E atuais, artefatos vinculados aoSHA; cobertura e barra completa requeridas para candidata integrada conformeAGENTS. Não transferir o certificadoff9e/CI002. |

## Gate, riscos e recuperação

AGENTS07 classifica mudança de segurança/identidade como T3 e exige revisão explícita da SPEC pelo usuário antes do BUILD. A alteração de precedência429vs401 e a proteção da consulta são as decisões concretas deste pacote; nenhum waiver é proposto. Após aprovação registrada, atualizar claim e implementar em candidata isolada, preservarRED, executar aceites e qualificar. Se a proposta quebrar contratos de login/saúde/SSE, interromper e registrar a divergência, sem mover outras fronteiras por inferência.

Esta mudança não dimensiona proteção de ingress/proxy nem demonstra resistência de produção; requisiçõesHTTP recusadas em fronteiras baratas anteriores permanecem fora da limitação de aplicação. Não altera status remoto dos alertas nem concede0373/produção. Reverter a ordem na candidata própria é possível, mas não recupera aceite: a falha original volta e deve continuar aberta.
