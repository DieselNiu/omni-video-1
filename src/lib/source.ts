import { type InferPageType, loader } from 'fumadocs-core/source';
import { createMDXSource } from 'fumadocs-mdx';
import { author, blog, category, pages } from '../../.source';
import { docsI18nConfig } from './docs/i18n';

/**
 * Pages source
 */
export const pagesSource = loader({
  baseUrl: '/pages',
  i18n: docsI18nConfig,
  source: createMDXSource(pages),
});

/**
 * Blog authors source
 */
export const authorSource = loader({
  baseUrl: '/author',
  i18n: docsI18nConfig,
  source: createMDXSource(author),
});

/**
 * Blog categories source
 */
export const categorySource = loader({
  baseUrl: '/category',
  i18n: docsI18nConfig,
  source: createMDXSource(category),
});

/**
 * Blog posts source
 */
export const blogSource = loader({
  baseUrl: '/blog',
  i18n: docsI18nConfig,
  source: createMDXSource(blog),
});

export type PagesType = InferPageType<typeof pagesSource>;
export type AuthorType = InferPageType<typeof authorSource>;
export type CategoryType = InferPageType<typeof categorySource>;
export type BlogType = InferPageType<typeof blogSource>;
