PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `lists_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
INSERT INTO `lists_new` (`id`, `name`, `created_by_user_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, `name`, `created_by_clerk_user_id`, `created_at`, `updated_at`, `deleted_at` FROM `lists`;
--> statement-breakpoint
CREATE TABLE `items_new` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`position` real NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `items_new` (`id`, `list_id`, `name`, `notes`, `position`, `created_by_user_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, `list_id`, `name`, `notes`, `position`, `created_by_clerk_user_id`, `created_at`, `updated_at`, `deleted_at` FROM `items`;
--> statement-breakpoint
CREATE TABLE `item_checks_new` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`checked_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`item_id`, `user_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `item_checks_new` (`item_id`, `user_id`, `checked_at`, `updated_at`)
SELECT `item_id`, `clerk_user_id`, `checked_at`, `updated_at` FROM `item_checks`;
--> statement-breakpoint
DROP TABLE `item_checks`;
--> statement-breakpoint
DROP TABLE `items`;
--> statement-breakpoint
DROP TABLE `lists`;
--> statement-breakpoint
ALTER TABLE `lists_new` RENAME TO `lists`;
--> statement-breakpoint
ALTER TABLE `items_new` RENAME TO `items`;
--> statement-breakpoint
ALTER TABLE `item_checks_new` RENAME TO `item_checks`;
--> statement-breakpoint
CREATE INDEX `lists_deleted_idx` ON `lists` (`deleted_at`);
--> statement-breakpoint
CREATE INDEX `items_list_idx` ON `items` (`list_id`);
--> statement-breakpoint
CREATE INDEX `items_deleted_idx` ON `items` (`deleted_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
