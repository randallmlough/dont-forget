CREATE TABLE "household_join_code_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"household_join_code_id" text NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"used_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_join_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"code" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"disabled_at" bigint,
	"disabled_by_user_id" text,
	"replaced_at" bigint,
	"replaced_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"turso_db_name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"provisioning_completed_at" bigint,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"deleted_at" bigint,
	CONSTRAINT "households_turso_db_name_unique" UNIQUE("turso_db_name")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"created_by_user_id" text NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"accepted_at" bigint,
	"accepted_by_user_id" text,
	"revoked_at" bigint,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"removed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"display_name" text,
	"active_household_id" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_join_code_uses" ADD CONSTRAINT "household_join_code_uses_household_join_code_id_household_join_codes_id_fk" FOREIGN KEY ("household_join_code_id") REFERENCES "public"."household_join_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_code_uses" ADD CONSTRAINT "household_join_code_uses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_code_uses" ADD CONSTRAINT "household_join_code_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_code_uses" ADD CONSTRAINT "household_join_code_uses_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_codes" ADD CONSTRAINT "household_join_codes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_codes" ADD CONSTRAINT "household_join_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_codes" ADD CONSTRAINT "household_join_codes_disabled_by_user_id_users_id_fk" FOREIGN KEY ("disabled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_join_codes" ADD CONSTRAINT "household_join_codes_replaced_by_user_id_users_id_fk" FOREIGN KEY ("replaced_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_active_household_id_households_id_fk" FOREIGN KEY ("active_household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_join_code_uses_code_idx" ON "household_join_code_uses" USING btree ("household_join_code_id");--> statement-breakpoint
CREATE INDEX "household_join_code_uses_household_idx" ON "household_join_code_uses" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "household_join_code_uses_user_idx" ON "household_join_code_uses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "household_join_codes_household_idx" ON "household_join_codes" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "household_join_codes_code_unique" ON "household_join_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "household_join_codes_active_household_unique" ON "household_join_codes" USING btree ("household_id") WHERE "household_join_codes"."disabled_at" IS NULL AND "household_join_codes"."replaced_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invitations_household_idx" ON "invitations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_household_idx" ON "memberships" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_active_unique" ON "memberships" USING btree ("household_id","user_id") WHERE "memberships"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_unique" ON "users" USING btree ("clerk_user_id");