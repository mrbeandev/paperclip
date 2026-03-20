-- Add metadata JSONB column to companies table for extensible settings
-- (e.g., projectAssignments for scoped member access)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
