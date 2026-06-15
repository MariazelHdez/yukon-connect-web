export interface ContractListQuery {
  page: number;
  pageSize: number;
  q?: string;
  vendor?: string;
  department?: string;
  community?: string;
  fiscalYear?: string;
  projectManager?: string;
  contractType?: string;
  tenderClass?: string;
  minAmount?: number;
  maxAmount?: number;
  startDateFrom?: string;
  startDateTo?: string;
}

const STRING_FILTERS = [
  'q',
  'vendor',
  'department',
  'community',
  'fiscalYear',
  'projectManager',
  'contractType',
  'tenderClass',
] as const;

const NUMBER_FILTERS = ['minAmount', 'maxAmount'] as const;
const DATE_FILTERS = ['startDateFrom', 'startDateTo'] as const;

export const MAX_CONTRACT_PAGE_SIZE = 100;

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly details: string[];

  constructor(details: string[]) {
    super('Invalid request parameters.');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export function parseContractListQuery(searchParams: URLSearchParams): ContractListQuery {
  const errors: string[] = [];
  const page = parsePositiveInteger(searchParams.get('page'), 'page', 1, errors);
  const pageSize = parsePositiveInteger(searchParams.get('pageSize'), 'pageSize', 25, errors, MAX_CONTRACT_PAGE_SIZE);
  const parsed: ContractListQuery = { page, pageSize };

  for (const key of STRING_FILTERS) {
    const value = searchParams.get(key);
    if (value !== null && value.trim() !== '') {
      parsed[key] = value.trim();
    }
  }

  for (const key of NUMBER_FILTERS) {
    const value = searchParams.get(key);
    if (value !== null && value.trim() !== '') {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        errors.push(`${key} must be a valid number.`);
      } else {
        parsed[key] = numberValue;
      }
    }
  }

  for (const key of DATE_FILTERS) {
    const value = searchParams.get(key);
    if (value !== null && value.trim() !== '') {
      if (!isIsoDate(value)) {
        errors.push(`${key} must be an ISO date in YYYY-MM-DD format.`);
      } else {
        parsed[key] = value;
      }
    }
  }

  if (parsed.minAmount !== undefined && parsed.maxAmount !== undefined && parsed.minAmount > parsed.maxAmount) {
    errors.push('minAmount must be less than or equal to maxAmount.');
  }

  if (parsed.startDateFrom && parsed.startDateTo && parsed.startDateFrom > parsed.startDateTo) {
    errors.push('startDateFrom must be earlier than or equal to startDateTo.');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return parsed;
}

export function parseContractId(id: string | undefined): number {
  const value = Number(id);
  if (!id || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(['id must be a positive integer.']);
  }
  return value;
}

function parsePositiveInteger(
  value: string | null,
  label: string,
  defaultValue: number,
  errors: string[],
  max?: number,
): number {
  if (value === null || value.trim() === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${label} must be a positive integer.`);
    return defaultValue;
  }

  if (max !== undefined && parsed > max) {
    errors.push(`${label} must be less than or equal to ${max}.`);
  }

  return parsed;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
