import { Suspense } from 'react';
import { ContractsSearch } from '../contracts-search';
import { FeedbackForm } from '../feedback-form';
import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';

export default function SearchPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell search-shell">
        <Suspense fallback={<div className="loading-card">Loading Yukon Connect…</div>}>
          <ContractsSearch />
          <FeedbackForm />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
