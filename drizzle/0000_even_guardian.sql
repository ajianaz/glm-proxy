CREATE TABLE `api_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text,
	`token_limit_per_5h` integer NOT NULL,
	`expiry_date` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used` text NOT NULL,
	`total_lifetime_tokens` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_keys_last_used_idx` ON `api_keys` (`last_used`);--> statement-breakpoint
CREATE INDEX `api_keys_expiry_date_idx` ON `api_keys` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `usage_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key` text NOT NULL,
	`window_start` text NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`api_key`) REFERENCES `api_keys`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_windows_api_key_idx` ON `usage_windows` (`api_key`);--> statement-breakpoint
CREATE INDEX `usage_windows_window_start_idx` ON `usage_windows` (`window_start`);--> statement-breakpoint
CREATE INDEX `usage_windows_api_key_window_start_idx` ON `usage_windows` (`api_key`,`window_start`);