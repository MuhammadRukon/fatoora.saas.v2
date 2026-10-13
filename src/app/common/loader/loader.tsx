import { Loader2Icon } from 'lucide-react';

export function Loader() {
  return (
    <span className="flex items-center gap-2">
      <Loader2Icon className="animate-spin" />
      Loading
    </span>
  );
}
