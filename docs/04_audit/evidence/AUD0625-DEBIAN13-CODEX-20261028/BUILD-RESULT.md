# AUD0625 — Debian 13: entrega local ao Opus

**Implementação e provas locais concluídas; qualificação integral e aceite pendentes.** Sem push, PR, merge ou deploy. Produção NO_GO. Esta entrega não altera a auditoria 0625 congelada.

Fonte: branch `codex/aud0625-debian13-20261028`, commit `6494d2f637676f27f42f83c2e8d65b0d7815a8eb`, base `8429019b36f150828bfccef0080fdeff4a635fed`. Worktree `/mnt/dados/cvg-work/aud0625-debian13-codex-20261028/candidate`. Atribuição explícita Opus8494 (tarefa8309), SPEC SHA `d2fa73d21495799248163815d632b3229a7e1c6f56cdb75d9ccf79a2e789e534`, recibo SHA `14ea85639b6b3302eed79c955e89f0b04540502c96b667773aa469397c3890ec`. Atribuição8494 atualiza o baseline histórico61e5 para8429 apósPR29; SPEC congelada intacta.

O Dockerfile passa a usar `gcr.io/distroless/cc-debian13:nonroot@sha256:3ee00291cf386ec52a552e6a858d555debd74776eb4bfa53fa3df2cd6677515e`. Só muda a linha FROMruntime e a expectativa Debian13 em `tests/runtime-image-contract.test.js`. Node22.23.2, lock, código, build/web, políticas do scanner e fornecedores de assinatura permanecem nos bytes de origem: 1365 paths de fonte comparados. `source.patch` e `source-post.json` sustentam esse recorte.

| Critério | Resultado real e evidência |
|---|---|
| C1 | Negativo antigo preservado e reproduzido: `trivy-old-negative-sealed.json` exit1, CVE-2026-84782/libssl3 3.0.20-1~deb12u2/HIGH, fixed3.0.22-1~deb12u2. Referência histórica permanece na SPEC e seus inputs; este run não substitui o CI histórico. |
| C2 | Cosign3.1.4 oficial/checksums conferidos: assinatura exit0, identidade keyless@distroless.iam.gserviceaccount.com, issueraccounts.google.com, transparência verificada. Index/manifest/layers conferidos por SHA; libssl3t64 3.5.7-1~deb13u3 ligado à camada aprovada. |
| C3 | Exatamente os dois paths de fonte acima. Mesmo NodebinSHA3517c2df… e dependências. Documentação/evidências deste pacote são adicionais e não entram no build. |
| C4 | Build runtime exit0/517.312s <600. API PASS1.455s; worker controlled-memory PASS1.060s, processed1/durablefalse/externalEffectsfalse; TLS PASS0.628s; heartbeat compilado PASS3.531s, mtimes distintos, live0, stale1, ausência1. Inventário nativo exit0/0.605s, limpeza reconciliada separadamente. UID/GID10001, rede none, readonly, cap-dropALL, no-new-privileges, pids128/mem512MiB/cpu1/tmpfs16MiB. Todos os contêineres próprios ausentes ao fechar. |
| C5 | Trivy0.70.0 oficial e mesmo DB congelado PRE/POST; policy novo exit0, antigo exit1; informativo selado ignore-unfixed=false exit0. Debian13.7, 14 pacotes OS exatos e 122 registros de manifestos Node ligados ao filesystem; 84 pares nome/versão de terceiros na closure efetiva sem omissão. Zero HIGH/CRITICAL, incluindo sem correção. Workspaces privados inventariados não são certificados pela ausência de CVEs. |
| C6 | Types/lint passaram no comando que depois falhou em Prettier sobre Dockerfile sem parser. Formato do teste passou; contrato3/3 passou em2.179s; revisão independenteR1 aprova fonte e identifica qualificação pendente. **npmtest integral/PG/E2E atuais NÃO EXECUTADOS nesta fatia**, por orientação de carga8980 do DF; executar uma vez na integração. Não herdar PASS de outro SHA. R2 independente: fonte/provas locais APTAS ao handoff; não substitui a barra integral. |
| C7 | Pacote local e rollback documentados. CI, proveniência, SBOM/atestação e aceite do destino continuam obrigatórios na integração. Publicação pertence ao Opus/DF conforme9007. |

## Identidade do artefato e confiança

Imagem retida `cvg-aud0625-debian13-codex:20261028`, referência imutável `cvg-aud0625-debian13-codex@sha256:1751d6a8e4b88fd09e09f147a8cfa96534936a2edf8d79ce4dc10ea5ec495fcc`. Docker29/containerd: index1751d6a8; manifestlinux/amd64 `3871fa1ed4bfc674759570687560ca4af21994d4c19d03720cb98d836353f520`; config `f553696fa559c8cb67eb28374dd3cc845d8172157f483e8064180f9a9f9a9da7`. Reports do scanner usam o index, também conferido na criação dos probes. `runtime-saved-config.json`, `saved-index.json`, `saved-manifest.json`, arquivos do build e inventário vinculam o artefato. Nenhuma imagem foi publicada.

`closed-local-oracles.json`: NodebinSHA `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`, Nodev22.23.2/OpenSSL3.5.7/FIPS0, 145 raízes bundled e digest77ca0eda… idênticos ao pin original48e4b67d executado em controle próprio. CAs do sistema são distintas das raízes Node: arquivo SHAe9c7b63e… lido pelo UID10001/mode0555 corresponde aos bytes da camada verificada Debian13. Deb12 tinha150 raízes, Deb13 tem148: removidas AAA Certificate Services e emSign ECC Root CA–G3, fingerprints completos no JSON; zero adições. Nenhuma CA sintética entra no truststore.

