# REM21-017 — Decision Record

Data: 2026-09-22  
Finding: `A21-F19`, `A21-F22`, `A21-F23`, `A21-F26`  
Decision: `SPEC_APPROVED_CONTROLLED_BUILD`  
Contract: `rem21-017-v1`

## Decisão

Autorizar BUILD local para quatro slices: parser/scan completo, correção de
portabilidade histórica, catálogo verificável de vazios e índice derivado dos
ledgers. O JSON vazio histórico permanece byte-for-byte vazio; o significado é
registrado por metadado separado. Nenhuma captura ausente pode virar PASS.

## Base

- o RED reproduziu 43 quebrados, 12 absolutos, 66 vazios e JSON histórico
  inválido;
- `DISCOVERY.md` separou os 41 falsos positivos de localização dos dois links
  realmente quebrados;
- `PRD.md` congelou a meta de zero quebrados e zero vazios sem status;
- `SPEC.md` definiu o contrato de saída, catálogo central, sidecar específico
  e índice sem segunda fonte de status;
- F24/F25 permanecem corretamente atribuídos ao REM21-018.

## Guardrails

Somente arquivos locais, documentação histórica e fixtures temporárias. Não
alterar fonte de produto, banco, provider, IdP, canal, dados reais ou
produção. A referência da skill externa não será convertida em link interno
falso.

## Próximo gate

Implementar os arquivos congelados, executar fixtures RED/GREEN, o scan completo
e a checagem de higiene; depois registrar BUILD/AUDIT com contagens e hashes.
