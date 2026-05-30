CREATE TABLE `household_join_code_attempts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`failed_count` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`last_failed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `household_join_code_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`household_join_code_id` text NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`used_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_join_code_id`) REFERENCES `household_join_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `household_join_code_uses_code_idx` ON `household_join_code_uses` (`household_join_code_id`);--> statement-breakpoint
CREATE INDEX `household_join_code_uses_household_idx` ON `household_join_code_uses` (`household_id`);--> statement-breakpoint
CREATE INDEX `household_join_code_uses_user_idx` ON `household_join_code_uses` (`user_id`);--> statement-breakpoint
CREATE TABLE `household_join_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`code` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`disabled_at` integer,
	`disabled_by_user_id` text,
	`replaced_at` integer,
	`replaced_by_user_id` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`disabled_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replaced_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `household_join_codes_household_idx` ON `household_join_codes` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_join_codes_code_unique` ON `household_join_codes` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_join_codes_active_household_unique` ON `household_join_codes` (`household_id`) WHERE "household_join_codes"."disabled_at" IS NULL AND "household_join_codes"."replaced_at" IS NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `active_household_id` text REFERENCES households(id);