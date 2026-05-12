'use client';

import { Circle } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

interface IconRendererProps extends Omit<LucideProps, 'ref'> {
  name: string;
}

type LucideIconComponent = ComponentType<LucideProps>;

export function IconRenderer({ name, ...props }: IconRendererProps) {
  const icons = LucideIcons as Record<string, LucideIconComponent | unknown>;
  const IconComponent = icons[name];

  if (
    !IconComponent ||
    (typeof IconComponent !== 'function' && typeof IconComponent !== 'object')
  ) {
    return <Circle {...props} />;
  }

  const Icon = IconComponent as LucideIconComponent;
  return <Icon {...props} />;
}
