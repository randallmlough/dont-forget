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
UPDATE `households` SET `name` = 'Untitled' WHERE `name` IS NULL;
--> statement-breakpoint
ALTER TABLE `households` ADD `created_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `households` ADD `provisioning_completed_at` integer;
--> statement-breakpoint
UPDATE `households`
SET
	`created_by_user_id` = `created_by_clerk_user_id`,
	`provisioning_completed_at` = (unixepoch() * 1000)
WHERE `created_by_user_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `memberships` ADD `user_id` text;
--> statement-breakpoint
UPDATE `memberships` SET `user_id` = `clerk_user_id` WHERE `user_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `memberships_app_user_idx` ON `memberships` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_active_app_user_unique` ON `memberships` (`household_id`,`user_id`) WHERE "memberships"."removed_at" IS NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD `created_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `invitations` ADD `accepted_by_user_id` text;
--> statement-breakpoint
UPDATE `invitations`
SET
	`created_by_user_id` = `created_by_clerk_user_id`,
	`accepted_by_user_id` = `accepted_by_clerk_user_id`
WHERE `created_by_user_id` IS NULL;
