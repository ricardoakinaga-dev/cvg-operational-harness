-- Enforce independent validation for controlled release-candidate evidence.
-- Existing rows that violate this invariant must be remediated before rollout.
ALTER TABLE platform_release_candidates
  DROP CONSTRAINT IF EXISTS platform_release_candidates_validation_actor_check;

ALTER TABLE platform_release_candidates
  ADD CONSTRAINT platform_release_candidates_validation_actor_check
  CHECK (
    status <> 'VALIDATED'
    OR (
      validated_by IS NOT NULL
      AND btrim(validated_by) <> ''
      AND validated_at IS NOT NULL
      AND validated_by IS DISTINCT FROM created_by
    )
  );
