/**
 * LEGACY COMPOSITION POINT (SPEC-LEGACY-001 rule R2, SPEC-LEGACY-002 slice 2).
 * The only module of the API that reaches legacy code: the development
 * bootstrap still publishes the Esmeralda V2 secretary preset until the
 * neutral reference flow (PR-L07) replaces it.
 */
export { ensureControlledSecretaryPreset } from '@cvg/legacy-secretary-profile'
