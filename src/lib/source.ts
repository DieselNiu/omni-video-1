import { type InferPageType, loader } from 'fumadocs-core/source';
import { createMDXSource } from 'fumadocs-mdx';
import { pages } from '../../.source';
import { docsI18nConfig } from './docs/i18n';

/**
 * Pages source
 */
export const pagesSource = loader({
  baseUrl: '/pages',
  i18n: docsI18nConfig,
  source: createMDXSource(pages),
});

export type PagesType = InferPageType<typeof pagesSource>;
