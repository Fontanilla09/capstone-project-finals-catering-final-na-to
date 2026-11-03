import test from "node:test";
import assert from "node:assert/strict";
import { getChatModerationError } from "../src/lib/chatModeration.js";

test("blocks common profanity and direct personal advances", () => {
  const messages = [
    "GAGO ka",
    "This is f.u.c.k.ed up",
    "Mahal kita",
    "Crush kita!",
    "Please send nudes",
    "Gusto kita",
  ];

  for (const message of messages) {
    assert.notEqual(getChatModerationError(message), "", message);
  }
});

test("allows ordinary package and event messages", () => {
  const messages = [
    "Can you send me the package details?",
    "I love the floral design for our event",
    "The event date is on December 12",
    "Do you have a baby shower package?",
  ];

  for (const message of messages) {
    assert.equal(getChatModerationError(message), "", message);
  }
});
