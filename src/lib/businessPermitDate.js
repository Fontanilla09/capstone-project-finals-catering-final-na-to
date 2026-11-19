const monthNumbers = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function formatDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expiryContext(text, start, end) {
  return /expir|valid|until|through|thru/i.test(text.slice(Math.max(0, start - 45), Math.min(text.length, end + 20)));
}

export function extractPermitExpiryDate(text) {
  if (typeof text !== 'string' || !text.trim()) return null;

  const candidates = [];
  const patterns = [
    {
      regex: /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g,
      parse: (match) => formatDate(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      regex: /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/g,
      parse: (match) => {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = Number(match[3]);
        if (first > 12 && second <= 12) return formatDate(year, second, first);
        if (second > 12 && first <= 12) return formatDate(year, first, second);
        if (first === second) return formatDate(year, first, second);
        return null;
      },
    },
    {
      regex: /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi,
      parse: (match) => formatDate(Number(match[3]), monthNumbers[match[1].toLowerCase().replace('.', '')], Number(match[2])),
    },
    {
      regex: /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?,?\s+(20\d{2})\b/gi,
      parse: (match) => formatDate(Number(match[3]), monthNumbers[match[2].toLowerCase().replace('.', '')], Number(match[1])),
    },
  ];

  for (const { regex, parse } of patterns) {
    for (const match of text.matchAll(regex)) {
      const date = parse(match);
      if (date && expiryContext(text, match.index, match.index + match[0].length)) candidates.push(date);
    }
  }

  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : null;
}

export function getManilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isBusinessPermitReviewPending(permit) {
  if (permit?.business_permit_verified) return false;
  const submittedAt = Date.parse(permit?.business_permit_submitted_at || '');
  const reviewedAt = Date.parse(permit?.business_permit_reviewed_at || '');
  return Number.isFinite(submittedAt) && (!Number.isFinite(reviewedAt) || submittedAt > reviewedAt);
}
