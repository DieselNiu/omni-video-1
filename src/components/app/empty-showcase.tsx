'use client';

import { cn } from '@/lib/utils';
import { ImageIcon, Sparkles, VideoIcon, Wand2Icon } from 'lucide-react';

const SHOWCASE_ITEMS = [
  {
    icon: ImageIcon,
    title: 'AI Image Generation',
    description:
      'Create stunning images from text descriptions using cutting-edge AI models.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: VideoIcon,
    title: 'AI Video Creation',
    description:
      'Generate captivating videos with AI-powered tools and natural language prompts.',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: Wand2Icon,
    title: 'Image to Image',
    description:
      'Transform existing images with AI-powered editing and style transfer.',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
];

const EXAMPLE_PROMPTS = [
  'A serene Japanese garden with cherry blossoms at sunset',
  'Cyberpunk cityscape with neon lights reflecting on wet streets',
  'Watercolor painting of a cozy cabin in the mountains',
  'A majestic dragon soaring through aurora borealis',
];

export function EmptyShowcase() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-6 text-primary" />
        <h2 className="text-xl font-semibold">Start Creating</h2>
      </div>
      <p className="text-sm text-muted-foreground max-w-md mb-8">
        Create amazing AI-generated images and videos. Use the panel on the left
        to configure your generation settings, or type a prompt below.
      </p>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl w-full mb-8">
        {SHOWCASE_ITEMS.map((item) => (
          <div
            key={item.title}
            className="flex flex-col items-center gap-2 rounded-xl border p-4"
          >
            <div
              className={cn(
                'flex items-center justify-center size-10 rounded-lg',
                item.bgColor
              )}
            >
              <item.icon className={cn('size-5', item.color)} />
            </div>
            <span className="text-sm font-medium">{item.title}</span>
            <span className="text-xs text-muted-foreground leading-relaxed">
              {item.description}
            </span>
          </div>
        ))}
      </div>

      {/* Example prompts */}
      <div className="max-w-lg w-full">
        <span className="text-xs font-medium text-muted-foreground mb-2 block">
          Try these prompts
        </span>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <span
              key={prompt}
              className="inline-block rounded-full border px-3 py-1 text-xs text-muted-foreground"
            >
              {prompt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