TLS em loopback da rede none, rejectUnauthorized=true, positivo authorizedtrue/200/marcador exato. Default sem CA sintética e CA diferente rejeitam UNABLE_TO_VERIFY_LEAF_SIGNATURE; hostname errado ERR_TLS_CERT_ALTNAME_INVALID; expirado CERT_HAS_EXPIRED. Nenhum negativo aceita resposta; quatro substituições deliberadas por resultado autorizado são rejeitadas pelo validador. `SSL_CERT_FILE` é o caminho padrão herdado do distroless, não uma CA externa; não há NODE_OPTIONS/use-system-ca/extraCA/verificationoverride. Prova limitada ao perfil bundled local, não ao destino corporativo.

Código copiado (API/worker/Node/package.json) tem UID0/GID0; package.json0664 tem escrita apenas para grupo0, diferente do GID10001. Diretório /app pertence a65532 no distroless; isso não equivale à propriedade dos arquivos de código. Rootfs readonly e UID10001 não permitem reescrita. Ausência de shell, package manager, devdependencies e fontes TS confirmada.

## Tentativas preservadas e diagnóstico

- Primeiro CLI de build falhou antes do build porque o DOCKER_CONFIG privado não encontrava Buildx. Diretório do plugin existente explicitamente configurado, SHA registrado; um único build real terminou517.312s. Contexto reduzido preparado para diagnóstico nunca foi usado em segundo build.
- Criações Docker expiraram sob saturação do host, inclusive controle Node inalterado e APIUnix. Contêineres apareceram tardiamente e foram reconciliados por ID/nome/label/imagem/Created; nunca atribuir essa falha à aplicação. DF9007 mediu recuperação de carga e readmitiu provas seriais. Sem restart de daemon, prune global ou recursos alheios.
- Primeiro inventário teve timeout20s do cliente e falhas transitórias de stop/inspect. Estado/logs posteriores mostram exit0/20.106s; falha original mantida e recurso removido. Após diagnóstico/recuperação, admissão única do inventário final: aplicação exit0/0.605s. O verificador de ausência usou `docker inspect` genérico e falhou apesar de rm0; reconciliação por `docker container inspect` comprova ausência. Sem novo retry de aplicação para corrigir essa assertiva.
- Primeiro heartbeat falhou antes de start porque minha fixture fornecia handlers vazios. Correção apenas na fixture, dois handlers sintéticos obrigatórios que rejeitam qualquer efeito inesperado, sem dados pendentes. Admissão prospectiva em `qa-diagnostic-readmission.json`; único run corrigido passou3.531s. Não houve mudança do runtime ou de prazoSPEC60/worker15.
- Validador de ownership inicialmente rejeitou package.json0664, embora grupo0 não seja o GID10001. Diagnóstico e correção explícitos em `qa-ownership-validator-correction.json`; nenhuma aplicação reexecutada por isso. Build, política e controles não foram enfraquecidos.
- Scans preliminares não são apresentados como vinculados ao seloPRE posterior. Apenas policy-final, negativo-final e informativo-final, iniciados depois do PRE, compõem a cadeia com finalPOST. Informativo anterior é mantido separadamente.

## Próxima ação e rollback

Opus/DF: integrar/cherry-pick a fonte6494d2f637… e este pacote, reconciliar outras branches, executar uma vez npmtest/PG/E2E/gates atuais na ponta integrada conforme8980, fazer CI/atestação/SBOM atuais e rever o resultado antes de aceite. O artefato local desta fonte não representa automaticamente uma imagem reconstruída de integração.

Reverter o FROM para o pin Debian12 antigo remove a migração, mas restaura uma vulnerabilidade HIGH conhecida; **essa reversão NÃO É PROMOVÍVEL**. Se necessário interromper a adoção e manter NO_GO, sem copiar bibliotecas antigas ou liberar o pin vulnerável. Destino, homologação e produção não são autorizados por esta entrega.

DB congelado SHA `1c66d0d801a194ed5df7a9c334d7991a6529d82952ab07a23cff1047c637c598`; metadadosd70ca90d…; toolchecksums e todos comandos/exitcodes/tempos nos JSON/logs. Binários de ferramentas, DB1.6GB, imagemtar e chaves privadas permanecem fora de docs; somente provas necessárias e certificados públicos são anexados. Auditoria0625 original e relatos de outros agentes preservados.

## Revisão final e consolidação

R2 independente aprovou a fonte e as provas locais para handoff, mantendo C6/aceite integral pendentes e NO_GO. Ressalva não bloqueadora: o agregado close-oracles.py ainda consultava informativo preliminar; o revisor conferiu os raws selados finais diretamente. Após o parecer, corrigi apenas o nome do input do validador para o informativo selado e reexecutei as comparações offline; nenhum runtime, scan ou teste de aplicação foi repetido. Versão anterior preservada. WrapperFAIL original do inventário não foi reescrito.

Aviso de baseline GBrain9104: o DF relata3/108 FAIL em tests/claude100/reference-port/controller.test.js também na main limpa8429 (expected undefined to be INFRA_FAILURE). Não reproduzido por esta sessão, dono externo claude100/reference-port. Registrar separadamente para C6, sem atribuir à migração ou conceder waiver.
