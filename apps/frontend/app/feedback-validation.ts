export interface FeedbackFormValues {
  name: string;
  email: string;
  message: string;
}

export type FeedbackFormErrors = Partial<Record<keyof FeedbackFormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4000;

export function validateFeedbackForm(values: FeedbackFormValues): FeedbackFormErrors {
  const errors: FeedbackFormErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const message = values.message.trim();

  if (!name) {
    errors.name = 'Enter your name.';
  }

  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!message) {
    errors.message = 'Enter your feedback message.';
  } else if (message.length < MIN_MESSAGE_LENGTH) {
    errors.message = `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`;
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }

  return errors;
}

export function hasFeedbackErrors(errors: FeedbackFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
