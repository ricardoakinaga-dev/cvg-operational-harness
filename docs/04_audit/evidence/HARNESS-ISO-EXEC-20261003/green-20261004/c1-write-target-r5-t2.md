# C1_WRITE_TARGET_R5 — T2 local sintético

Task registrada sob SPEC0180 aprovada e autorização contínua. Recon: crítica estática R4 válida encontrou perda de fluxo de label neutro no inicializador var dentro de catch simples; propriedade da declaração pertence ao corpo, mas a escrita resolve o binding catch.

BUILD privado: separar identity de declaração e writeIdentity de inicializador; aplicar nos dois consumidores fixed-point, conservando transfers parâmetro→body e shadows. Não executar novas fixtures: AST/checker/labels apenas. Preservar originais253 e prefixo188. Sem alteração de contrato público, barra, exceções, allowlist ou resolução desconhecida.

Pronto: regressões próprias e anteriores, tipos/lint/formato, prova estática antes/depois e crítica independente nova. Scanner installed permanece INCOMPLETE enquanto não houver prova/aceite; suíte completa/PG/E2E e promoção são gates separados. Sem provider real, dados reais, push ou produção.
