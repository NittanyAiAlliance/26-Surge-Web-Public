-- 018_drop_model_default.sql
-- Remove the hardcoded 'claude-sonnet-4-6' default from the model column.
-- With multi-provider support, the application layer always provides the model.
ALTER TABLE generations ALTER COLUMN model DROP DEFAULT;
