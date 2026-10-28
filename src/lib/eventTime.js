function formatTime(value) {
  if (!value) return '';
  const time = String(value).slice(0, 5);
  const date = new Date(`2000-01-01T${time}:00`);
  return Number.isNaN(date.getTime())
    ? time
    : date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export function formatEventTimeRange(startTime, endTime) {
  const start = formatTime(startTime);
  if (!start) return 'Time not set';
  const end = formatTime(endTime);
  return end ? `${start} – ${end}` : start;
}
