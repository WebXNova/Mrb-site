/**
 * Student-facing seat copy. Counts come from the API — never invent remaining seats.
 */

export function formatSeatRemaining(seatsRemaining, seatCapacity) {
  const remaining = Number(seatsRemaining);
  const capacity = Number(seatCapacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { label: 'Seats are managed by the administrator', tone: 'neutral', isFull: false };
  }
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { label: 'Registration closed — seats full', tone: 'full', isFull: true };
  }
  if (remaining <= 8) {
    return {
      label: `Only ${remaining} ${remaining === 1 ? 'seat' : 'seats'} remaining`,
      tone: 'urgent',
      isFull: false,
    };
  }
  return {
    label: `${remaining} / ${capacity} seats remaining`,
    tone: 'ok',
    isFull: false,
  };
}

export function formatDurationMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return '1 minute';
  return `${n} minutes`;
}

export function formatQuestionCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return '1 question';
  return `${n} questions`;
}

export function formatScheduleRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const startOk = start && !Number.isNaN(start.getTime());
  const endOk = end && !Number.isNaN(end.getTime());
  const fmt = (d) =>
    d.toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  if (startOk && endOk) return `${fmt(start)} – ${fmt(end)}`;
  if (startOk) return `Opens ${fmt(start)}`;
  if (endOk) return `Closes ${fmt(end)}`;
  return null;
}
