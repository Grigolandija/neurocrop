# NeuroCrop Growing Conditions Score v2

## Purpose

The score describes current measured growing conditions on a 0-100 scale. It
is not a yield prediction. `conditionStatus`, data freshness and measurement
coverage remain separate signals and must be shown next to the score.

Model version: `2.1.0`.

## Agronomic domains

Default domain weights are product calibration defaults, not universal crop
constants. Domain weights remain absolute when some sensors are not installed;
measurement coverage is reported separately.

| Domain | Weight | Metrics | Rationale |
| --- | ---: | --- | --- |
| Climate and water demand | 35% | VPD 45%, air temperature 40%, RH 15% | VPD drives atmospheric water demand, while temperature also has direct developmental and thermal effects. RH is retained for risks not fully represented by VPD. |
| Root water | 25% | Substrate moisture | Root water supply interacts strongly with atmospheric demand. |
| Nutrition | 20% | Solution EC 40%, pH 40%, substrate EC 20% | Concentration and nutrient availability can limit uptake and growth. |
| Plant and root temperature | 12% | Leaf 45%, substrate 35%, water 20% | Tissue and root-zone temperatures provide secondary thermal-stress evidence. |
| Carbon | 8% | CO2 | An instantaneous CO2 reading is useful but strongly dependent on light and dosing schedule. |

VPD, air temperature and RH share one domain because VPD is calculated from
temperature and RH. Counting all three as independent penalties would double
or triple count the same atmospheric condition.

Instantaneous lux and atmospheric pressure do not affect the score. Lux must
be assessed over the configured photoperiod using PAR/DLI when available;
normal atmospheric pressure variation is diagnostic context. Both remain
available for monitoring and analytics.

Each profile metric may optionally define `scoreWeight` from `0` to `3` for
crop/stage calibration. A value of `1` uses the default, `0` removes the metric
from score evaluation, and values above `1` increase its relative impact.

## Continuous stress curve

There is no category jump in numerical severity:

- inside the optimal range: severity `0`;
- at the outer warning boundary: severity `0.20`;
- at the critical boundary: severity `0.65`;
- one additional critical-width beyond that boundary: severity `1.00`.

Smoothstep interpolation is used between anchors. This suppresses score noise
at a boundary while remaining monotonic. A warning state that rounds to 100 is
displayed as 99 so status and score cannot contradict one another.

Within a domain, 70% of severity comes from the strongest deviation and 30%
from the metric-weighted domain mean. This preserves a limiting-factor signal
without counting correlated readings repeatedly.

The cross-domain score starts with the sum of absolute weighted domain risks.
Missing domains do not increase the relative weight of installed sensors, and
adding an optimal sensor therefore cannot change the numerical score. Data
coverage remains the separate indication of how complete that score is.

A nonlinear limiting-factor penalty activates only after domain severity
exceeds `0.25`. Its maximum is domain-specific: climate `18%`, root water
`20%`, nutrition `12%`, plant/root temperature `7%`, and instantaneous CO2
`2%` of remaining risk. This preserves a strong response to severe water or
climate stress without allowing an 8%-weight CO2 sensor to create a 30-point
extra penalty.

Warning deviations below severity `0.05` remain visible in monitoring but do
not create a Today's Priority action. Critical deviations always remain
actionable. This separates measurement awareness from intervention urgency.

## Calibration and evidence

The biological structure is based on established water-demand and controlled
environment evidence. The exact product weights are deliberately exposed as a
versioned calibration policy and should be validated against crop, growth
stage, intervention and yield data rather than presented as universal biology.

- FAO Penman-Monteith method: radiation, temperature, humidity/VPD and wind
  jointly determine evapotranspiration:
  https://www.fao.org/4/X0490E/x0490e08.htm
- Greenhouse tomato experiment showing VPD effects on photosynthesis, water
  use and yield: https://pmc.ncbi.nlm.nih.gov/articles/PMC5339896/
- Greenhouse tomato experiment showing interaction between VPD and CO2:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6581957/
- Hydroponic pakchoi experiment showing nonlinear EC effects on biomass and
  photosynthesis: https://pmc.ncbi.nlm.nih.gov/articles/PMC6114716/

## Regression requirements

- The score must be monotonic as deviation grows on either side of a target.
- The score must be continuous at optimal, warning and critical boundaries.
- A VPD change from `1.200` to `1.201 kPa` for a `[0.8, 1.2]` target must not
  lower the score below 95.
- VPD, temperature and RH must produce one climate-domain penalty.
- Context-only metrics must never change the numerical score.
- Adding an optimal measured domain must never change the numerical score.
- An extreme instantaneous CO2 reading must not reduce the score by more than
  10 points when all other measured domains are optimal.
- Historical and current endpoints must use the same model version.
