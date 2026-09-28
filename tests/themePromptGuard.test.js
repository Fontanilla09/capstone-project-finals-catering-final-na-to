import test from 'node:test';
import assert from 'node:assert/strict';
import { isPromptBlocked } from '../src/lib/themePromptGuard.js';

test('blocks prompts requesting people in common catering terms', () => {
	const prompts = [
		'Birthday party with guests around the table',
		'A bride and groom at a wedding reception',
		'Waiters serving food beside the buffet',
		'A portrait of a woman in a venue',
		'A family celebration with children',
		'Male and female models beside the table',
	];

	for (const prompt of prompts) assert.equal(isPromptBlocked(prompt), true, prompt);
});

test('allows decor-only catering theme prompts', () => {
	const prompts = [
		'Pastel birthday tablescape with floral centerpieces and warm lighting',
		'Elegant wedding venue with ivory linens, candles, and a dessert table',
		'Modern buffet styling with gold trays and greenery',
	];

	for (const prompt of prompts) assert.equal(isPromptBlocked(prompt), false, prompt);
});
