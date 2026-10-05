# CI — versão nativa PostgreSQL segura — R8

Task `CI_NATIVE_PG_VERSION_R8`, T2 corretivo sob SPEC0180/BUILD local aprovado.

Recon: reviewer R7 preservou Source e demonstrou emissão CLI PASS160000.5, rejeitada downstream. Execução inicial tentou DNS indevido; revisão formal INVALID, informação final mockada reproduzível.

Regra: produtor exige safeinteger no intervalo16 antes fs.writeFileSync. Controle ESMmock verificado por identidade antes import do produtor, sem conectar/dns; positivos16 e negativos fracionários/outromajor/NaN/infinito/safeinteger overflow. Formato público inalterado.

Pronto: CLI nativo mockado antes/depois, teste próprio append-only/original101 preservado, tipos/lint/regressões e crítico novo válido. Sem Rootcode/push/provider/produção.
