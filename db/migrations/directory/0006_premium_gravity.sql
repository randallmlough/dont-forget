CREATE TABLE `deleted_user_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`clerk_user_id_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`directory_deleted_at` integer,
	`clerk_deleted_at` integer,
	`anonymized_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deleted_user_identities_user_idx` ON `deleted_user_identities` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deleted_user_identities_hash_unique` ON `deleted_user_identities` (`clerk_user_id_hash`);