# SPEC0233 — barra independente DR01–03/DR05

- DR01: comparar seis pins; prova versionável é byte-exata à original existente e é legível sem evidência ignorada. Lista de três copies e20HISO permanece exata; política e SPEC0207/checker não mudam versus base.
- DR02: prefixo4715bytes tem SHA histórico, append480bytes e destino5195bytes têm digests independentes; título/offset finitos. Mutação de bytes ou metadata isolada, duplicata/unknown/truncamento deve falhar; outros dois destinos continuam com checksum histórico exato.
- DR03: examinar diff real e assertivas originais; executar arquivo completo em overlay privado. Probes próprios devem chamar a lógica real sem alterá-la ou mascarar exceções; controls conhecidos defeituosos precisam falhar. Fixtures são expectations versionadas revisáveis, não uma autorização de app; não exigir resistência impossível contra alguém que também reescreva o teste/expectations como código.
- DR05: evidência independente vinculada à fonte/digests; não aceitar por ausência de baseline. Distinguir guarda histórica de checksum eterno do destino; sem aceite DR04/T2 geral, Q03 integral/paridade/release.

P1: falso aceite central/perda histórica. P2: weakening de regressão ou cadeia/proveniência quebrada. P3: observação não bloqueante. Escrita só em review-r1 e temporários exclusivos; sem descendentes.
