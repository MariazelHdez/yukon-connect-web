'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type FilterKey =
  | 'vendor'
  | 'department'
  | 'community'
  | 'fiscalYear'
  | 'projectManager'
  | 'contractType'
  | 'tenderClass'
  | 'minAmount'
  | 'maxAmount';

type FormState = Record<'q' | FilterKey, string>;

type Contract = {
  id: number;
  contract_no: string | null;
  contract_description: string | null;
  vendor: string | null;
  department: string | null;
  community: string | null;
  project_manager: string | null;
  fiscal_year: string | null;
  amount: number | string | null;
  match_reason?: string[] | string | null;
};

type ContractsResponse = {
  data: Contract[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

type FilterOptions = {
  vendors: string[];
  departments: string[];
  communities: string[];
  fiscalYears: string[];
  contractTypes: string[];
  tenderClasses: string[];
  projectManagers: string[];
};

const PAGE_SIZE = 25;

const initialFormState: FormState = {
  q: '',
  vendor: '',
  department: '',
  community: '',
  fiscalYear: '',
  projectManager: '',
  contractType: '',
  tenderClass: '',
  minAmount: '',
  maxAmount: '',
};

const filterFields: Array<{
  key: FilterKey;
  label: string;
  placeholder: string;
  list?: keyof FilterOptions;
  inputMode?: 'decimal';
}> = [
  { key: 'vendor', label: 'Vendor', placeholder: 'Filter by vendor', list: 'vendors' },
  { key: 'department', label: 'Department', placeholder: 'Filter by department', list: 'departments' },
  { key: 'community', label: 'Community', placeholder: 'Filter by community', list: 'communities' },
  { key: 'fiscalYear', label: 'Fiscal year', placeholder: 'e.g. 2024-25', list: 'fiscalYears' },
  { key: 'projectManager', label: 'Project manager', placeholder: 'Filter by manager', list: 'projectManagers' },
  { key: 'contractType', label: 'Contract type', placeholder: 'Filter by type', list: 'contractTypes' },
  { key: 'tenderClass', label: 'Tender class', placeholder: 'Filter by tender class', list: 'tenderClasses' },
  { key: 'minAmount', label: 'Min amount', placeholder: '0', inputMode: 'decimal' },
  { key: 'maxAmount', label: 'Max amount', placeholder: '50000', inputMode: 'decimal' },
];

export function ContractsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [pagination, setPagination] = useState<ContractsResponse['pagination']>({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterLoading, setIsFilterLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const queryString = searchParams.toString();
  const currentPage = Number(searchParams.get('page') ?? '1') || 1;

  useEffect(() => {
    const nextForm = { ...initialFormState };
    (Object.keys(nextForm) as Array<keyof FormState>).forEach((key) => {
      nextForm[key] = searchParams.get(key) ?? '';
    });
    setForm(nextForm);
  }, [queryString, searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setIsFilterLoading(true);
    setFilterError(null);

    fetch('/contracts/filters', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response, 'Unable to load filters.'));
        }
        return response.json() as Promise<FilterOptions>;
      })
      .then(setFilterOptions)
      .catch((err: unknown) => {
        if (!isAbortError(err)) {
          setFilterError(err instanceof Error ? err.message : 'Unable to load filters.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFilterLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', String(PAGE_SIZE));

    setIsLoading(true);
    setError(null);

    fetch(`/contracts?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response, 'Unable to load contracts.'));
        }
        return response.json() as Promise<ContractsResponse>;
      })
      .then((payload) => {
        setContracts(payload.data ?? []);
        setPagination(payload.pagination ?? { page: currentPage, pageSize: PAGE_SIZE, total: 0 });
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) {
          setContracts([]);
          setPagination({ page: currentPage, pageSize: PAGE_SIZE, total: 0 });
          setError(err instanceof Error ? err.message : 'Unable to load contracts.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [currentPage, queryString, searchParams]);

  const activeFilters = useMemo(() => {
    return filterFields.filter((field) => searchParams.get(field.key)).length + (searchParams.get('q') ? 1 : 0);
  }, [searchParams]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const showingStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const showingEnd = Math.min(pagination.total, pagination.page * pagination.pageSize);

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();

    (Object.keys(form) as Array<keyof FormState>).forEach((key) => {
      const value = form[key].trim();
      if (value) {
        params.set(key, value);
      }
    });

    params.set('page', '1');
    navigateWithParams(params);
  }

  function clearFilters() {
    setForm(initialFormState);
    navigateWithParams(new URLSearchParams());
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    navigateWithParams(params);
  }

  function navigateWithParams(params: URLSearchParams) {
    const nextQuery = params.toString();
    startTransition(() => {
      router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    });
  }

  return (
    <div className="page-stack">
      <header className="hero">
        <div>
          <p className="eyebrow">Government contracts search</p>
          <h1>Yukon Connect</h1>
          <p className="hero-copy">Search, filter, and share contract results from the Yukon contracts API.</p>
        </div>
      </header>

      <form id="contract-search-form" className="search-panel" onSubmit={submitSearch}>
        <label className="global-search" htmlFor="global-search">
          <span>Global search</span>
          <input
            id="global-search"
            name="q"
            type="search"
            value={form.q}
            onChange={(event) => updateField('q', event.target.value)}
            placeholder="Search contract number, vendor, description, department…"
          />
        </label>
        <button className="primary-button" type="submit" disabled={isPending || isLoading}>
          {isPending ? 'Searching…' : 'Search'}
        </button>
      </form>

      <section className="content-grid">
        <aside className="filters-card" aria-labelledby="filters-title">
          <div className="filters-heading">
            <div>
              <h2 id="filters-title">Filters</h2>
              <p>{isFilterLoading ? 'Loading filter values…' : `${activeFilters} active`}</p>
            </div>
            <button type="button" className="ghost-button" onClick={clearFilters}>
              Clear
            </button>
          </div>
          {filterError ? <p className="inline-error">{filterError}</p> : null}
          <div className="filters-list">
            {filterFields.map((field) => (
              <label key={field.key} htmlFor={field.key}>
                <span>{field.label}</span>
                <input
                  id={field.key}
                  name={field.key}
                  form="contract-search-form"
                  value={form[field.key]}
                  inputMode={field.inputMode}
                  list={field.list ? `${field.key}-options` : undefined}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
                {field.list ? <FilterDatalist id={`${field.key}-options`} values={filterOptions?.[field.list] ?? []} /> : null}
              </label>
            ))}
          </div>
          <button className="secondary-button full-width" type="submit" form="contract-search-form" disabled={isPending || isLoading}>
            Apply filters
          </button>
        </aside>

        <section className="results-card" aria-live="polite">
          <div className="results-header">
            <div>
              <h2>Results</h2>
              <p>
                {isLoading
                  ? 'Loading contracts…'
                  : `Showing ${showingStart.toLocaleString()}-${showingEnd.toLocaleString()} of ${pagination.total.toLocaleString()}`}
              </p>
            </div>
          </div>

          {error ? <ErrorState message={error} /> : null}
          {!error && isLoading ? <LoadingState /> : null}
          {!error && !isLoading && contracts.length === 0 ? <EmptyState /> : null}
          {!error && !isLoading && contracts.length > 0 ? <ResultsTable contracts={contracts} /> : null}

          {!error && pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              totalPages={totalPages}
              onPrevious={() => goToPage(Math.max(1, pagination.page - 1))}
              onNext={() => goToPage(Math.min(totalPages, pagination.page + 1))}
            />
          ) : null}
        </section>
      </section>
    </div>
  );
}

function FilterDatalist({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}

function ResultsTable({ contracts }: { contracts: Contract[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contract no</th>
            <th>Description</th>
            <th>Vendor</th>
            <th>Department</th>
            <th>Community</th>
            <th>Project manager</th>
            <th>Fiscal year</th>
            <th>Amount</th>
            <th>Match reason</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => (
            <tr key={contract.id}>
              <td data-label="Contract no">{displayValue(contract.contract_no)}</td>
              <td data-label="Description" className="description-cell">
                {displayValue(contract.contract_description)}
              </td>
              <td data-label="Vendor">{displayValue(contract.vendor)}</td>
              <td data-label="Department">{displayValue(contract.department)}</td>
              <td data-label="Community">{displayValue(contract.community)}</td>
              <td data-label="Project manager">{displayValue(contract.project_manager)}</td>
              <td data-label="Fiscal year">{displayValue(contract.fiscal_year)}</td>
              <td data-label="Amount">{formatAmount(contract.amount)}</td>
              <td data-label="Match reason">
                <MatchReason value={contract.match_reason} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchReason({ value }: { value: Contract['match_reason'] }) {
  const reasons = Array.isArray(value) ? value : value ? [value] : [];
  if (reasons.length === 0) {
    return <span className="muted">—</span>;
  }

  return (
    <div className="chips">
      {reasons.map((reason) => (
        <span className="chip" key={reason}>
          {reason.replaceAll('_', ' ')}
        </span>
      ))}
    </div>
  );
}

function Pagination({ page, totalPages, onPrevious, onNext }: { page: number; totalPages: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <nav className="pagination" aria-label="Results pagination">
      <button type="button" onClick={onPrevious} disabled={page <= 1}>
        Previous
      </button>
      <span>
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
      <button type="button" onClick={onNext} disabled={page >= totalPages}>
        Next
      </button>
    </nav>
  );
}

function LoadingState() {
  return (
    <div className="state-card">
      <div className="spinner" aria-hidden="true" />
      <h3>Loading contracts</h3>
      <p>Fetching the latest results from the API.</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-card error-state" role="alert">
      <h3>Unable to load results</h3>
      <p>{message}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="state-card empty-state">
      <h3>No contracts found</h3>
      <p>Try changing the search text or removing one or more filters.</p>
    </div>
  );
}

function displayValue(value: string | null | undefined) {
  return value && value.trim() ? value : '—';
}

function formatAmount(value: Contract['amount']) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; details?: string[] };
    if (payload.details?.length) {
      return payload.details.join(' ');
    }
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
