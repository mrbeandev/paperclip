-- Create company_roles table
CREATE TABLE IF NOT EXISTS "company_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("company_id", "slug")
);

-- Create company_role_permissions table
CREATE TABLE IF NOT EXISTS "company_role_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_id" uuid NOT NULL REFERENCES "company_roles"("id") ON DELETE CASCADE,
  "permission_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("role_id", "permission_key")
);

-- Add role_id column to company_memberships
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "role_id" uuid REFERENCES "company_roles"("id");

-- Seed default roles for each existing company
INSERT INTO "company_roles" ("company_id", "slug", "display_name", "is_system")
SELECT c.id, 'admin', 'Admin', true FROM companies c
ON CONFLICT ("company_id", "slug") DO NOTHING;

INSERT INTO "company_roles" ("company_id", "slug", "display_name", "is_system")
SELECT c.id, 'manager', 'Manager', true FROM companies c
ON CONFLICT ("company_id", "slug") DO NOTHING;

INSERT INTO "company_roles" ("company_id", "slug", "display_name", "is_system")
SELECT c.id, 'employee', 'Employee', true FROM companies c
ON CONFLICT ("company_id", "slug") DO NOTHING;

-- Seed admin permissions (all keys)
INSERT INTO "company_role_permissions" ("role_id", "permission_key")
SELECT r.id, k.key FROM company_roles r
CROSS JOIN (VALUES
  ('agents:create'), ('agents:manage'), ('users:invite'), ('users:manage_permissions'),
  ('tasks:assign'), ('tasks:assign_scope'), ('joins:approve'),
  ('company:update'), ('company:archive'), ('company:delete'), ('company:transfer'),
  ('projects:create'), ('projects:update'), ('projects:delete'),
  ('goals:create'), ('goals:update'), ('goals:delete'),
  ('approvals:decide'), ('issues:create'),
  ('costs:view'), ('activity:view'), ('team:view'), ('dashboard:view_full'), ('settings:view')
) AS k(key)
WHERE r.slug = 'admin'
ON CONFLICT ("role_id", "permission_key") DO NOTHING;

-- Seed manager permissions (all except company:delete, company:transfer, company:archive, users:manage_permissions)
INSERT INTO "company_role_permissions" ("role_id", "permission_key")
SELECT r.id, k.key FROM company_roles r
CROSS JOIN (VALUES
  ('agents:create'), ('agents:manage'), ('users:invite'),
  ('tasks:assign'), ('tasks:assign_scope'), ('joins:approve'),
  ('company:update'),
  ('projects:create'), ('projects:update'), ('projects:delete'),
  ('goals:create'), ('goals:update'), ('goals:delete'),
  ('approvals:decide'), ('issues:create'),
  ('costs:view'), ('activity:view'), ('team:view'), ('dashboard:view_full'), ('settings:view')
) AS k(key)
WHERE r.slug = 'manager'
ON CONFLICT ("role_id", "permission_key") DO NOTHING;

-- Seed employee permissions (basic only)
INSERT INTO "company_role_permissions" ("role_id", "permission_key")
SELECT r.id, k.key FROM company_roles r
CROSS JOIN (VALUES
  ('tasks:assign'), ('issues:create')
) AS k(key)
WHERE r.slug = 'employee'
ON CONFLICT ("role_id", "permission_key") DO NOTHING;

-- Migrate existing memberships: owner -> admin role
UPDATE "company_memberships" cm
SET
  "role_id" = r.id,
  "membership_role" = 'admin'
FROM "company_roles" r
WHERE cm."company_id" = r."company_id"
  AND r."slug" = 'admin'
  AND cm."membership_role" = 'owner';

-- Migrate existing memberships: member/null -> employee role
UPDATE "company_memberships" cm
SET
  "role_id" = r.id,
  "membership_role" = 'employee'
FROM "company_roles" r
WHERE cm."company_id" = r."company_id"
  AND r."slug" = 'employee'
  AND (cm."membership_role" = 'member' OR cm."membership_role" IS NULL)
  AND cm."role_id" IS NULL;
