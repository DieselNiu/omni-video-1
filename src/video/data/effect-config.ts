import { getDb } from '@/db';
import { effectConfig } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import type { EffectContent, VideoEffect } from '../types/video-effect';

/**
 * Get effect config by ID
 */
export async function getEffectConfigById(
  id: string
): Promise<VideoEffect | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(effectConfig)
    .where(and(eq(effectConfig.id, id), eq(effectConfig.status, 'online')))
    .limit(1);

  if (!result[0]) return null;
  return mapToVideoEffect(result[0]);
}

/**
 * Get effect config by slug and locale
 */
export async function getEffectConfigBySlug(
  slug: string,
  locale = 'en'
): Promise<VideoEffect | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(effectConfig)
    .where(
      and(
        eq(effectConfig.slug, slug),
        eq(effectConfig.locale, locale),
        eq(effectConfig.status, 'online')
      )
    )
    .limit(1);

  if (!result[0]) return null;
  return mapToVideoEffect(result[0]);
}

/**
 * Get all effect configs for a locale
 */
export async function getAllEffectConfigs(
  locale = 'en'
): Promise<VideoEffect[]> {
  const db = await getDb();
  const results = await db
    .select()
    .from(effectConfig)
    .where(
      and(eq(effectConfig.locale, locale), eq(effectConfig.status, 'online'))
    )
    .orderBy(effectConfig.displayOrder, desc(effectConfig.createdAt));

  return results.map(mapToVideoEffect);
}

/**
 * Get effect configs by category
 */
export async function getEffectConfigsByCategory(
  category: string,
  locale = 'en'
): Promise<VideoEffect[]> {
  const db = await getDb();
  const results = await db
    .select()
    .from(effectConfig)
    .where(
      and(
        eq(effectConfig.category, category),
        eq(effectConfig.locale, locale),
        eq(effectConfig.status, 'online')
      )
    )
    .orderBy(effectConfig.displayOrder, desc(effectConfig.createdAt));

  return results.map(mapToVideoEffect);
}

/**
 * Get hot effect configs
 */
export async function getHotEffectConfigs(
  locale = 'en',
  limit = 6
): Promise<VideoEffect[]> {
  const db = await getDb();
  const results = await db
    .select()
    .from(effectConfig)
    .where(
      and(
        eq(effectConfig.locale, locale),
        eq(effectConfig.status, 'online'),
        eq(effectConfig.isHot, true)
      )
    )
    .orderBy(effectConfig.displayOrder)
    .limit(limit);

  return results.map(mapToVideoEffect);
}

/**
 * Map database record to VideoEffect type
 */
function mapToVideoEffect(
  record: typeof effectConfig.$inferSelect
): VideoEffect {
  let parsedContent: EffectContent | null = null;
  let parsedParameters: Record<string, unknown> | null = null;

  try {
    if (record.content) {
      parsedContent = JSON.parse(record.content);
    }
  } catch (error) {
    console.error(
      `Failed to parse effect config content for ${record.id}:`,
      error
    );
  }

  try {
    if (record.parameters) {
      parsedParameters = JSON.parse(record.parameters);
    }
  } catch (error) {
    console.error(
      `Failed to parse effect config parameters for ${record.id}:`,
      error
    );
  }

  return {
    id: record.id,
    slug: record.slug,
    locale: record.locale,
    title: record.title,
    pageTitle: record.pageTitle,
    pageDescription: record.pageDescription,
    content: parsedContent,
    previewImage: record.previewImage,
    previewVideo: record.previewVideo,
    previewThumbnail: record.previewThumbnail,
    previewGif: record.previewGif,
    parameters: parsedParameters,
    promptTemplate: record.promptTemplate,
    creditsRequired: record.creditsRequired ?? 10,
    status: record.status as VideoEffect['status'],
    isHot: record.isHot ?? false,
    category: record.category,
    displayOrder: record.displayOrder ?? 0,
    effectType: record.effectType as VideoEffect['effectType'],
    pixverseTemplateId: record.pixverseTemplateId,
    maxImages: record.maxImages ?? 1,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
