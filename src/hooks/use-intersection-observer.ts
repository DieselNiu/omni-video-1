'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseIntersectionObserverReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  isVisible: boolean;
}

export function useIntersectionObserver(
  rootMargin = '100px'
): UseIntersectionObserverReturn {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, isVisible };
}
