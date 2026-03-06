-- Add optional due date to tasks
ALTER TABLE tasks ADD COLUMN due_date TIMESTAMPTZ NULL;
