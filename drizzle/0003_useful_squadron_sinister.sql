CREATE TABLE `suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`script_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`original_text` text NOT NULL,
	`suggested_text` text NOT NULL,
	`reasoning` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`source_models` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `script_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
