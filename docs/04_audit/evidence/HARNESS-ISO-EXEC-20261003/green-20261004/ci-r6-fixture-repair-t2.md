# CI_R6_FIXTURE_REPAIR — T2 local sintético

Task registrada sob SPEC0180 aprovada e autorização de correção contínua. Recon: validators corrigidos recusam cinco fixtures HISO incompletas; variante fisicamente neutra possui 250 fontes aprovadas, enquanto quatro controles assumem sempre 281. Estes testes pertencem aos caminhos novos GREEN, não aos 371 registros originais.

BUILD: completar fixtures pelos produtores verdadeiros e derivar expectativas da projeção exata vinculada. Preservar casos, assertions de segurança, limites de tempo, barras, registros originais e evidência antes/depois. Nunca aceitar payload nativo incompleto ou usar syntheticValidationOnly como bypass. Escrita privada nos testes próprios HISO e helpers sintéticos; sem alteração adicional de validator.

Pronto: controles retidos e físicos neutros verdes, tipo/lint/formato, patch/hash e revisão independente; suíte completa, PG e E2E continuam gates separados. Sem provider real, dados reais, push, implantação ou produção.
