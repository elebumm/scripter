CREATE TABLE `fact_checks` (
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
	`search_count` integer DEFAULT 0,
	`duration_ms` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fact_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`claim_text` text NOT NULL,
	`verdict` text NOT NULL,
	`accuracy` integer,
	`correction` text,
	`reasoning` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`is_exaggeration` integer DEFAULT false NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`agent_models` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
