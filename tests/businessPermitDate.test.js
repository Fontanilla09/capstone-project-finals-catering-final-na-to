import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPermitExpiryDate } from '../src/lib/businessPermitDate.js';

test('extracts ISO and month-name expiry dates', () => {
  assert.equal(extractPermitExpiryDate('VALID UNTIL: 2027-06-30'), '2027-06-30');
  assert.equal(extractPermitExpiryDate('Expiration Date: June 30, 2027'), '2027-06-30');
  assert.equal(extractPermitExpiryDate('Expires on 30 June 2027'), '2027-06-30');
});

test('extracts an unambiguous day-first numeric expiry date', () => {
  assert.equal(extractPermitExpiryDate('Valid thru 31/12/2027'), '2027-12-31');
});

test('does not guess ambiguous, invalid, or unrelated dates', () => {
  assert.equal(extractPermitExpiryDate('Valid until 06/07/2027'), null);
  assert.equal(extractPermitExpiryDate('Date issued: June 30, 2027'), null);
  assert.equal(extractPermitExpiryDate('Expiry date: February 30, 2027'), null);
});

test('does not choose when multiple expiry dates are present', () => {
  assert.equal(extractPermitExpiryDate('Valid until 2027-06-30; expires 2028-06-30'), null);
});
