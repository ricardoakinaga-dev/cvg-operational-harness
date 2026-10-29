#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 2: mutates the 0034 SQL text, runs the PG test, reverts with git checkout."""
import json, os, subprocess, sys
F = 'packages/persistence/migrations/0034_session_writer_ownership.sql'
T = 'packages/persistence/src/__tests__/par-s01-session-ownership-postgres.test.ts'
L = 'packages/persistence/src/__tests__/pdsh-021-session-events-postgres.test.ts'
M = [
 ('no-identity-nocycle', "MAXVALUE 2147483647 NO CYCLE", "MAXVALUE 2147483647 CYCLE"),
 ('no-unique', "  ADD CONSTRAINT session_streams_writer_lock_id_key UNIQUE (writer_lock_id),\n", ""),
 ('no-paired', "ADD CONSTRAINT session_streams_header_cut_paired CHECK ((header_json IS NULL) = (inherited_event_count IS NULL)),", ""),
 ('no-header-size', "octet_length(header_json) <= 65536", "true"),
 ('no-cut-range', "BETWEEN 0 AND 9007199254740991);", "BETWEEN -5 AND 9007199254740991);"),
 ('default-header-not-seeded', "'isSeeded', false)::text", "'isSeeded', true)::text"),
 ('default-header-cut', "NEW.inherited_event_count := 0;", "NEW.inherited_event_count := 1;"),
 ('event-guard-trylock-off', "IF NOT pg_try_advisory_xact_lock((to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id) THEN", "IF false THEN"),
 ('event-guard-blocking', "IF NOT pg_try_advisory_xact_lock((to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id) THEN\n    RAISE EXCEPTION 'session is owned by another writer' USING ERRCODE = '55P03';\n  END IF;\n  IF NEW.sequence", "PERFORM pg_advisory_xact_lock((to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id);\n  IF NEW.sequence"),
 ('event-guard-key-oid', "(to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id)", "(to_regclass('session_events')::oid::bigint - 2147483648)::integer, lock_id)"),
 ('event-guard-key-offset', "(to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id)", "(to_regclass('session_streams')::oid::bigint - 2147483647)::integer, lock_id)"),
 ('event-guard-sequence', "IF NEW.sequence IS DISTINCT FROM expected THEN", "IF false THEN"),
 ('stream-guard-lockid-immutable', "IF NEW.writer_lock_id IS DISTINCT FROM OLD.writer_lock_id THEN", "IF false THEN"),
 ('stream-guard-trylock', "IF NOT pg_try_advisory_xact_lock((TG_RELID::bigint - 2147483648)::integer, OLD.writer_lock_id) THEN", "IF false THEN"),
 ('stream-guard-header-frozen', "IF NEW.header_json IS DISTINCT FROM OLD.header_json\n       OR NEW.inherited_event_count IS DISTINCT FROM OLD.inherited_event_count THEN", "IF false THEN"),
 ('stream-guard-cut-frozen', "\n       OR NEW.inherited_event_count IS DISTINCT FROM OLD.inherited_event_count THEN", " THEN"),
 ('adoption-authority', "IF current_user <> table_owner THEN", "IF false THEN"),
 ('stream-guard-cursor', "IF NEW.next_sequence IS DISTINCT FROM head + 1 THEN", "IF false THEN"),
 ('no-delete-trigger', "CREATE TRIGGER session_streams_no_delete BEFORE DELETE", "CREATE TRIGGER session_streams_no_delete_x BEFORE INSERT"),
 ('no-truncate-trigger', "CREATE TRIGGER session_streams_no_truncate BEFORE TRUNCATE", "CREATE TRIGGER session_streams_no_truncate_x BEFORE DELETE"),
 ('commit-check-events', "CREATE CONSTRAINT TRIGGER session_events_cursor_at_commit AFTER INSERT ON session_events\n  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_session_cursor_at_commit();", ""),
 ('commit-check-streams', "CREATE CONSTRAINT TRIGGER session_streams_cursor_at_commit AFTER INSERT OR UPDATE ON session_streams\n  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_session_cursor_at_commit();", ""),
 ('commit-check-body', "IF cursor_value IS DISTINCT FROM head + 1 THEN", "IF false THEN"),
 ('requires-0028', "IF to_regclass('session_streams') IS NULL OR to_regclass('session_events') IS NULL THEN", "IF false THEN"),
 ('revoke-public', "EXECUTE format('REVOKE ALL ON FUNCTION %I() FROM PUBLIC', fn);", "NULL;"),
 ('search-path', "EXECUTE format('ALTER FUNCTION %I() SET search_path = pg_catalog, %I, pg_temp', fn, current_schema());", "NULL;"),
 ('search-path-no-pg-temp', "SET search_path = pg_catalog, %I, pg_temp'", "SET search_path = %I, pg_catalog'"),
 ('search-path-temp-first', "SET search_path = pg_catalog, %I, pg_temp'", "SET search_path = pg_temp, pg_catalog, %I'"),
]
src = open(F).read()
env = dict(os.environ)
res = []
for name, a, b in M:
    if a not in src:
        res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
    open(F, 'w').write(src.replace(a, b, 1))
    r = subprocess.run(['npx','vitest','run',T,L,'--maxWorkers=1','--testTimeout=60000'],capture_output=True,text=True,env=env)
    subprocess.run(['git','checkout','--',F])
    res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
print(json.dumps(res, indent=1))
json.dump(res, open(sys.argv[1], 'w'), indent=1)
