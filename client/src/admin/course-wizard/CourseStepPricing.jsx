const PRICING_TYPES = [
  { value: 'free', label: 'Free' },
  { value: 'one_time', label: 'One-time' },
  { value: 'subscription', label: 'Subscription' },
];

export default function CourseStepPricing({ pricing, onChange, fieldErrors }) {
  return (
    <div className="admin-course-wizard-step">
      <div className="admin-form-grid">
        <div className="admin-field">
          <label htmlFor="wiz_ptype">Pricing type</label>
          <select
            id="wiz_ptype"
            name="pricing_type"
            value={pricing.pricing_type}
            onChange={onChange}
          >
            {PRICING_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_currency">Currency</label>
          <select id="wiz_currency" name="currency_code" value={pricing.currency_code} onChange={onChange}>
            <option value="PKR">PKR</option>
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_amount">Amount (minor units)</label>
          <input
            id="wiz_amount"
            name="price_amount"
            type="number"
            min={0}
            step={1}
            value={pricing.price_amount}
            onChange={onChange}
            disabled={pricing.pricing_type === 'free'}
            aria-invalid={Boolean(fieldErrors.price_amount)}
          />
          {fieldErrors.price_amount ? (
            <div className="admin-field__error" role="alert">
              {fieldErrors.price_amount}
            </div>
          ) : null}
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_original">Original amount (optional)</label>
          <input
            id="wiz_original"
            name="original_price_amount"
            type="number"
            min={0}
            step={1}
            value={pricing.original_price_amount ?? ''}
            onChange={onChange}
            placeholder="Strike-through list price"
            aria-invalid={Boolean(fieldErrors.original_price_amount)}
          />
          {fieldErrors.original_price_amount ? (
            <div className="admin-field__error" role="alert">
              {fieldErrors.original_price_amount}
            </div>
          ) : null}
        </div>
        <div className="admin-field">
          <label className="admin-field__inline">
            <input type="checkbox" name="is_active" checked={!!pricing.is_active} onChange={onChange} /> Active pricing
            row
          </label>
        </div>
        <div className="admin-field">
          <label className="admin-field__inline">
            <input
              type="checkbox"
              name="enrollment_visible"
              checked={!!pricing.enrollment_visible}
              onChange={onChange}
            />{' '}
            Enrollment visibility
          </label>
        </div>
        <div className="admin-field">
          <label className="admin-field__inline">
            <input
              type="checkbox"
              name="public_purchase_visible"
              checked={!!pricing.public_purchase_visible}
              onChange={onChange}
            />{' '}
            Public purchase visibility
          </label>
        </div>
      </div>
      <div className="admin-card" style={{ marginTop: '1rem', padding: '1rem' }}>
        <h4 className="heading-4" style={{ marginTop: 0 }}>
          Student-side preview
        </h4>
        <p className="admin-courses__muted" style={{ margin: 0 }}>
          {pricing.pricing_type === 'free' && <span>Free course</span>}
          {pricing.pricing_type !== 'free' && (
            <span>
              {pricing.currency_code} {Number(pricing.price_amount || 0).toLocaleString('en-PK')}
              {pricing.original_price_amount != null &&
              Number(pricing.original_price_amount) > Number(pricing.price_amount) ? (
                <span style={{ textDecoration: 'line-through', marginLeft: '0.5rem', opacity: 0.75 }}>
                  {pricing.currency_code} {Number(pricing.original_price_amount).toLocaleString('en-PK')}
                </span>
              ) : null}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
