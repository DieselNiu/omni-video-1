'use client';

import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY_SIZE = 5;

interface PromptOptimizerProps {
  mediaType: 'image' | 'video';
  prompt: string;
  onPromptChange: (prompt: string) => void;
  imageUrl?: string;
  disabled?: boolean;
}

export function PromptOptimizer({
  mediaType,
  prompt,
  onPromptChange,
  imageUrl,
  disabled = false,
}: PromptOptimizerProps) {
  const { toast } = useToast();
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  // Track the prompt value at the time optimization started
  // Used to detect if user edited during optimization
  const promptAtOptimizeStart = useRef<string | null>(null);

  const hasHistory = history.length > 0;
  const canOptimize = prompt.trim().length > 0 && !disabled;

  // Push to history with size limit
  const pushToHistory = useCallback((value: string) => {
    setHistory((prev) => {
      const newHistory = [...prev, value];
      // Keep only the last MAX_HISTORY_SIZE items
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(-MAX_HISTORY_SIZE);
      }
      return newHistory;
    });
  }, []);

  // Pop from history
  const popFromHistory = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const popped = newHistory.pop();
      return newHistory;
    });
  }, []);

  // Handle optimize click
  const handleOptimize = useCallback(async () => {
    if (!canOptimize || isOptimizing) return;

    const currentPrompt = prompt.trim();
    promptAtOptimizeStart.current = currentPrompt;
    setIsOptimizing(true);

    try {
      const response = await fetch('/api/video-generation/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentPrompt,
          modelType: mediaType,
          imageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Optimization failed');
      }

      const data = await response.json();

      // Check if user edited the prompt during optimization
      // If so, discard the result and keep user's edit
      if (promptAtOptimizeStart.current !== prompt.trim()) {
        // User edited during optimization, silently discard result
        return;
      }

      if (data.success && data.optimizedPrompt) {
        // Push current prompt to history before replacing
        pushToHistory(currentPrompt);
        onPromptChange(data.optimizedPrompt);
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      console.error('Prompt optimization error:', error);
      toast({
        title: "Auto-prompt didn't work",
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsOptimizing(false);
      promptAtOptimizeStart.current = null;
    }
  }, [
    canOptimize,
    isOptimizing,
    prompt,
    mediaType,
    imageUrl,
    pushToHistory,
    onPromptChange,
    toast,
  ]);

  // Handle rollback click
  const handleRollback = useCallback(() => {
    if (history.length === 0) return;

    // Get the last item from history
    const previousPrompt = history[history.length - 1];
    popFromHistory();
    onPromptChange(previousPrompt);
  }, [history, popFromHistory, onPromptChange]);

  return (
    <div
      className={cn(
        'flex items-center rounded-full transition-colors',
        'hover:bg-white/10',
        'shrink-0' // Prevent shrinking on mobile
      )}
    >
      {/* Rollback button - only visible when there's history */}
      {hasHistory && (
        <>
          <button
            type="button"
            onClick={handleRollback}
            disabled={disabled || isOptimizing}
            className={cn(
              'flex size-7 sm:size-8 items-center justify-center transition-colors',
              'text-zinc-300 hover:text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
            aria-label="Rollback prompt"
          >
            <RotateCcw className="size-3 sm:size-3.5" />
          </button>
          {/* Divider */}
          <div className="h-3.5 sm:h-4 w-px bg-zinc-600" />
        </>
      )}

      {/* Optimize button */}
      <button
        type="button"
        onClick={handleOptimize}
        disabled={!canOptimize || isOptimizing}
        className={cn(
          'flex size-7 sm:size-8 items-center justify-center transition-colors',
          'text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]',
          'disabled:text-white/50 disabled:drop-shadow-none disabled:cursor-not-allowed'
        )}
        aria-label="Optimize prompt"
      >
        {isOptimizing ? (
          <Loader2 className="size-3.5 sm:size-4 animate-spin" />
        ) : (
          /* Custom T with sparkle icon */
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="size-5 sm:size-[22px]"
          >
            <path
              d="M5.3424 1.75233C5.41611 1.51967 5.74535 1.51967 5.81906 1.75233L5.88678 1.96613C6.1297 2.73296 6.72676 3.33606 7.4911 3.5867L7.75445 3.67305C7.98571 3.74888 7.98329 4.07688 7.75093 4.14928L7.52634 4.21927C6.74197 4.4637 6.12777 5.07791 5.88334 5.86228L5.81941 6.06742C5.74644 6.30158 5.41502 6.30158 5.34205 6.06742L5.27812 5.86228C5.03369 5.07791 4.41949 4.4637 3.63512 4.21927L3.41052 4.14928C3.17817 4.07688 3.17575 3.74888 3.40701 3.67305L3.67036 3.5867C4.4347 3.33606 5.03176 2.73296 5.27467 1.96613L5.3424 1.75233Z"
              fill="currentColor"
            />
            <path
              d="M2.85304 6.54515C2.93906 6.34153 3.22761 6.34153 3.31363 6.54515L3.66255 7.37111C3.68788 7.43107 3.7356 7.47879 3.79556 7.50412L4.62152 7.85304C4.82514 7.93906 4.82514 8.22761 4.62152 8.31363L3.79556 8.66255C3.7356 8.68788 3.68788 8.7356 3.66255 8.79556L3.31363 9.62152C3.22761 9.82514 2.93906 9.82514 2.85304 9.62152L2.50412 8.79556C2.47879 8.7356 2.43107 8.68788 2.37111 8.66255L1.54515 8.31363C1.34153 8.22761 1.34153 7.93906 1.54515 7.85304L2.37111 7.50412C2.43107 7.47879 2.47879 7.43107 2.50412 7.37111L2.85304 6.54515Z"
              fill="currentColor"
            />
            <path
              d="M7.78781 6.02847C7.66053 6.095 7.66053 6.09766 7.66562 7.51874L7.67325 8.84668L7.74453 8.91055C7.81581 8.97442 7.81581 8.97442 8.45221 8.97442C8.85951 8.97442 9.10898 8.96378 9.14207 8.94515C9.24135 8.88926 9.26426 8.76685 9.26426 8.26122V7.78486L9.33045 7.72099L9.39663 7.65712L10.1043 7.64914C10.8858 7.64116 10.9724 7.65446 11.0207 7.79018C11.0564 7.88599 11.0564 14.1079 11.0207 14.2037C10.98 14.3181 10.8604 14.3501 10.4785 14.3501C9.99485 14.3501 10.0279 14.2915 10.0279 15.1537C10.0279 15.529 10.0356 15.8563 10.0432 15.8802C10.0865 15.9973 10.1094 16 11.8353 16C13.5612 16 13.5842 15.9973 13.6274 15.8802C13.6351 15.8563 13.6427 15.529 13.6427 15.1511C13.6427 14.2915 13.6758 14.3501 13.1896 14.3501C12.8103 14.3501 12.6906 14.3181 12.6499 14.2037C12.6143 14.1079 12.6143 7.88599 12.6499 7.79018C12.6983 7.65446 12.7848 7.64116 13.5663 7.64914C14.4828 7.65979 14.3988 7.59326 14.4115 8.31444L14.4191 8.84668L14.4904 8.91055L14.5617 8.97442H15.2083H15.8548L15.9261 8.91055L15.9974 8.84668V7.48681V6.12959L15.9388 6.06839L15.8803 6.00718L11.8659 6.00185C8.67877 5.99653 7.83872 6.00185 7.78781 6.02847Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
