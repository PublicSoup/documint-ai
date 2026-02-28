# Feature Impact: Conversion Variant Segmentation Inputs

## Summary
Extended `POST /api/ide/generate-conversion-variants` to accept `trafficTemperature` and `offerType`, and upgraded response schema to support optional `supportingBullets` for trust-building copy.

## Business Impact Estimate
- Acquisition: **Medium** — more relevant top-of-funnel messaging options for cold traffic pages.
- Activation: **High** — clearer segmented CTAs should improve first-session engagement and trial intent.
- Paid conversion: **High** — stronger offer-fit copy for warm/hot traffic improves checkout/demo progression.
- Retention: **Low-Medium** — better initial fit can reduce early churn from expectation mismatch.

## Rollout Notes
- Backward compatible: new request fields have defaults/optional handling.
- Validation-enforced schema keeps payload and AI output shape predictable.
- Variant IDs are now normalized and deduplicated server-side for cleaner experiment tracking and analytics joins.
- Goal-alignment telemetry now captures how many generated CTAs semantically align with the requested conversion objective, enabling faster prompt and funnel optimization.
- Diversity telemetry now captures distinct angle/headline counts to detect low-variety outputs before they degrade experiment quality.
- Supporting bullets are now normalized/deduplicated server-side (whitespace cleanup, duplicate removal, min-quality guard), reducing noisy trust-copy variants.
- Headline-style telemetry now captures question-headline count, improving creative-balance analysis for conversion experiments.
- CTA urgency telemetry now captures urgency-language usage (`urgencyCtaCount`) to prevent over-aggressive copy and improve trust/performance balance.
- Headline-length compliance telemetry (`lengthCompliantHeadlineCount`) now tracks scan-friendly headline sizing consistency for landing-page readability optimization.
- CTA verb-diversity telemetry (`distinctCtaVerbCount`) now tracks action-language spread across variants to improve experiment learning efficiency.
- CTA length-compliance telemetry (`lengthCompliantCtaCount`) now tracks button-readability consistency for stronger mobile and desktop action clarity.
- Prompt-bound user inputs are now sanitized for control characters/code-fence tokens before AI generation, reducing malformed prompt and formatting-drift risk.
- CTA punctuation telemetry (`punctuationEndingCtaCount`) now tracks punctuation-ending button labels to enforce cleaner UI copy conventions.
- Numeric-headline telemetry (`numericHeadlineCount`) now tracks specificity-style headline usage to support credibility-vs-clarity experiment analysis.
- Benefit-led headline telemetry (`benefitLedHeadlineCount`) now tracks practical-outcome framing usage to improve value-clarity optimization.
- Subheadline-length compliance telemetry (`lengthCompliantSubheadlineCount`) now tracks scan-friendly supporting-message sizing for readability optimization.
- Benefit-led subheadline telemetry (`benefitLedSubheadlineCount`) now tracks practical-outcome framing in supporting copy for value-clarity optimization.
- Social-proof telemetry (`socialProofMentionCount`) now tracks credible trust-signal language usage across hero copy variants.
- Outcome-focused subheadline telemetry (`outcomeSubheadlineCount`) now tracks measurable-results framing for stronger value-clarity experiments.
- Combined trust+outcome telemetry (`trustAndOutcomeVariantCount`) now tracks variants that pair credibility signals with measurable value framing.
- Audience-term telemetry (`audienceKeywordMentionCount`) now tracks whether generated copy reflects provided audience context, improving personalization quality control.
- Audience explicit-mention telemetry (`audienceExplicitMentionCount`) now tracks direct audience-phrase usage for tighter personalization diagnostics.
- Second-person headline telemetry (`secondPersonHeadlineCount`) now tracks direct reader-address framing (`you/your`) for personalization tone optimization.
- Exclamation-headline telemetry (`exclamationHeadlineCount`) now tracks over-energetic headline style risk for trust/tone balance.
- Colon-headline telemetry (`colonHeadlineCount`) now tracks structured promise-mechanism headline framing for readability/clarity tuning.
- Hyphen-headline telemetry (`hyphenHeadlineCount`) now tracks dash-structured headline usage for scannability style tuning.
- Title-case telemetry (`titleCaseHeadlineCount`) now tracks headline casing style balance to prevent readability drift.
- First-person plural telemetry (`firstPersonPluralMentionCount`) now tracks `we/our/us` framing to balance brand-authority voice with customer-centric tone.
- CTA audience-mention telemetry (`ctaAudienceMentionCount`) now tracks whether action labels reflect audience context, improving personalization quality checks.
- Action-verb CTA telemetry (`actionVerbCtaCount`) now tracks imperative CTA quality to improve click-intent clarity.
- Single-word CTA telemetry (`singleWordCtaCount`) now tracks terse button-label usage for readability/intent tradeoff analysis.
- Benefit-bullet telemetry (`benefitBulletVariantCount`) now tracks whether supporting bullets communicate practical outcomes.
- Trust-reinforced benefit telemetry (`trustReinforcedBenefitVariantCount`) now tracks variants that pair trust signals with practical-value bullets.
- Prompt guidance now explicitly encourages at least one trust+value paired variant to improve learnable high-conversion patterns.
