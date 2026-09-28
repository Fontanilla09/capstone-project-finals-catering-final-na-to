const blockedTerms = [
  'people',
  'persons?',
  'guests?',
  'humans?',
  'man',
  'men',
  'woman',
  'women',
  'boys?',
  'girls?',
  'child',
  'children',
  'kids?',
  'family',
  'families',
  'male',
  'female',
  'couples?',
  'brides?',
  'grooms?',
  'models?',
  'faces?',
  'bodies?',
  'silhouettes?',
  'portraits?',
  'customers?',
  'audiences?',
  'crowds?',
  'waiters?',
  'waitresses?',
  'waitstaff',
  'chefs?',
  'staff',
  'servers?',
  'caterers?',
  'hosts?',
  'characters?',
  'figures?',
];

const blockedPromptPattern = new RegExp(`\\b(?:${blockedTerms.join('|')})\\b`, 'i');

export function isPromptBlocked(prompt) {
  return blockedPromptPattern.test(typeof prompt === 'string' ? prompt : '');
}

export const blockedPromptMessage = 'This generator creates catering decor and themes only. Remove requests for people, guests, staff, or human figures.';