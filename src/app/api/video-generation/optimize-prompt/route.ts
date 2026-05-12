import { auth } from '@/lib/auth';
import { optimizeVideoPromptWithTimeout } from '@/video/services/prompt-optimization';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, modelType, imageUrl } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    }

    // Optimize prompt with 30 second timeout
    const optimizedPrompt = await optimizeVideoPromptWithTimeout(
      prompt,
      modelType,
      30000,
      imageUrl
    );

    return NextResponse.json({
      success: true,
      originalPrompt: prompt,
      optimizedPrompt,
      hasImage: !!imageUrl,
    });
  } catch (error) {
    console.error('Prompt optimization error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
