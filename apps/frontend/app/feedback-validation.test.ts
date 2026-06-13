import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFeedbackErrors, validateFeedbackForm } from './feedback-validation.ts';

test('validateFeedbackForm accepts valid feedback', () => {
  const errors = validateFeedbackForm({
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'This is useful feedback.',
  });

  assert.equal(hasFeedbackErrors(errors), false);
  assert.deepEqual(errors, {});
});

test('validateFeedbackForm returns field errors for invalid feedback', () => {
  const errors = validateFeedbackForm({ name: '', email: 'invalid', message: 'short' });

  assert.equal(hasFeedbackErrors(errors), true);
  assert.deepEqual(errors, {
    name: 'Enter your name.',
    email: 'Enter a valid email address.',
    message: 'Message must be at least 10 characters.',
  });
});
