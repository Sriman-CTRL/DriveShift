import { api } from './client';
import type { MigrationJob } from '../types';

export interface CreateMigrationInput {
  sourceAccountId: string;
  destAccountId: string;
  sourceFolderId?: string;
  sourceFileId?: string;
}

export const migrationsApi = {
  list: () => api.get<MigrationJob[]>('/migrations'),

  get: (jobId: string) => api.get<MigrationJob>(`/migrations/${jobId}`),

  create: (input: CreateMigrationInput) =>
    api.post<{ message: string; job: MigrationJob }>('/migrations', input),

  cancel: (jobId: string) =>
    api.post<{ message: string; job: MigrationJob }>(`/migrations/${jobId}/cancel`),
};
