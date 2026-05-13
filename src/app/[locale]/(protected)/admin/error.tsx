'use client';

import { lazy } from 'react';

/**
 * Lazy load error component to avoid loading translation functionality
 * from next-intl as part of the initial bundle.
 * https://next-intl.dev/docs/environments/error-files#errorjs
 */
export default lazy(() => import('@/components/layout/error'));
