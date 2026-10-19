export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  passwordHash: string | null;
  googleId: string | null;
  phoneVerifiedAt: Date | null;
  role: Role;
  createdAt: Date;
}
