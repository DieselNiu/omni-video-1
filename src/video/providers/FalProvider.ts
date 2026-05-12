import { fal } from '@fal-ai/client';
import { getVideoModel } from '../config/video-models';
import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

export class FalProvider implements VideoProvider {
  constructor() {
    // Configure fal client
    fal.config({
      credentials: process.env.FAL_KEY,
    });
  }

  getName(): string {
    return 'fal';
  }

  async submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    const modelConfig = getVideoModel(model);
    if (!modelConfig?.falEndpoint) {
      throw new Error(`FAL endpoint not found for model: ${model}`);
    }

    const submitOptions: Record<string, unknown> = {
      input,
    };

    if (webhookUrl) {
      submitOptions.webhookUrl = webhookUrl;
    }

    const { request_id } = await fal.queue.submit(
      modelConfig.falEndpoint,
      submitOptions
    );

    return {
      request_id,
      status: 'submitted',
      model: model,
    };
  }

  async status(
    model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const modelConfig = getVideoModel(model);
    if (!modelConfig?.falEndpoint) {
      throw new Error(`FAL endpoint not found for model: ${model}`);
    }

    const falStatus = await fal.queue.status(modelConfig.falEndpoint, {
      requestId,
      logs: true,
    });

    // Map Fal status to standard status
    let standardStatus = falStatus.status;
    if (falStatus.status === 'COMPLETED') {
      standardStatus = 'COMPLETED';
    } else if (falStatus.status === 'IN_QUEUE') {
      standardStatus = 'IN_QUEUE';
    } else if (falStatus.status === 'IN_PROGRESS') {
      standardStatus = 'IN_PROGRESS';
    }

    return {
      request_id: requestId,
      status: standardStatus,
      logs:
        ((falStatus as unknown as Record<string, unknown>).logs as unknown[]) ||
        [],
      metrics: (falStatus as unknown as Record<string, unknown>).metrics || {},
      raw_data: falStatus,
    };
  }

  async result(
    model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    const modelConfig = getVideoModel(model);
    if (!modelConfig?.falEndpoint) {
      throw new Error(`FAL endpoint not found for model: ${model}`);
    }

    const result = await fal.queue.result(modelConfig.falEndpoint, {
      requestId,
    });

    const resultData = (result as Record<string, unknown>).data || result;
    const typedResultData = resultData as Record<string, unknown>;
    const videoUrl =
      typedResultData.video_url ||
      (typedResultData.video as Record<string, unknown>)?.url;

    return {
      request_id: requestId,
      status: 'COMPLETED',
      video_url: videoUrl as string,
      data: resultData,
    };
  }
}
