import { cache } from 'react';

import { resolveBusinessId } from './business-context';

/** resolveBusinessId once per request (layout and page both need it). */
export const cachedBusinessId = cache(resolveBusinessId);
