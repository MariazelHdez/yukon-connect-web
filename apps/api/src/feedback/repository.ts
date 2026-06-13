import type { DatabaseClient } from '../db/database.ts';
import type { FeedbackSubmission } from './validation.ts';

export interface FeedbackRecord {
  id: number;
  status: string;
  created_at: string;
}

export interface FeedbackWriter {
  createFeedback(feedback: FeedbackSubmission): Promise<FeedbackRecord>;
}

export class FeedbackRepository implements FeedbackWriter {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async createFeedback(feedback: FeedbackSubmission): Promise<FeedbackRecord> {
    const result = await this.db.query<FeedbackRecord>(
      `
        insert into app_feedback (name, email, message, context, status)
        values ($1, $2, $3, $4::jsonb, 'new')
        returning id::integer as id, status, created_at
      `,
      [feedback.name, feedback.email, feedback.message, JSON.stringify(feedback.context ?? {})],
    );

    const record = result.rows[0];
    if (!record) {
      throw new Error('Feedback could not be saved.');
    }

    return record;
  }
}
