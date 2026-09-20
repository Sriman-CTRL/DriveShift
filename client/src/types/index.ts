// ─── Core domain types matching the Prisma schema ─────────────────────────

export type MigrationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type MigrationItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectedAccount {
  id: string;
  provider: string;
  providerUserId: string;
  createdAt: string;
  user: {
    email: string;
    name: string;
  };
}

export interface MigrationItem {
  id: string;
  migrationJobId: string;
  sourceFileId: string;
  sourceFileName: string | null;
  sourceMimeType: string | null;
  destFileId: string | null;
  destFolderId: string | null;
  status: MigrationItemStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationJob {
  id: string;
  userId: string;
  sourceAccountId: string;
  destAccountId: string;
  sourceFileId: string | null;
  sourceFolderId: string | null;
  sourceFileName: string | null;
  sourceFileMimeType: string | null;
  destFileId: string | null;
  destFolderId: string | null;
  totalFiles: number;
  completedFiles: number;
  totalFolders: number;
  completedFolders: number;
  progress: number;
  status: MigrationStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  sourceAccount?: {
    id: string;
    provider: string;
    providerUserId: string;
  };
  destAccount?: {
    id: string;
    provider: string;
    providerUserId: string;
  };
  items?: MigrationItem[];
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}
