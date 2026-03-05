CREATE TABLE `custom_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT 'openrouter' NOT NULL,
	`model_id` text NOT NULL,
	`base_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluation_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`criteria_weights` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`profile_id` integer,
	`model_id` text NOT NULL,
	`model_provider` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`is_master_summary` integer DEFAULT false NOT NULL,
	`section_only` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`duration_ms` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `evaluation_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `script_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT 'Untitled Script' NOT NULL,
	`target_length` integer,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
