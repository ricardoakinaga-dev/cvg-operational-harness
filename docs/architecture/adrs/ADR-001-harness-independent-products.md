# ADR-001: Harness is independent of products

- Status: accepted for Phase 0/1
- Decision: products depend on harness contracts/runtime; neutral harness
  packages never import product/domain packages.
- Consequence: product-specific behavior is supplied through profiles and
  adapters, and brownfield migration is incremental.
