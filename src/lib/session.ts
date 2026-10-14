import { cache } from 'react';

import { auth } from '@/auth';

/** `auth()` once per request: layouts and pages in the same render tree share the result. */
export const getSession = cache(() => auth());
