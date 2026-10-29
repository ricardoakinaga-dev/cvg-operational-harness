# P3 F02 — task10814, complemento só de testes

Base f4e799b805c92ec4ce81e00678c79c24608ae00e, revisãoD9 4b95bb56. Não muda SPEC0275, runtime ou contrato público. Etapa BUILD_TEST_ONLY sob o contrato aprovadoF02 e atribuição10814.

Aceite1: contar `/proc/self/fd` após aquecimento e após cada um de três lançamentos nativos de sucesso, sem tolerância que esconda FD. Provar admissão/stdout antes do oráculo. Matar mutante removendo somente launch.close() do finally; processo de prova encerrado/reaped para não deixar FDs no host controlador.

Aceite2: controle positivo escreve marcador próprio com allowNetwork=false; true deve recusar antes do payload com causa estável. Matar mutante que remove só a recusa, conservando --unshare-net, para separar admissão de isolamento físico. Nenhuma tentativa de rede externa.

Após restauração byte-idêntica: regressões focais, tipos/lint/formato, preservação da fonte, pacote de evidências e retorno aoDF com SHA. Semfullsuite/PG/Docker/push/produção. Próxima etapa separadaF18fase1/0280.
