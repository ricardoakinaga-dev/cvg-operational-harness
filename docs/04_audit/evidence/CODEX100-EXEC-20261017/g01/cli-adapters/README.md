# G01 — adaptadores CLI, Windows e arg0

Inventário T1 do commit oficial `8d9f6466ff0294785d56f55b1fe363d132fe4133`,
sob o [contrato](contract.json). O grafo CLI anterior permanece preservado.

- [Adaptadores e Windows](schema/README.md): quatro adaptadores manuais, sete
  mutações de argumentos e quatro campos de setup. Preserva delegação,
  conversão de ResumeArgs, conflitos/globais, cfg e fronteiras de efeito.
- [Arg0](arg0/README.md): sete ramos ordenados, oito seletores e hook Linux
  anterior ao parser. Inclui constantes, imports, entradas diretas, consumo
  de argumentos, erros/saídas e fallback. São 24 fontes ligadas a objetos Git.
- [Integração](integration.json): vínculos entre essas superfícies e os
  requisitos já existentes, sem alterar o denominador do catálogo.

As duas frentes usam leitores Python da biblioteca padrão. A frente de
adaptadores rejeita onze adulterações; arg0 rejeita 21. Esses controles
verificam a evidência estática. Não executam clap, helpers, efeitos ou hosts.
A interpretação efetiva em cada plataforma, os efeitos transitivos e a
comparação funcional continuam pendentes; qualificação `NOT_RUN`.

Quatro relações antes opacas têm seus corpos e mutações resolvidos na fonte.
Isso não converte a projeção em schema completo de parsing aceito, nem concede
autoridade de bypass ao CVG. G01 e o objetivo integral permanecem abertos.

A interrupção deliberada da primeira leitura lenta foi registrada em
[first-source-read-slowdown.txt](first-source-read-slowdown.txt). O cache de
fonte é local a cada geração; gerações independentes continuam lendo as fontes.
Nenhum inventário foi publicado pela execução interrompida.
