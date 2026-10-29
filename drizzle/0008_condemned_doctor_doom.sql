CREATE TABLE `direction_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`model_id` text NOT NULL,
	`model_provider` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`structured_result` text,
	`is_summary` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`duration_ms` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `production_directions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`original_text` text NOT NULL,
	`direction_type` text NOT NULL,
	`reasoning` text NOT NULL,
	`visual_notes` text,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`agreeing_models` text DEFAULT '[]' NOT NULL,
	`disagreeing_models` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`user_override_type` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
