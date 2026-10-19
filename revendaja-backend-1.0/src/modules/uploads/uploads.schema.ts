import { z } from 'zod';

export const uploadImageResponseSchema = z.object({
  url: z.string().url(),
});
