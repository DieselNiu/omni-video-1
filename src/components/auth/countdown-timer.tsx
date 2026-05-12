'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  initialSeconds?: number;
}

export const CountdownTimer = ({
  initialSeconds = 600,
}: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [centiseconds, setCentiseconds] = useState(99);

  // Fast timer for centiseconds (creates urgency)
  useEffect(() => {
    const fastTimer = setInterval(() => {
      setCentiseconds((prev) => (prev > 0 ? prev - 1 : 99));
    }, 10);

    return () => clearInterval(fastTimer);
  }, []);

  // Main timer for seconds
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Calculate progress percentage (starts full, decreases to 0)
  const progress = (timeLeft / initialSeconds) * 100;

  return (
    <div className="flex items-center gap-1">
      {/* Minutes */}
      <div className="relative overflow-hidden rounded-md bg-secondary/80 px-3 py-1.5">
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
        <span className="font-mono text-xl font-bold text-foreground">
          {minutes}
        </span>
      </div>

      {/* Separator */}
      <span className="text-xl font-bold text-muted-foreground">:</span>

      {/* Seconds */}
      <div className="relative overflow-hidden rounded-md bg-secondary/80 px-3 py-1.5">
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
        <span className="font-mono text-xl font-bold text-foreground">
          {seconds.toString().padStart(2, '0')}
        </span>
      </div>

      {/* Separator */}
      <span className="text-xl font-bold text-muted-foreground">:</span>

      {/* Centiseconds (fast moving for urgency) */}
      <div className="relative overflow-hidden rounded-md bg-secondary/80 px-3 py-1.5">
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-10 ease-linear"
          style={{ width: `${centiseconds}%` }}
        />
        <span className="font-mono text-xl font-bold text-foreground tabular-nums">
          {centiseconds.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
};
