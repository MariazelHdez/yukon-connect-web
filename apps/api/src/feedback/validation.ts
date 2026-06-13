import { ValidationError } from '../contracts/validation.ts';

export interface FeedbackSubmission {
  name: string;
  email: string;
  message: string;
  context: FeedbackContext | null;
}

type JsonPrimitive = string | number | boolean | null;
export type FeedbackContext = JsonPrimitive | FeedbackContext[] | { [key: string]: FeedbackContext };

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTEXT_STRING_LENGTH = 500;
const MAX_CONTEXT_JSON_LENGTH = 4000;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_KEYS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseFeedbackSubmission(payload: unknown): FeedbackSubmission {
  const details: string[] = [];

  if (!isRecord(payload)) {
    throw new ValidationError(['Request body must be a JSON object.']);
  }

  const name = sanitizeSingleLineText(payload.name);
  const email = sanitizeSingleLineText(payload.email).toLowerCase();
  const message = sanitizeMultilineText(payload.message);
  const context = sanitizeContext(payload.context, details);

  if (!name) {
    details.push('name is required.');
  } else if (name.length > MAX_NAME_LENGTH) {
    details.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

  if (!email) {
    details.push('email is required.');
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    details.push('email must be a valid email address.');
  }

  if (!message) {
    details.push('message is required.');
  } else if (message.length < MIN_MESSAGE_LENGTH) {
    details.push(`message must be at least ${MIN_MESSAGE_LENGTH} characters.`);
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    details.push(`message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  if (context !== null && JSON.stringify(context).length > MAX_CONTEXT_JSON_LENGTH) {
    details.push(`context must serialize to ${MAX_CONTEXT_JSON_LENGTH} characters or fewer.`);
  }

  if (details.length > 0) {
    throw new ValidationError(details);
  }

  return { name, email, message, context };
}

function sanitizeSingleLineText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return stripControlCharacters(value).replace(/\s+/g, ' ').trim();
}

function sanitizeMultilineText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return stripControlCharacters(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripControlCharacters(value: string): string {
  return value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function sanitizeContext(value: unknown, details: string[], depth = 0): FeedbackContext | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (depth > MAX_CONTEXT_DEPTH) {
    details.push(`context must be at most ${MAX_CONTEXT_DEPTH} levels deep.`);
    return null;
  }

  if (typeof value === 'string') {
    return sanitizeSingleLineText(value).slice(0, MAX_CONTEXT_STRING_LENGTH);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_CONTEXT_KEYS).map((item) => sanitizeContext(item, details, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_CONTEXT_KEYS)
        .map(([key, item]) => [sanitizeSingleLineText(key).slice(0, 80), sanitizeContext(item, details, depth + 1)])
        .filter(([key]) => key),
    );
  }

  details.push('context must be a string, object, array, number, boolean, or null.');
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
