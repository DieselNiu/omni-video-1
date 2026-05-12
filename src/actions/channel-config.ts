'use server';

import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { channelConfig } from '@/db/schema';
import { refreshChannelCache } from '@/lib/channel-router';
import { adminActionClient } from '@/lib/safe-action';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

// Schema for getting all channel configs
const getChannelConfigsSchema = z.object({});

// Schema for updating a single channel config
const updateChannelConfigSchema = z.object({
  id: z.string(),
  priority: z.number().min(1).max(100),
  enabled: z.boolean(),
});

// Schema for batch updating channel configs
const batchUpdateChannelConfigsSchema = z.object({
  configs: z.array(
    z.object({
      id: z.string(),
      priority: z.number().min(1).max(100),
      enabled: z.boolean(),
      apiModelId: z.string().nullable().optional(),
    })
  ),
});

// Schema for creating a new channel config
const createChannelConfigSchema = z.object({
  modelFamily: z.string().min(1),
  modelType: z.string().min(1),
  channel: z.string().min(1),
  modelVersion: z.string().optional(),
  apiModelId: z.string().optional(),
  priority: z.number().min(1).max(100).default(1),
  enabled: z.boolean().default(true),
});

// Schema for deleting a channel config
const deleteChannelConfigSchema = z.object({
  id: z.string(),
});

/**
 * Get all channel configurations
 */
export const getChannelConfigsAction = adminActionClient
  .schema(getChannelConfigsSchema)
  .action(async () => {
    try {
      const db = await getDb();
      const configs = await db
        .select()
        .from(channelConfig)
        .orderBy(
          asc(channelConfig.modelFamily),
          asc(channelConfig.modelType),
          asc(channelConfig.priority)
        );

      return {
        success: true,
        data: configs,
      };
    } catch (error) {
      console.error('get channel configs error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch channel configs',
      };
    }
  });

/**
 * Update a single channel configuration
 */
export const updateChannelConfigAction = adminActionClient
  .schema(updateChannelConfigSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { id, priority, enabled } = parsedInput;

      const db = await getDb();
      await db
        .update(channelConfig)
        .set({
          priority,
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(channelConfig.id, id));

      // Refresh the channel cache after update
      await refreshChannelCache();

      return {
        success: true,
      };
    } catch (error) {
      console.error('update channel config error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update channel config',
      };
    }
  });

/**
 * Batch update channel configurations
 */
export const batchUpdateChannelConfigsAction = adminActionClient
  .schema(batchUpdateChannelConfigsSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { configs } = parsedInput;

      const db = await getDb();

      // Update each config
      for (const config of configs) {
        const setValues: Record<string, unknown> = {
          priority: config.priority,
          enabled: config.enabled,
          updatedAt: new Date(),
        };
        if (config.apiModelId !== undefined) {
          setValues.apiModelId = config.apiModelId;
        }
        await db
          .update(channelConfig)
          .set(setValues)
          .where(eq(channelConfig.id, config.id));
      }

      // Refresh the channel cache after update
      await refreshChannelCache();

      return {
        success: true,
      };
    } catch (error) {
      console.error('batch update channel configs error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update channel configs',
      };
    }
  });

/**
 * Create a new channel configuration
 */
export const createChannelConfigAction = adminActionClient
  .schema(createChannelConfigSchema)
  .action(async ({ parsedInput }) => {
    try {
      const {
        modelFamily,
        modelType,
        channel,
        modelVersion,
        apiModelId,
        priority,
        enabled,
      } = parsedInput;

      const db = await getDb();

      // Check if config already exists
      const conditions = [
        eq(channelConfig.modelFamily, modelFamily),
        eq(channelConfig.modelType, modelType),
        eq(channelConfig.channel, channel),
      ];

      const existing = await db
        .select()
        .from(channelConfig)
        .where(and(...conditions));

      // Filter by modelVersion in JS since SQL null equality is tricky
      const duplicate = existing.find(
        (e) => (e.modelVersion ?? undefined) === (modelVersion ?? undefined)
      );

      if (duplicate) {
        return {
          success: false,
          error: 'Channel config already exists',
        };
      }

      // Create new config
      await db.insert(channelConfig).values({
        id: randomUUID(),
        modelFamily,
        modelType,
        channel,
        modelVersion: modelVersion || null,
        apiModelId: apiModelId || null,
        priority,
        enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Refresh the channel cache after creation
      await refreshChannelCache();

      return {
        success: true,
      };
    } catch (error) {
      console.error('create channel config error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create channel config',
      };
    }
  });

/**
 * Delete a channel configuration
 */
export const deleteChannelConfigAction = adminActionClient
  .schema(deleteChannelConfigSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { id } = parsedInput;

      const db = await getDb();
      await db.delete(channelConfig).where(eq(channelConfig.id, id));

      // Refresh the channel cache after deletion
      await refreshChannelCache();

      return {
        success: true,
      };
    } catch (error) {
      console.error('delete channel config error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete channel config',
      };
    }
  });
