-- Clean slate: remove all non-corven agents and all operational data.
-- Keeps corven as the sole agent, zeroes out tasks/assignments/activities/etc.

-- Child tables first (FK order)
DELETE FROM openclaw_dispatch_attempts;
DELETE FROM comments;
DELETE FROM subscriptions;
DELETE FROM assignments;
DELETE FROM notifications;
DELETE FROM telemetry_events;
DELETE FROM activities;
DELETE FROM tasks;

-- Remove all agents except corven
DELETE FROM agents WHERE name != 'corven';
