import { Suspense } from 'react';
import { ContractsSearch } from './contracts-search';
import { FeedbackForm } from './feedback-form';

export default function HomePage() {
  return (
    <main className="shell">
      <Suspense fallback={<div className="loading-card">Loading Yukon Connect…</div>}>
        <ContractsSearch />
        <FeedbackForm />
      </Suspense>
    </main>
  );
}
