import { IMAGE_OPTIMIZATION_PROMPTS } from '@/image/config/prompts/image-optimization';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { VIDEO_OPTIMIZATION_PROMPTS } from '../config/prompts/video-optimization';

/**
 * Optimize prompt for image or video generation (supports optional image input)
 * @param originalPrompt Original prompt
 * @param modelType Media type: 'image' or 'video' (determines which optimization prompts to use)
 * @param imageUrl Image URL (optional, for multimodal optimization)
 * @returns Optimized prompt
 */
export async function optimizeVideoPrompt(
  originalPrompt: string,
  modelType?: string,
  imageUrl?: string
): Promise<string> {
  try {
    // Select prompts based on media type
    const isImage = modelType === 'image';
    const prompts = isImage
      ? IMAGE_OPTIMIZATION_PROMPTS
      : VIDEO_OPTIMIZATION_PROMPTS;

    // Choose different system prompt based on whether image is provided
    if (imageUrl) {
      // Build multimodal message with image
      const result = await generateText({
        model: google('gemini-3-flash-preview'),
        messages: [
          {
            role: 'system',
            content: prompts.withImage,
          },
          {
            role: 'user',
            content: [
              { type: 'image', image: imageUrl },
              { type: 'text', text: originalPrompt },
            ],
          },
        ],
        maxOutputTokens: 1024,
        temperature: 0.7,
      });

      return result.text.trim();
    }

    // No image, use text-only prompt
    const result = await generateText({
      model: google('gemini-3-flash-preview'),
      messages: [
        { role: 'system', content: prompts.textOnly },
        { role: 'user', content: originalPrompt },
      ],
      maxOutputTokens: 1024,
      temperature: 0.7,
    });

    return result.text.trim();
  } catch (error) {
    console.error('Prompt optimization failed:', error);
    // Return original prompt if optimization fails
    return originalPrompt;
  }
}

/**
 * Video prompt optimization with timeout
 * @param originalPrompt Original prompt
 * @param modelType Video model type (optional)
 * @param timeoutMs Timeout in milliseconds
 * @param imageUrl Image URL (optional)
 * @returns Optimized prompt or original prompt (if timeout or failure)
 */
export async function optimizeVideoPromptWithTimeout(
  originalPrompt: string,
  modelType?: string,
  timeoutMs = 30000,
  imageUrl?: string
): Promise<string> {
  try {
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(
        () => reject(new Error('Video prompt optimization timeout')),
        timeoutMs
      );
    });

    // Call the unified optimization function
    const optimizePromise = optimizeVideoPrompt(
      originalPrompt,
      modelType,
      imageUrl
    );

    // Use Promise.race for timeout control
    return await Promise.race([optimizePromise, timeoutPromise]);
  } catch (error) {
    console.error('Video prompt optimization failed or timeout:', error);
    // Return original prompt if optimization fails or times out
    return originalPrompt;
  }
}
