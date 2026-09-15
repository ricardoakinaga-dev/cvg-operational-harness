# MCP readiness

## Estado

**ABSENT como implementação; PARTIAL como seam conceitual.** Busca em código/manifests não encontrou Model Context Protocol, SDK, server/client, discovery, JSON-RPC ou transport lifecycle.

`PluginRegistry`/`CapabilityGateway` oferece versão, manifest, schema, policy, approval e audit, portanto pode receber um adapter futuro. Isso não torna o sistema MCP-ready operacionalmente.

Faltam:

- transport/session lifecycle e health;
- list/discovery de tools e conversão de schemas;
- namespace/version mapping e collision rules;
- cancellation/deadline/response-size;
- credentials e client pooling tenant-safe;
- remote provenance e error/result mapping;
- trust/prompt/tool injection boundaries;
- policy/approval/idempotency/audit equivalentes ao native path.

Esforço: **alto**, depois de unificar o capability contract. Não implementar MCP antes de uma capability nativa e uma plugin passarem a mesma conformance suite. Score: **3/10**.
