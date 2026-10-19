'use client';

import React, { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient';
import { AuthProvider } from '../auth/AuthContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
