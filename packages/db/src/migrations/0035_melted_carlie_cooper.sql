CREATE TABLE "team_access_grant_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_access_grant_agents" ADD CONSTRAINT "team_access_grant_agents_grant_id_team_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."team_access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_access_grant_agents" ADD CONSTRAINT "team_access_grant_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_access_grants" ADD CONSTRAINT "team_access_grants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_access_grant_agents_grant_agent_unique_idx" ON "team_access_grant_agents" USING btree ("grant_id","agent_id");--> statement-breakpoint
CREATE INDEX "team_access_grant_agents_grant_id_idx" ON "team_access_grant_agents" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "team_access_grant_agents_agent_id_idx" ON "team_access_grant_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_access_grants_company_email_unique_idx" ON "team_access_grants" USING btree ("company_id","email");--> statement-breakpoint
CREATE INDEX "team_access_grants_company_status_idx" ON "team_access_grants" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "team_access_grants_user_id_idx" ON "team_access_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_access_grants_email_idx" ON "team_access_grants" USING btree ("email");