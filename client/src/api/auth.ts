import { api } from './client';
import type { User, ConnectedAccount } from '../types';

export const authApi = {
  me: () => api.get<User>('/auth/me'),

  accounts: () =>
    api.get<{ accounts: ConnectedAccount[] }>('/auth/accounts'),
};
