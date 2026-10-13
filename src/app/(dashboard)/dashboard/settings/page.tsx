'use client';

import { Button } from '@/components/ui/button';
import { Loader } from '@/app/common/loader/loader';

import { PaymentSettingsForm } from '@/modules/admin/settings/components/payment-settings-form';
import { useAdminPaymentSettings } from '@/modules/admin/settings/hooks';

export default function AdminSettingsPage() {
  const settings = useAdminPaymentSettings();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose the payment methods customers see and configure the Cash on Delivery
          confirmation fee.
        </p>
      </div>

      {settings.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader />
        </div>
      ) : settings.error || !settings.data ? (
        <div className="space-y-2">
          <p>Could not load payment settings.</p>
          <Button variant="outline" onClick={() => settings.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <PaymentSettingsForm
          // Remount (fresh defaults) whenever the saved row changes.
          key={settings.data.settings.updatedAt}
          data={settings.data}
        />
      )}
    </div>
  );
}
