export interface PasswordResetCode {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
  createdAt: Date;
}
