export function buildDefaultWizardCourse() {
  return {
    title: '',
    short_description: null,
    description: '',
    level: 'beginner',
    thumbnail_url: undefined,
    is_active: true,
    start_date: null,
    end_date: null,
    admission_status: 'CLOSED',
  };
}

export function buildDefaultWizardPricing() {
  return {
    pricing_type: 'free',
    price_amount: 0,
    original_price_amount: null,
    currency_code: 'PKR',
    is_active: true,
    starts_at: null,
    ends_at: null,
    enrollment_visible: true,
    public_purchase_visible: true,
  };
}

export function buildDefaultWizardBatch() {
  const now = new Date();
  const start = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 27 * 60 * 60 * 1000);
  return {
    title: 'Primary cohort',
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    total_seats: 40,
    instructor_name: '',
    schedule_label: '',
    timezone: 'Asia/Karachi',
    status: 'draft',
    is_active: true,
    show_publicly: true,
    recordings_enabled: true,
  };
}

/** Drop deprecated batch keys (e.g. certificate_enabled) from saved drafts. */
export function sanitizeWizardBatch(batch) {
  const defaults = buildDefaultWizardBatch();
  if (!batch || typeof batch !== 'object') return defaults;
  return {
    title: batch.title ?? defaults.title,
    start_date: batch.start_date ?? defaults.start_date,
    end_date: batch.end_date ?? defaults.end_date,
    total_seats: batch.total_seats ?? defaults.total_seats,
    instructor_name: batch.instructor_name ?? defaults.instructor_name,
    schedule_label: batch.schedule_label ?? defaults.schedule_label,
    timezone: batch.timezone ?? defaults.timezone,
    status: batch.status ?? defaults.status,
    is_active: batch.is_active !== false,
    show_publicly: batch.show_publicly !== false,
    recordings_enabled: batch.recordings_enabled !== false,
  };
}

export function buildDefaultWizardSubject() {
  return { title: '', description: null, order_index: 0 };
}
