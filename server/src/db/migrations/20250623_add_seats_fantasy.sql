-- Add seats_fantasy to course_batches for reserved (fantasy) seats.
-- Fantasy seats count toward capacity but are not real enrollments.
-- The combined check is: seats_filled + seats_fantasy >= total_seats → batch full.
ALTER TABLE course_batches
ADD COLUMN seats_fantasy INT NOT NULL DEFAULT 0 COMMENT 'Reserved seats (fantasy) counted toward capacity'
AFTER seats_filled;
