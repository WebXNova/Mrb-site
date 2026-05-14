export function buildDefaultWizardCourse() {
  return {
    title: '',
    short_description: null,
    description: '',
    level: 'beginner',
    thumbnail_url: undefined,
    is_active: true,
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
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() + 2, 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 4, 28);
  const open = new Date();
  const close = new Date(start);
  close.setUTCDate(close.getUTCDate() - 2);
  return {
    title: 'Primary cohort',
    code: undefined,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    enrollment_open_at: open.toISOString(),
    enrollment_close_at: close.toISOString(),
    total_seats: 40,
    instructor_name: '',
    schedule_label: '',
    timezone: 'Asia/Karachi',
    status: 'draft',
    is_active: true,
    allow_enrollment: true,
    show_publicly: true,
    certificate_enabled: false,
    recordings_enabled: true,
  };
}

export function buildDefaultWizardSubject() {
  return { title: '', description: null, order_index: 0 };
}
