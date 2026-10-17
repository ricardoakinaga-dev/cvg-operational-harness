# SPEC0217 — handoff congelado ao Lead

Estado: FROZEN_DESIGN_HANDOFF_TO_LEAD, sem BUILD.

- [SPEC0217](../../../../02_spec/0217_pare100_durable_kernel_composition.md): SHA-256 `7c21ef52de45d884e113d7fdf16cdf85b66861bdbdd483d1a48015a6fcb700d0`.
- [Recon](recon.json): SHA-256 `949a7c4230b4d9c3b9e4dbfcf5902a5d3f41f63858dd5da95bd695a18c0d7e38`, 123 fontes com cópias inertes e hashes.
- [Manifesto de fontes](source-hashes.sha256): SHA-256 `d6a184c67371ebf2472ee895334ca1737b0025de323088b1a8225db5446447d0`.
- [Witness](recon-witness.md), [plano executável de aceitação](acceptance-plan.md), [revalidação](source-revalidation.json) e [packet/gaps](handoff.json).

HOW concreto: ingresso durável existente da API → compositor published no worker → fachada0214/factory pública, reusando0016/0019/journal operacional e authority0002, com snapshots/seals/receipts e dois sidecars novos propostos. Cap público de uma tool pura atestada preservado; closure síncrono antes de await terminal e máscara de saída no trace e RuntimeResult persistido.

Gaps: revisão técnica do Lead e crítica fresca; revisão humana T3 do contrato concreto0217; slot/claims de migration e proteção mixed-writer a confirmar; K01–K12 ainda NOT_RUN. Demais consumidores/legacy/old kernel worker continuam fora do cutover e P100-010 permanece aberto. Não há aceite de durabilidade por Map ou por testes de outro runtime.

Comparação estática: snapshots íntegros, 1 inputs com drift atual documentado. Nenhuma fonte divergente foi sobrescrita. Formatação/links/revisão independente ficam com Lead por instrução final do usuário; nenhum gate amplo foi executado. Se o Lead editar a SPEC, deve emitir novo hash; este hash identifica apenas a candidata entregue.

Próxima ação: Lead revisa este desenho, trata gaps e prepara candidata concreta para gate humano; parar antes de implementação. Sem descendentes, code/manifests/lock/ledgers/state/root/ref writes, DB/provider, testes funcionais, commit/push ou produção.
