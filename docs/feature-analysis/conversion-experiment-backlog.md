# Conversion Experiment Backlog (Post-Unblock)

## Goal
Prioritize the next measurable growth experiments once runtime verification/commit flow is restored.

## Ranked Experiments
1. **Hero CTA copy test (value-first vs speed-first)**
   - Primary metric: hero CTA click-through rate
2. **Pricing card emphasis test (Pro highlight variants)**
   - Primary metric: pricing CTA click share
3. **Trust metric wording test (outcome phrasing variants)**
   - Primary metric: scroll-depth to pricing + final CTA clicks
4. **Final CTA framing test (trial-first vs outcome-first)**
   - Primary metric: final CTA click-through rate

## Instrumentation Requirement
Use existing `MARKETING_EVENT` stream and dashboard CTA panel as the baseline. Add variant labels in event payloads when experiment toggles are introduced.

## Business Impact Hypothesis
- Acquisition: improved first-session conversion efficiency
- Activation: stronger signup intent from clearer value framing
- Paid conversion: better plan consideration at pricing touchpoints
- Retention: improved fit from expectation-aligned messaging
