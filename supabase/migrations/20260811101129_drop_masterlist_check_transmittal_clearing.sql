-- Item 15 Phase 3: remove check transmittal & clearing tracking from masterlist.
-- App code no longer reads/writes these columns (Phases 1-2).

ALTER TABLE masterlist
  DROP COLUMN check_transmittal_status,
  DROP COLUMN check_clearing_status,
  DROP COLUMN clearing_started_at;
