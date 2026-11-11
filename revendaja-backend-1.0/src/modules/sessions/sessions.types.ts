export type SessionClient = 'web' | 'mobile';

export interface Session {
  id: string;
  userId: string;
  client: SessionClient;
  expiresAt: Date;
  createdAt: Date;
}
