'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';

import { useSubmitReview } from '@/modules/reviews/hooks';
import { cn } from '@/lib/utils';

interface WriteReviewFormProps {
  orderItemId: string;
  onSubmitted?: () => void;
}

export function WriteReviewForm({ orderItemId, onSubmitted }: WriteReviewFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const submit = useSubmitReview();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || body.trim().length < 10) return;
    await submit.mutateAsync({
      orderItemId,
      rating,
      title: title.trim() || undefined,
      body: body.trim(),
    });
    setRating(0);
    setTitle('');
    setBody('');
    onSubmitted?.();
  }

  const display = hover || rating;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-3">
        <Label className="block mb-1">Rating</Label>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              aria-label={`Rate ${n} out of 5`}
              className="p-0.5"
            >
              <Star
                size={20}
                className={cn(
                  n <= display ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label htmlFor={`title-${orderItemId}`}>Title (optional)</Label>
        <Input
          id={`title-${orderItemId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor={`body-${orderItemId}`}>Your review</Label>
        <Textarea
          id={`body-${orderItemId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What did you like or dislike about this product?"
        />
      </div>
      <Button type="submit" disabled={rating < 1 || body.trim().length < 10 || submit.isPending}>
        {submit.isPending ? 'Submitting...' : 'Submit review'}
      </Button>
    </form>
  );
}
