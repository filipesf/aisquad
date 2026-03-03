import { useState, useEffect } from 'react';

interface TimeAgoProps {
  date: string | null;
  className?: string;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);

  if (diffS < 5) return 'just now';
  if (diffS < 60) return `${diffS}s ago`;

  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;

  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;

  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export function TimeAgo({ date, className = '' }: TimeAgoProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!date) {
    return <span className={`text-gray-500 ${className}`}>never</span>;
  }

  return (
    <span className={className} title={new Date(date).toLocaleString()}>
      {formatTimeAgo(date)}
    </span>
  );
}
