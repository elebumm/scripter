CREATE TABLE `beats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`writer_notes` text DEFAULT '' NOT NULL,
	`target_seconds` integer,
	`status` text DEFAULT 'planned' NOT NULL,
	`source` text DEFAULT 'writer' NOT NULL,
	`anchor_text` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`run_id` text,
	`anchor_text` text NOT NULL,
	`issue` text NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`question` text,
	`category` text DEFAULT 'other' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`persona_slugs` text DEFAULT '[]' NOT NULL,
	`source_models` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`status_changed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `color` text;--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluation_profiles` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_profiles_slug_unique` ON `evaluation_profiles` (`slug`);--> statement-breakpoint
ALTER TABLE `evaluations` ADD `run_id` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `persona_id` integer REFERENCES evaluation_profiles(id);--> statement-breakpoint
ALTER TABLE `evaluations` ADD `tokens_in` integer;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `tokens_out` integer;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `cost_usd` real;--> statement-breakpoint
ALTER TABLE `fact_issues` ADD `fact_check_id` integer REFERENCES fact_checks(id);--> statement-breakpoint
ALTER TABLE `scripts` ADD `draft_content` text;--> statement-breakpoint
ALTER TABLE `scripts` ADD `archived` integer DEFAULT false NOT NULL;