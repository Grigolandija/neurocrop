ALTER TABLE action_feedback
  DROP CONSTRAINT IF EXISTS action_feedback_status_check;

ALTER TABLE action_feedback
  ADD CONSTRAINT action_feedback_status_check
  CHECK (status IN ('in_progress', 'completed', 'deferred', 'failed'));
