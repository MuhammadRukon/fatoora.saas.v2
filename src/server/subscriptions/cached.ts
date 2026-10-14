import { cache } from 'react';

import { subscriptionsService } from './subscriptions.service';

/** Subscription state once per request (layout and page both need it). */
export const cachedSubscriptionState = cache((userId: string) => subscriptionsService.getState(userId));
