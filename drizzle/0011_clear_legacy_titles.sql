-- Custom SQL migration file, put your code below! --
-- Titles older builds set by themselves, never typed by the writer: the
-- "Untitled Script" default and "<template title> (Copy)". Exact matches only
-- ("Untitled Scriptt" and other typed titles stay); the Drafts card and the
-- title placeholder then show the script's first heading. The pre-migration
-- snapshot keeps the old values.
UPDATE `scripts` SET `title` = '' WHERE `is_template` = 0 AND (`title` = 'Untitled Script' OR `title` IN (SELECT `title` || ' (Copy)' FROM `scripts` WHERE `is_template` = 1));
