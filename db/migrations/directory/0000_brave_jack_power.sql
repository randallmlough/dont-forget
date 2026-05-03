CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`turso_db_name` text NOT NULL,
	`created_by_clerk_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `households_turso_db_name_unique` ON `households` (`turso_db_name`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`token` text NOT NULL,
	`email` text,
	`created_by_clerk_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_clerk_user_id` text,
	`revoked_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `invitations_household_idx` ON `invitations` (`household_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`removed_at` integer,
	`turso_token_id` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`clerk_user_id`);--> statement-breakpoint
CREATE INDEX `memberships_household_idx` ON `memberships` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_active_unique` ON `memberships` (`household_id`,`clerk_user_id`) WHERE "memberships"."removed_at" IS NULL;