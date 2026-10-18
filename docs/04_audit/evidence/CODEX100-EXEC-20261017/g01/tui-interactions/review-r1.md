# Revisão independente — vínculo fonte TUI

Aquinas emitiu `ACCEPT_BOUNDED_TUI_SOURCE_BINDING`, sem achados P0/P1/P2/P3,
reparos obrigatórios ou retrabalho. O [parecer bruto](review-r1.raw.txt) conserva
o resultado terminal completo; seus links absolutos são texto histórico, não
links portáteis deste documento. O crítico foi encerrado após a entrega.

Os [42 inputs locais e dois de raiz](review-r1-inputs.json) permaneceram com os
mesmos bytes. O crítico inspecionou os readers antes de executar seus cinco
`--check`, todos com exit 0. Conferiu independentemente 1.135 blobs Git,
55.812 ocorrências de spans UTF-8 e 44.022 coordenadas únicas, além dos 340
arquivos e oito manifestos anteriores. Não importou código do alvo nem criou
arquivos ou descendentes.

O censo confirmou 65 comandos, 291 eventos/477 campos, oito requisitos U01,
14 famílias de views, 34 âncoras e 1.131 paths Rust da TUI. Tiers dinâmicos e
alias de Goal, filtros/guards, draft/histórico, cfg, testes, suporte, globs,
diferenças de ações e owners de domínio permaneceram explícitos. A ligação
lexical não foi convertida em reachability ou ownership completo do efeito.

Os 82 negativos existentes de artefato, fonte e manifesto passaram, assim como
os seis probes de cfg e fixtures lexicais. O crítico rejeitou mais 22 mutações
em memória, cobrindo omissões, ordens, alias, disponibilidade, payload, consumers,
arquivos, ações, owners, gaps, spans, manifesto e falsa qualificação. Duas
tentativas de probe independente por regex falharam por limitações da própria
expressão e foram corrigidas em memória; não revelaram defeito nos inputs.

O aceite é restrito a este mapa estático. Os 291 owners detalhados de efeitos de
eventos continuam abertos; 370 famílias futuras e duas famílias dinâmicas não
recebem qualificação. O catálogo conserva 487+22 estados/CVG `NOT_RUN`, com
observações históricas de referência preservadas e zero recibos.

Continuam obrigatórios G01, fonte/binário/oráculos G02, reuso G03, SPEC/gates G04,
seis gaps SDK e cinco limites externos. Macros, cfg, stdlib, targets, terminal,
plataformas e resultados funcionais continuam pendentes. Os 179 placeholders
históricos e o novo sidecar G03 são preparação externa ao parecer. Nenhum
BUILD/runtime, paridade nativa, bypass CVG ou release é aprovado.
