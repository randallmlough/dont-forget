ALTER TABLE "households" DROP CONSTRAINT "households_turso_db_name_unique";--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "turso_db_name";--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "provisioning_completed_at";