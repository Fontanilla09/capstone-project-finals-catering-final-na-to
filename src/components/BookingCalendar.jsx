import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) || getDateKey(date) !== key ? '' : key;
}

export default function BookingCalendar({ dates = [], className = '' }) {
  const [todayKey, setTodayKey] = useState(() => getDateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = window.setTimeout(
      () => setTodayKey(getDateKey(new Date())),
      nextMidnight.getTime() - now.getTime() + 10,
    );
    return () => window.clearTimeout(timeout);
  }, [todayKey]);

  const bookedDates = useMemo(
    () => new Set(dates.map(normalizeDateKey).filter((date) => date && date >= todayKey)),
    [dates, todayKey],
  );
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1 - visibleMonth.getDay() + index,
    );
    const key = getDateKey(date);
    return {
      date,
      key,
      isCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
      isToday: key === todayKey,
      isBooked: bookedDates.has(key),
    };
  }), [bookedDates, todayKey, visibleMonth]);

  function changeMonth(offset) {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  return (
    <section className={`booking-calendar ${className}`.trim()} aria-labelledby="booking-calendar-title">
      <header className="booking-calendar-header">
        <div>
          <h3 id="booking-calendar-title">Booking calendar</h3>
          <p>Upcoming booked dates are highlighted. Past dates disappear automatically.</p>
        </div>
        <div className="booking-calendar-navigation" aria-label="Calendar navigation">
          <button
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
            type="button"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong aria-live="polite">
            {visibleMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </strong>
          <button
            aria-label="Next month"
            onClick={() => changeMonth(1)}
            type="button"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <ol className="booking-calendar-grid" aria-label="Calendar dates">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <li className="booking-calendar-weekday" key={day} aria-hidden="true">{day}</li>
        ))}
        {days.map(({ date, key, isCurrentMonth, isToday, isBooked }) => (
          <li
            aria-label={`${date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}${isBooked ? ', booking scheduled' : ''}`}
            className={[
              'booking-calendar-day',
              !isCurrentMonth && 'is-outside-month',
              isToday && 'is-today',
              isBooked && 'has-booking',
            ].filter(Boolean).join(' ')}
            key={key}
            title={isBooked ? 'Booking scheduled' : undefined}
          >
            <time dateTime={key}>{date.getDate()}</time>
            {isBooked && <span className="booking-calendar-indicator" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="booking-calendar-legend">
        <span className="booking-calendar-indicator" aria-hidden="true" />
        Booked date
      </p>
    </section>
  );
}
