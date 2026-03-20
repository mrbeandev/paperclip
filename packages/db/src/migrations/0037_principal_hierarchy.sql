-- Add hierarchy columns to company_memberships for mixed human/agent reporting
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "reports_to_user_id" text;
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "reports_to_agent_id" uuid;

-- Add human supervisor column to agents table
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "reports_to_user_id" text;

-- Migrate active team_access_grants into company_memberships (dual-write bridge)
INSERT INTO "company_memberships" ("company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at")
SELECT tag."company_id", 'user', tag."user_id", 'active', 'member', tag."created_at", NOW()
FROM "team_access_grants" tag
WHERE tag."user_id" IS NOT NULL
  AND tag."status" = 'active'
ON CONFLICT ("company_id", "principal_type", "principal_id") DO NOTHING;
