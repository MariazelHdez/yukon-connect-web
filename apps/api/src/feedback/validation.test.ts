import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../contracts/validation.ts';
import { parseFeedbackSubmission } from './validation.ts';

test('parseFeedbackSubmission sanitizes and validates feedback input', () => {
  const feedback = parseFeedbackSubmission({
    name: '  Jane\u0000   Doe  ',
    email: '  JANE@example.COM ',
    message: '  This is useful feedback.\n\n\nPlease keep going.  ',
    context: {
      url: '  https://example.test/contracts?q=roads  ',
      ignoredControl: 'a\u0000b',
    },
  });

  assert.deepEqual(feedback, {
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'This is useful feedback.\n\nPlease keep going.',
    context: {
      url: 'https://example.test/contracts?q=roads',
      ignoredControl: 'ab',
    },
  });
});

test('parseFeedbackSubmission rejects invalid required fields', () => {
  assert.throws(
    () => parseFeedbackSubmission({ name: '', email: 'not-an-email', message: 'short' }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(error.details, ['name is required.', 'email must be a valid email address.', 'message must be at least 10 characters.']);
      return true;
    },
  );
});
