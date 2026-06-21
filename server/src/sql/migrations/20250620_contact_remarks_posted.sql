-- Extend contact_remarks for WhatsApp and admin-posted homepage display

ALTER TABLE contact_remarks
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS posted TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP NULL AFTER posted;

CREATE INDEX IF NOT EXISTS idx_contact_remarks_posted ON contact_remarks (posted, posted_at DESC);
