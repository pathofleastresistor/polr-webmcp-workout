-- Replaces Google sign-in with a private link per person.
--
-- Must run with foreign_keys OFF (scripts/migrate.mjs does). With it on,
-- dropping `user` below would cascade and delete every workout.
DROP TABLE `session`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
DROP TABLE `verification`;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`(`id`, `created_at`, `updated_at`) SELECT `id`, `created_at`, `updated_at` FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_key_hash_unique` ON `user` (`key_hash`);--> statement-breakpoint
-- Profiles used to be created lazily on first sign-in; now every user has one
-- from the start, so backfill any account that never got one.
INSERT OR IGNORE INTO `user_profile`(`user_id`) SELECT `id` FROM `user`;--> statement-breakpoint
ALTER TABLE `user_profile` DROP COLUMN `is_demo`;
