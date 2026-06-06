ALTER TABLE `lists` ADD `archived_at` integer;
--> statement-breakpoint
CREATE INDEX `lists_archived_idx` ON `lists` (`archived_at`);
