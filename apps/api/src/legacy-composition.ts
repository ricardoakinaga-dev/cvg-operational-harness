/**
 * LEGACY COMPOSITION POINT (SPEC-LEGACY-001 rule R2, SPEC-LEGACY-002 slice 2,
 * SPEC-LEGACY-004). The only module of the API that reaches legacy code: the
 * development bootstrap still publishes the Esmeralda V2 secretary preset, and
 * the tutor/pet/appointment journeys are composed here until the neutral
 * reference flow (PR-L07) replaces them.
 */
export { ensureControlledSecretaryPreset } from '@cvg/legacy-secretary-profile'
export {
  JourneyRepository,
  PostgresJourneyRepository,
  type JourneyRepositoryPort
} from '@cvg/legacy-secretary-journeys'
