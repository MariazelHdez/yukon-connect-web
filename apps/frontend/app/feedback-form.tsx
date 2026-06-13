'use client';

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { hasFeedbackErrors, validateFeedbackForm, type FeedbackFormErrors, type FeedbackFormValues } from './feedback-validation';

const initialValues: FeedbackFormValues = {
  name: '',
  email: '',
  message: '',
};

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function FeedbackForm() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FeedbackFormErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const context = useMemo(() => {
    const search = searchParams.toString();
    const pathWithQuery = search ? `${pathname}?${search}` : pathname;
    return {
      path: pathWithQuery,
      search,
      url: typeof window === 'undefined' ? pathWithQuery : window.location.href,
    };
  }, [pathname, searchParams]);

  function updateField(field: keyof FeedbackFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (submitState !== 'submitting') {
      setSubmitState('idle');
      setSubmitMessage(null);
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFeedbackForm(values);
    setErrors(nextErrors);

    if (hasFeedbackErrors(nextErrors)) {
      setSubmitState('error');
      setSubmitMessage('Please fix the highlighted fields before sending feedback.');
      return;
    }

    setSubmitState('submitting');
    setSubmitMessage(null);

    try {
      const response = await fetch('/feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          message: values.message,
          context,
        }),
      });

      if (!response.ok) {
        throw new Error(await readFeedbackError(response));
      }

      setValues(initialValues);
      setErrors({});
      setSubmitState('success');
      setSubmitMessage('Thanks — your feedback was sent successfully.');
    } catch (error) {
      setSubmitState('error');
      setSubmitMessage(error instanceof Error ? error.message : 'Unable to send feedback right now. Please try again later.');
    }
  }

  return (
    <section className="feedback-card" aria-labelledby="feedback-title">
      <div className="feedback-heading">
        <p className="eyebrow">Feedback</p>
        <h2 id="feedback-title">Help improve Yukon Connect</h2>
        <p>Send a note about the page, search results, filters, or anything that felt confusing.</p>
      </div>

      <form className="feedback-form" onSubmit={submitFeedback} noValidate>
        <label htmlFor="feedback-name">
          <span>Name</span>
          <input
            id="feedback-name"
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={(event) => updateField('name', event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'feedback-name-error' : undefined}
          />
          {errors.name ? <span id="feedback-name-error" className="field-error">{errors.name}</span> : null}
        </label>

        <label htmlFor="feedback-email">
          <span>Email</span>
          <input
            id="feedback-email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => updateField('email', event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'feedback-email-error' : undefined}
          />
          {errors.email ? <span id="feedback-email-error" className="field-error">{errors.email}</span> : null}
        </label>

        <label className="feedback-message-field" htmlFor="feedback-message">
          <span>Message</span>
          <textarea
            id="feedback-message"
            name="message"
            rows={5}
            value={values.message}
            onChange={(event) => updateField('message', event.target.value)}
            placeholder="What should we improve?"
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? 'feedback-message-error' : undefined}
          />
          {errors.message ? <span id="feedback-message-error" className="field-error">{errors.message}</span> : null}
        </label>

        <button className="primary-button" type="submit" disabled={submitState === 'submitting'}>
          {submitState === 'submitting' ? 'Sending…' : 'Send feedback'}
        </button>
      </form>

      {submitMessage ? (
        <p className={submitState === 'success' ? 'inline-success' : 'inline-error'} role={submitState === 'success' ? 'status' : 'alert'}>
          {submitMessage}
        </p>
      ) : null}
    </section>
  );
}

async function readFeedbackError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string; details?: string[] };
    if (payload.details?.length) {
      return payload.details.join(' ');
    }
    return payload.error ?? 'Unable to send feedback right now. Please try again later.';
  } catch {
    return 'Unable to send feedback right now. Please try again later.';
  }
}
