PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`email` text,
	`first_name` text,
	`last_name` text,
	`display_name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `clerk_user_id`, `created_at`, `updated_at`)
SELECT `created_by_clerk_user_id`, `created_by_clerk_user_id`, (unixepoch() * 1000), (unixepoch() * 1000) FROM `households`
UNION
SELECT `clerk_user_id`, `clerk_user_id`, (unixepoch() * 1000), (unixepoch() * 1000) FROM `memberships`
UNION
SELECT `created_by_clerk_user_id`, `created_by_clerk_user_id`, (unixepoch() * 1000), (unixepoch() * 1000) FROM `invitations`
UNION
SELECT `accepted_by_clerk_user_id`, `accepted_by_clerk_user_id`, (unixepoch() * 1000), (unixepoch() * 1000) FROM `invitations` WHERE `accepted_by_clerk_user_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `households_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`turso_db_name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`provisioning_completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `households_new` (`id`, `name`, `turso_db_name`, `created_by_user_id`, `created_at`, `deleted_at`)
SELECT `id`, COALESCE(`name`, 'Untitled'), `turso_db_name`, `created_by_clerk_user_id`, `created_at`, `deleted_at` FROM `households`;
--> statement-breakpoint
CREATE TABLE `memberships_new` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `memberships_new` (`id`, `household_id`, `user_id`, `role`, `joined_at`, `removed_at`)
SELECT `id`, `household_id`, `clerk_user_id`, `role`, `joined_at`, `removed_at` FROM `memberships`;
--> statement-breakpoint
CREATE TABLE `invitations_new` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`token` text NOT NULL,
	`email` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_user_id` text,
	`revoked_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `invitations_new` (`id`, `household_id`, `token`, `email`, `created_by_user_id`, `created_at`, `expires_at`, `accepted_at`, `accepted_by_user_id`, `revoked_at`)
SELECT `id`, `household_id`, `token`, `email`, `created_by_clerk_user_id`, `created_at`, `expires_at`, `accepted_at`, `accepted_by_clerk_user_id`, `revoked_at` FROM `invitations`;
--> statement-breakpoint
DROP TABLE `invitations`;
--> statement-breakpoint
DROP TABLE `memberships`;
--> statement-breakpoint
DROP TABLE `households`;
--> statement-breakpoint
ALTER TABLE `households_new` RENAME TO `households`;
--> statement-breakpoint
ALTER TABLE `memberships_new` RENAME TO `memberships`;
--> statement-breakpoint
ALTER TABLE `invitations_new` RENAME TO `invitations`;
--> statement-breakpoint
CREATE UNIQUE INDEX `households_turso_db_name_unique` ON `households` (`turso_db_name`);
--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);
--> statement-breakpoint
CREATE INDEX `memberships_household_idx` ON `memberships` (`household_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_active_unique` ON `memberships` (`household_id`,`user_id`) WHERE "memberships"."removed_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);
--> statement-breakpoint
CREATE INDEX `invitations_household_idx` ON `invitations` (`household_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
