# Provas diferenciais com referência externa

As três suítes `*.integration.ts` exercitam os motores reais com fixtures sintéticas. Elas exigem uma árvore física compilada do repositório de referência no commit `768fb1f3d3dcf9a16659ee354e927d05475f22dd`; versão, aliases e inventário de arquivos continuam obrigatórios.

Execute explicitamente, atribuindo o recurso local:

```sh
CVG_DIFFERENTIAL_REFERENCE_ROOT=/caminho/absoluto/da/referencia npm run test:differential:reference
```

O comando recusa a falta de localização absoluta; referência ausente, versão/pin/aliases incorretos ou observação inválida falham os testes. Não há fallback por skip. O perfil reutiliza aliases e controles do workspace. A suíte ordinária e a barra do harness não adquirem nem presumem a instalação desse outro repositório.

São 25 controles de reply/failure/tool e negativos; resultado aprovado dessas provas não significa paridade integral nem autorização produtiva. As mudanças de nomes preservam o conteúdo das suítes aprovadas na revisão de integração R2.
