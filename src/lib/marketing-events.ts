export const MARKETING_EVENT_NAMES = [
  "landing_primary_cta_click",
  "landing_secondary_cta_click",
  "landing_pricing_cta_click",
  "landing_final_cta_click",
  "trial_upgrade_cta_click",
] as const;

export type MarketingEventName = typeof MARKETING_EVENT_NAMES[number];

export const MARKETING_LOCATION_PREFIXES = ["pricing_"] as const;

export const MARKETING_LOCATION_TOKENS = [
  "hero_primary",
  "hero_secondary_github",
  "sticky_conversion_bar_primary",
  "sticky_conversion_bar_billing",
  "final_cta_primary",
  "final_cta_contact_sales",
  "header_login",
  "header_primary",
  "header_nav_features",
  "header_nav_solutions",
  "header_nav_pricing",
  "footer_nav_features",
  "footer_nav_pricing",
  "footer_nav_docs",
  "dashboard_trial_banner_upgrade",
  "onboarding_checklist_upgrade",
] as const;

export const MARKETING_VARIANT_PREFIXES = ["v", "test_"] as const;
export const MARKETING_SESSION_HINT_PREFIXES = ["mh_"] as const;
