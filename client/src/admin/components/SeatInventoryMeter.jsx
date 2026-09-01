import { getStandaloneSeatSummary } from '../utils/testAdminDisplay.js';

/**
 * Seat capacity / used / remaining — standalone tests only.
 */
export default function SeatInventoryMeter({ test, compact = false }) {
  const seats = getStandaloneSeatSummary(test);
  if (!seats.configured) {
    return <span className="seat-inventory seat-inventory--unlimited">Seats not limited</span>;
  }

  const usedPct = seats.capacity > 0 ? Math.min(100, (seats.confirmed / seats.capacity) * 100) : 0;
  const full = seats.remaining === 0;

  return (
    <div
      className={`seat-inventory${compact ? ' seat-inventory--compact' : ''}${full ? ' seat-inventory--full' : ''}`}
      title={`${seats.capacity.toLocaleString()} total · ${seats.confirmed.toLocaleString()} used · ${seats.remaining.toLocaleString()} remaining`}
    >
      <div className="seat-inventory__figures">
        <span>
          <strong>{seats.capacity.toLocaleString()}</strong> total
        </span>
        <span>
          <strong>{seats.confirmed.toLocaleString()}</strong> used
        </span>
        <span>
          <strong>{seats.remaining.toLocaleString()}</strong> remaining
        </span>
      </div>
      <div className="seat-inventory__bar" aria-hidden="true">
        <div className="seat-inventory__bar-fill" style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}
