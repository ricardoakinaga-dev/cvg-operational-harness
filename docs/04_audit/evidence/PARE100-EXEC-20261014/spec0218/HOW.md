# HOW — SPEC0218, handoff para Lead

Somente design. Nenhum comando de BUILD abaixo foi executado nesta lane.

1. Conferir `source-recon.json` contra bytes atuais; reconciliar drift antes de revisar. Ler SPEC0218 e `decision-gaps.json`, preservando o cartão original0378. Produzir parecer técnico fresco em evidência própria do Lead. Se houver mudanças, reemitir hashes; não autoaceitar este documento.
2. Lead registra o gate concreto da SPEC+packet e a decisão explícita do usuário. A autorização de design e a aprovação histórica0211 não permitem implementar0218. Registrar claims de BUILD e plano/ledgers pelo owner; nenhum path desta proposta concede claim implícito de implementação.
3. Implementar primeiro pacote local em `packages/sdk/python/cvg_sdk/` e contrato/validação; depois attach não bloqueante com fila/timer; depois quatro wrappers. Não adicionar spawn, HTTP, RPCs, dependency, manifest ou lock. APIs/arquivos exatos e semântica estão na SPEC, seções4–6.
4. Projetar os dois JSON a partir das fontes CVG pinadas. Comparar nove fingerprints e STOP_REASONS com os exports públicos compilados; não executar código da referência. Produzir fixtures boas imutáveis distintas das mutações adversariais. Instalação Python zero; distribuição por cópia local confiável.
5. Lead constrói servidor compilado com Node22 e dependências já locais, sob claim de build próprio. Comando existente, a executar somente após o gate:

   ```sh
   node scripts/build-public-workspace.mjs packages/sdk
   ```

6. Runner planejado recebe executável Node22 absoluto como argumento explícito, nunca lê env para descobri-lo. Exemplo futuro (substituir o argumento pelo path confiável validado pelo Lead):

   ```text
   python3 -I -S -B packages/sdk/python/tests/run.py --node /absolute/trusted/node --suite all
   python3 -I -S -B packages/sdk/python/tests/run.py --suite unit
   ```

   `--suite` aceita apenas unit/interop/all; unit não inicia Node nem exige sua instalação. Runner anexa somente raiz Python derivada do próprio arquivo, inicia fixture literal com modo fixo e aplica finally/ownership/prazos da SPEC. Logs/transcripts/resultados novos vão ao diretório de evidência do BUILD com claim próprio, não sobrescrevem os hashes desta proposta. Nenhum pip, venv obrigatório, pacote externo, .env ou rede.
7. Executar todos os cenários/aceites PY01–PY10, distinguindo pipes reais, peer corrompido e syscall/clock injetados. Reproduzir incerteza após efeito com servidor/kernel/store público real; não substituir por mock. Validar import em cópia isolada só Python+JSON. Declarar plataformas/versões efetivamente testadas e restrições adicionais de parser/size.
8. Lead roda os gates do repo aplicáveis à candidata T3 integrada; PG/E2E/cert/SBOM/licenses/lock só com claims exclusivos. Não relaxar scanner para acomodar .mjs/Python; diagnóstico de coverage/ownership ausente exige proposta/claim separado, nunca PASS implícito. PUBLIC_API/consumer-pins/CI são do Lead.
9. Crítico de BUILD fresco, distinto do builder, inspeciona fontes/transcripts/contadores/cleanup e hashes. Registrar somente resultado da fatia, mantendo P100-025/paridade integral abertos. Atualizações canônicas de99/20/30/0378 pertencem ao Lead; esta lane não as editou.

Recovery: preservar resposta remota/estado unknown, sem replay de turn/open. Adaptador fecha apenas seus callbacks/futures; host reconcilia sessão/journal e encerra seu próprio processo. Rollback do futuro pacote é retirada da adição própria, sem alterar store/servidor/contratos ou apagar evidência de falha. Nenhum comando de reset/restore/clean está autorizado.
