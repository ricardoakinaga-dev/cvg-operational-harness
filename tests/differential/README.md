# Prova diferencial com referência externa

A suíte `reply-differential.integration.ts` exercita os motores reais com fixtures sintéticas e exige uma árvore física compilada da referência no commit `768fb1f3d3dcf9a16659ee354e927d05475f22dd`. Versão, aliases e inventário continuam obrigatórios.

```sh
CVG_DIFFERENTIAL_REFERENCE_ROOT=/caminho/absoluto/da/referencia npm run test:differential:reference
```

O comando recusa localização ausente ou relativa. Referência ausente, pin incorreto ou observação inválida causam falha, sem skip. Reutiliza os aliases/controles do workspace; a barra ordinária não presume outro repositório instalado. O resultado não demonstra paridade integral nem autoriza produção.

As provas ampliadas e o novo modo complete continuam preservados no snapshot experimental192872d6, aguardando qualificação própria. Este perfil contém somente a prova já promovida na linha estável.
