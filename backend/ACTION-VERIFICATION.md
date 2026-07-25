# Action result verification

Action verification answers a narrow question: did the monitored condition move toward its configured target after the grower recorded a completed action? It does not claim that the action alone caused the change or calculate ROI.

## Method

1. The immutable recommendation snapshot supplies the baseline value, target range, metric, section and baseline timestamp.
2. Measurements recorded before the feedback timestamp or before the metric response delay are excluded.
3. Readings from all reporting nodes in the section are combined into five-minute buckets. Each bucket contributes one median value, preventing several nodes at the same moment from satisfying the temporal sample requirement.
4. The first three qualified bucket medians establish the initial post-action response.
5. During the original verification deadline, the first later rolling window of three qualified bucket medians whose median is inside target upgrades the result to `target_reached`. A single reading cannot do this, and readings after the deadline cannot rewrite the result.
6. If no qualified window reaches target, movement is evaluated from the initial response and must exceed both the metric noise floor and the relative change threshold. Otherwise the outcome is `unchanged`.

## Timing and noise floors

| Metrics | Response delay | Verification deadline | Noise floor |
| --- | ---: | ---: | ---: |
| Air/leaf temperature | 10 min | 60 min | 0.2 C |
| Relative humidity | 10 min | 60 min | 1 %RH |
| VPD | 10 min | 60 min | 0.03 kPa |
| CO2 | 15 min | 120 min | 25 ppm |
| Root-zone and water temperature | 20 min | 120 min | 0.2 C |
| Moisture, EC, pH and soil EC | 20 min | 180 min | metric-specific |

The API retrieves at most the first four hours of measurements after feedback. This covers every configured verification deadline while keeping historical queries bounded.

## Outcome states

- `awaiting_data`: the response delay is active or fewer than three readings have arrived before the deadline.
- `insufficient_data`: the deadline passed without enough valid readings, or the stored baseline/target is unusable.
- `target_reached`: the post-action median is inside the configured target.
- `improving`: distance from the target decreased by more than the meaningful-change threshold.
- `unchanged`: movement is within expected measurement noise.
- `worsened`: distance from the target increased by more than the meaningful-change threshold.
- `not_applicable`: the action was deferred or could not be completed.

## Product boundary

This result is suitable for recommendation QA and future rule tuning. Causal claims and financial savings require a separate baseline or control-zone design, equipment-state data and repeated comparable actions.
