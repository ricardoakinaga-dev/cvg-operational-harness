# Critérios independentes r1

Fonte inicial review-inputs.json, pins conferidos antes dos probes. Relatório do builder não lido.

- TK01: imports do entrypoint único e execução das três famílias reais; oráculos anteriores não removidos.
- TK02–03: identidade padrão; somente metadados enumerados; corpus com adulterações independentes de payload/resposta/input/output/erro/efeito/approval/operação/budget/tenant/tipo/ordem/quantidade e relações de IDs deve continuar distinto.
- TK04: JSON inválido e políticas malformadas recusados; snapshots sem aliases mutáveis e sem mutação da entrada. Accessors/toJSON/protótipos comuns proporcionais ao contrato privado; nenhum requisito de sandbox contra Proxy arbitrário.
- TK05: manifesto canônico, fechado, sintético e sem PASS/paridade; duplicata/versão/unknown recusados; casos ordenados.
- TK06: sinks preservam referências por default e cópia/hook explícitos, propagam falhas; relógio e IDs locais; caminhos reais deny/approval/efeitos explícitos do replay e SDK.
- TK07: diff versus 7ecc5b53 e hashes de aplicação/config/lock/fixtures/goldens; execução focal própria e controles negativos privados. Testes que escrevem temporários serão copiados byte a byte para overlay privado; fontes originais permanecem readonly.
- TK08: fora do veredicto. Não executar gates gerais, PG/Docker/certify/E2E/install/rede/commit, nem descendentes de agentes.

Severidade: P1 erro central que concede falso positivo ou perde evidência; P2 quebra relevante de contrato/regressão privada; P3 observação não bloqueante. Encerrar com APPROVE_SCOPED_DIFF ou REVISE, sem DONE de PAR/paridade.
