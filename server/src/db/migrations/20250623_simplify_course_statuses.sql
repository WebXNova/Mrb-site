-- Simplify course lifecycle to 3 statuses: draft, published, archived.
-- Remove old batch statuses (upcoming, enrollment_open, running, completed, cancelled).
-- Add status column to courses table with index.

-- Step 1: Add status column to courses table
ALTER TABLE courses
ADD COLUMN status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft'
COMMENT 'Lifecycle status: draft (editing), published (live), archived (read-only)'
AFTER is_active;

-- Step 2: Migrate existing courses — is_active=true → published, is_active=false → draft
UPDATE courses SET status = 'published' WHERE is_active = TRUE AND status = 'draft';
UPDATE courses SET status = 'draft' WHERE is_active = FALSE AND status = 'draft';

-- Step 3: Add index on courses.status for faster filtering
ALTER TABLE courses ADD INDEX idx_courses_status (status);

-- Step 4: Update existing course_batches with old statuses to simplified set
-- draft → draft
-- published → published
-- upcoming, enrollment_open, running → published
-- completed, cancelled → archived
-- archived → archived (unchanged)
UPDATE course_batches SET status = 'published' WHERE status IN ('upcoming', 'enrollment_open', 'running');
UPDATE course_batches SET status = 'archived' WHERE status IN ('completed', 'cancelled');

-- Step 5: Add index on course_batches.status if not present (schema.sql already has one)
-- idx_course_batches_status already exists per schema.sql
