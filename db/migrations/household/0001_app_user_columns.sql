ALTER TABLE `lists` ADD `created_by_user_id` text;
--> statement-breakpoint
UPDATE `lists` SET `created_by_user_id` = `created_by_clerk_user_id` WHERE `created_by_user_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `items` ADD `created_by_user_id` text;
--> statement-breakpoint
UPDATE `items` SET `created_by_user_id` = `created_by_clerk_user_id` WHERE `created_by_user_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `item_checks` ADD `user_id` text;
--> statement-breakpoint
UPDATE `item_checks` SET `user_id` = `clerk_user_id` WHERE `user_id` IS NULL;
