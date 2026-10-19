# Primeira verificação — causas e correções

A [primeira execução](first-verification.json) teve dez checks verdes e quatro falhas. Os logs [de links](first-verification-links.log) e [de formato](first-verification-format.log) foram preservados.

- Famílias: o verificador contava `CROSS_CUTTING` como família funcional. A correção conta as 22 famílias dos requisitos `FUNCTIONAL_PARITY`; mantém os 22 controles transversais.
- Excertos: `splitlines()` descartava a linha vazia final do trecho capturado. A correção usa `split('\n')` para conferir o conteúdo exato. Os excertos originais estavam corretos.
- Link de verificação: a saída `verification.json` ainda não existia quando seu link foi conferido. O verificador agora publica estado `RUNNING` ao inicializar uma saída ausente, antes do relatório final.
- Formato: catálogo regenerado e novo script SDK exigiam Prettier nos arquivos próprios. A formatação do catálogo aguarda o término da revisão dos inputs congelados.

Nenhuma falha autoriza qualificação funcional, redução de escopo ou alteração dos comprovantes anteriores.
