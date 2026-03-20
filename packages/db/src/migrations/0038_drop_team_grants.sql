-- Migrate canInvite flags to permission grants before dropping tables
INSERT INTO "principal_permission_grants" ("company_id", "principal_type", "principal_id", "permission_key", "granted_by_user_id", "created_at", "updated_at")
SELECT tag."company_id", 'user', tag."user_id", 'users:invite', tag."created_by_user_id", NOW(), NOW()
FROM "team_access_grants" tag
WHERE tag."user_id" IS NOT NULL
  AND tag."status" = 'active'
  AND tag."can_invite" = true
ON CONFLICT DO NOTHING;

-- Drop legacy team access tables
DROP TABLE IF EXISTS "team_access_grant_agents";
DROP TABLE IF EXISTS "team_access_grants";
