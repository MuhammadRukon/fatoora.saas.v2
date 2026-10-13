'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CouponType, type Coupon } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { couponInputSchema, type CouponInput } from '@/contracts/coupons';
import { useCouponMutations } from '@/modules/admin/coupons/hooks';

interface CouponFormProps {
  initial?: Coupon | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

function toLocalDate(value: Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

const empty: CouponInput = {
  code: '',
  type: CouponType.PERCENT,
  value: 10,
  minSubtotalCents: 0,
  maxDiscountCents: null,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  perUserLimit: null,
  isActive: true,
};

export function CouponForm({ initial, onSaved, onCancel }: CouponFormProps) {
  const { create, update } = useCouponMutations();
  const form = useForm<CouponInput>({
    resolver: zodResolver(couponInputSchema),
    defaultValues: initial
      ? {
          code: initial.code,
          type: initial.type,
          value: initial.value,
          minSubtotalCents: initial.minSubtotalCents,
          maxDiscountCents: initial.maxDiscountCents,
          startsAt: initial.startsAt,
          expiresAt: initial.expiresAt,
          usageLimit: initial.usageLimit,
          perUserLimit: initial.perUserLimit,
          isActive: initial.isActive,
        }
      : empty,
  });

  async function onSubmit(values: CouponInput) {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, input: values });
      } else {
        await create.mutateAsync(values);
      }
      onSaved?.();
    } catch {
      // Toast handled inside the mutation.
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={CouponType.PERCENT}>Percentage</SelectItem>
                    <SelectItem value={CouponType.FIXED}>Fixed (cents)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {form.watch('type') === CouponType.PERCENT
                  ? 'Discount (%)'
                  : 'Discount (cents)'}
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  value={field.value ?? 0}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            control={form.control}
            name="minSubtotalCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min subtotal (cents)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    value={field.value ?? 0}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxDiscountCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max discount (cents, optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            control={form.control}
            name="startsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts at</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    value={toLocalDate(field.value)}
                    onChange={(e) =>
                      field.onChange(e.target.value ? new Date(e.target.value) : null)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expiresAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expires at</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    value={toLocalDate(field.value)}
                    onChange={(e) =>
                      field.onChange(e.target.value ? new Date(e.target.value) : null)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            control={form.control}
            name="usageLimit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total usage limit</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="perUserLimit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Per-user limit</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3 space-y-0">
              <FormLabel className="m-0">Active</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {initial ? 'Save changes' : 'Create coupon'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
