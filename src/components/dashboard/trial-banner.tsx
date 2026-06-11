import { ArrowRight } from "lucide-react";

import { TrackedLink } from "@/components/marketing/tracked-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardOnboardingContext } from "@/lib/dashboard/types";

export function TrialBanner({
  onboarding,
  isPaid,
}: {
  onboarding: DashboardOnboardingContext;
  isPaid: boolean;
}) {
  if (onboarding.intent !== "trial" || isPaid) return null;

  const sourceQuery = onboarding.source ? `?source=${encodeURIComponent(onboarding.source)}` : "";

  return (
    <Card className="border-primary/25 bg-primary/10">
      <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-black">Trial onboarding</p>
          <p className="text-sm text-white/80 mt-1">
            Complete billing setup to unlock your Pro trial workspace features.
          </p>
        </div>
        <TrackedLink
          href={`/dashboard/billing${sourceQuery}`}
          eventName="trial_upgrade_cta_click"
          location="dashboard_trial_banner_upgrade"
          variant="trial_intent_v1"
        >
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-white">
            Start Pro Trial <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </TrackedLink>
      </CardContent>
    </Card>
  );
}
