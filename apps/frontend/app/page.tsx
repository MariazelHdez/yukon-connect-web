import { Suspense } from 'react';
import { ContractsSearch } from './contracts-search';

export default function HomePage() {
  return (
    <main className="shell">
      <Suspense fallback={<div className="loading-card">Loading Yukon Connect…</div>}>
        <ContractsSearch />
      </Suspense>
    </main>
  );
}
