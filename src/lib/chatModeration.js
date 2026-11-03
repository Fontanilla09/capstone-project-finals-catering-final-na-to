const restrictedPhrases = [
  "putang ina",
  "putangina",
  "tang ina",
  "tangina",
  "pakyu",
  "punyeta",
  "tarantado",
  "gago",
  "bobo",
  "tanga",
  "ulol",
  "fuck",
  "fucking",
  "motherfucker",
  "shit",
  "bullshit",
  "fucked",
  "bitch",
  "asshole",
  "cunt",
  "kantot",
  "iyot",
  "jakol",
  "puke",
  "tite",
  "libog",
  "porn",
  "send nudes",
  "mahal kita",
  "i love you",
  "love kita",
  "crush kita",
  "date tayo",
  "ligawan kita",
  "gusto kita",
  "miss kita",
  "miss na kita",
  "kiss kita",
  "halikan kita",
  "landi",
  "landian",
];

function normalizeMessage(message) {
  return message
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getChatModerationError(message) {
  const normalizedMessage = normalizeMessage(message);
  const containsRestrictedPhrase = restrictedPhrases.some((phrase) =>
    new RegExp(`(?:^| )${phrase}(?: |$)`).test(normalizedMessage),
  );

  return containsRestrictedPhrase
    ? "Please keep messages professional. Profanity, sexual content, and personal or romantic advances are not allowed."
    : "";
}
