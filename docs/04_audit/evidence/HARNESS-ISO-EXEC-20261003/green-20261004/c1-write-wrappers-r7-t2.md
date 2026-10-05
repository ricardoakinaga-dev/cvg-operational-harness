# C1 — escritas e identidade em wrappers — R7

Task `C1_WRITE_WRAPPERS_R7`, BUILD local T2 sob SPEC 0180 e autorização contínua registrada.

Recon: revisão C1 R6 válida reproduz P1 em escritas TS envoltas e P2 na identidade var de bloco estático CJS; 232 testes fornecidos passam, mas não cobrem esses casos.

Escopo: cópia privada, boundary-code-execution/lexical e teste estático próprio. Identificação de escrita deve atravessar wrappers de valor apagados sem confundir acessos somente leitura; wrapper CJS só compartilha var fora de função/module/static block. Originais e prefixo 232 intactos. Provas novas apenas AST/texto neutro, sem executar fixtures.

Pronto: antes/depois discriminante, original253 e estático expandido, tipos/lint/formato e novo crítico no SHA congelado. Installed INCOMPLETE não vira PASS por ausência de violações. Nenhuma promoção Root ou aprovação global por este BUILD.
