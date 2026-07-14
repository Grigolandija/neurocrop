ALTER TABLE action_feedback
    ADD COLUMN IF NOT EXISTS execution_details JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'action_feedback_execution_details_object'
    ) THEN
        ALTER TABLE action_feedback
            ADD CONSTRAINT action_feedback_execution_details_object
            CHECK (execution_details IS NULL OR jsonb_typeof(execution_details) = 'object');
    END IF;
END $$;
