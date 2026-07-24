# NeuroCrop Precision Neutral Color System

## Philosophy

NeuroCrop is an operational science product, not a green farming website. The interface is built from warm neutral foundations, high-contrast charcoal typography, and restrained mineral accents.

The hierarchy is intentional:

1. Charcoal communicates primary actions and product authority.
2. Mineral blue-gray communicates selection, focus, navigation, and information.
3. Muted violet identifies AI-generated recommendations and explanations.
4. Green is reserved for healthy, active, successful, or explicitly plant-related meaning.
5. Amber and red only communicate risk. They are never decorative brand colors.
6. Sensor charts use measurement identity colors, never semantic alert colors.

## Core Rules

- Never use green as a page, sidebar, header, or primary-button background.
- Never communicate state through color alone. Keep labels, icons, patterns, or values.
- Use `--color-text` for primary copy and `--color-text-secondary` for supporting copy.
- Do not place tertiary text on subtle beige/gray surfaces when the content is operationally important.
- Use the AI palette only for generated recommendations, confidence explanations, and AI provenance.
- Use semantic colors only when the component carries semantic meaning.
- Use chart colors only for measurement identity. Threshold bands can use translucent semantic colors, but the measurement line keeps its metric color.
- New code must consume tokens. Do not introduce component-level HEX values.

## Light Mode

### Brand

| Role | Token | HEX | Usage |
|---|---|---:|---|
| Primary | `--color-primary` | `#252B29` | Primary buttons, strong emphasis, product authority |
| Primary hover | `--color-primary-hover` | `#171C1A` | Primary-button hover |
| Secondary | `--color-secondary` | `#536B78` | Selection, navigation indicator, information controls |
| Plant accent | `--color-accent-plant` | `#3F7D65` | Healthy/active/plant-related accents only |
| AI accent | `--color-accent-ai` | `#675F93` | AI suggestions, generated reasoning, confidence |

### Foundation

| Role | Token | HEX | Usage |
|---|---|---:|---|
| Background | `--color-background` | `#F6F6F3` | Application canvas |
| Surface | `--color-surface` | `#FFFFFF` | Cards, tables, controls |
| Subtle surface | `--color-surface-subtle` | `#F1F1ED` | Table headers, grouped controls |
| Inset surface | `--color-surface-inset` | `#E9EAE6` | Recessed wells, disabled areas |
| Elevated surface | `--color-surface-elevated` | `#FFFFFF` | Menus, modals, popovers |
| Border | `--color-border` | `#D8DBD7` | Default dividers and card borders |
| Strong border | `--color-border-strong` | `#BFC4C0` | Hovered controls, strong separation |
| Primary text | `--color-text` | `#202522` | Titles, values, body copy |
| Secondary text | `--color-text-secondary` | `#5D655F` | Supporting labels and metadata |
| Tertiary text | `--color-text-tertiary` | `#6F7771` | Nonessential hints only |
| Focus | `--color-focus` | `#527894` | Keyboard focus outline |

### Neutral Scale

`950 #202522`, `900 #2A302D`, `800 #3B423E`, `700 #4E5651`, `600 #626B65`, `500 #7B847E`, `400 #9CA39E`, `300 #BFC4C0`, `200 #D8DBD7`, `100 #E9EAE7`, `050 #F5F5F2`.

## Dark Mode

Dark mode is enabled with `data-theme="dark"` on `html` or `body`.

| Role | Token | HEX |
|---|---|---:|
| Background | `--color-background` | `#161918` |
| Surface | `--color-surface` | `#1E2220` |
| Subtle surface | `--color-surface-subtle` | `#242927` |
| Elevated surface | `--color-surface-elevated` | `#2A2F2C` |
| Border | `--color-border` | `#3A413D` |
| Strong border | `--color-border-strong` | `#505A54` |
| Primary text | `--color-text` | `#F3F4F1` |
| Secondary text | `--color-text-secondary` | `#BDC3BE` |
| Tertiary text | `--color-text-tertiary` | `#909890` |
| Primary action | `--color-primary` | `#F1F2EE` |
| Secondary | `--color-secondary` | `#8BA3B0` |
| Plant accent | `--color-accent-plant` | `#72AD91` |
| AI accent | `--color-accent-ai` | `#AAA0D1` |
| Focus | `--color-focus` | `#8DB1CA` |

## Semantic Colors

| State | Light foreground | Light background | Dark foreground | Dark background |
|---|---:|---:|---:|---:|
| Success / Healthy | `#286B51` | `#E8F3ED` | `#72AD91` | `#24372F` |
| Warning / Needs attention | `#895A06` | `#FFF4D9` | `#E0B45D` | `#3B321F` |
| Danger / Critical | `#A33B37` | `#FCECEA` | `#E17B74` | `#3B2927` |
| Info | `#386282` | `#EAF1F8` | `#8DB1CA` | `#24323C` |
| Offline | `#5F6862` | `#ECEEEC` | `#A1A8A3` | `#292E2B` |
| Unknown | `#626A65` | `#EEF0EE` | `#A7ADA8` | `#292E2B` |
| Sensor stale | `#566F7E` | `#EDF2F5` | `#9BB0BC` | `#273139` |
| Calibration needed | `#675B8E` | `#F1EEF8` | `#B2A7D8` | `#312E40` |
| Disabled | `#8D948F` | `#ECEEEB` | `#737B75` | `#282D2A` |

## Status Mapping

| Product status | Color role | Required secondary cue |
|---|---|---|
| Healthy | Success | Check/dot plus `Healthy` label |
| Needs attention | Warning | Warning icon plus explicit issue |
| Critical | Danger | Critical icon plus immediate action copy |
| Offline | Offline | Disconnected icon and last-seen time |
| Unknown | Unknown | Question mark and missing-data explanation |
| Sensor stale | Stale | Clock icon and reading age |
| Calibration needed | Calibration | Calibration icon and required procedure |

## Chart Palette

Chart colors identify measurements. They must not change when a value crosses a threshold.

| Measurement | Token | Light | Dark |
|---|---|---:|---:|
| Temperature | `--chart-temperature` | `#D36C5B` | `#F08B77` |
| Humidity | `--chart-humidity` | `#4C82B8` | `#72A7D8` |
| VPD | `--chart-vpd` | `#8A6BBE` | `#B08ADB` |
| CO2 | `--chart-co2` | `#7A6F64` | `#A4978A` |
| Light | `--chart-light` | `#D6A436` | `#E7BD58` |
| EC | `--chart-ec` | `#B45F87` | `#D981AB` |
| pH | `--chart-ph` | `#6C70C9` | `#9196E3` |
| Water / moisture | `--chart-water` | `#2C91A3` | `#56B5C5` |
| Battery | `--chart-battery` | `#738E95` | `#98ABB1` |
| Growth | `--chart-growth` | `#3F7D65` | `#72AD91` |

For same-metric Section comparison, use the categorical series sequence: `#536B78`, `#8A6BBE`, `#D36C5B`, `#2C91A3`, `#B45F87`, `#7A6F64`.

## Cards

| Card | Background | Border / accent | Usage |
|---|---|---|---|
| Information | `--color-surface` | `--color-border` | Normal operational content |
| Recommendation | `--color-card-recommendation` | `--color-card-recommendation-border` | AI or ranked recommendation |
| Critical action | `--color-card-critical` | `--color-danger-border` | Immediate intervention |
| Completed | `--color-card-completed` | `--color-success-border` | Verified completion only |
| Inactive | `--color-card-inactive` | `--color-border` | Disabled/not configured |
| Selected | `--color-card-selected` | `--color-card-selected-border` | Current Area, Section, or filter |
| Hovered | `--color-card-hover` | `--color-border-strong` | Pointer hover only |

Recommendations are violet-tinted, not amber. Amber means operational attention, not AI.

## Sidebar

Light sidebar uses `#EBECE8`, dark text, and white active items. Dark sidebar uses neutral charcoal `#1B1F1D`. Neither mode uses a dark green block.

- Default icon: sidebar muted.
- Active indicator/icon: mineral secondary.
- Plant logo mark: plant accent, because the symbol is explicitly plant-related.
- Alert count: danger semantic pair.
- Online dot: success green.
- User tile: sidebar surface with visible border.

## Buttons

| Type | Background | Text | Border |
|---|---|---|---|
| Primary | `--color-primary` | `--color-on-primary` | Primary |
| Secondary | Surface | Primary text | Strong border |
| Ghost | Transparent | Secondary or primary text | Transparent |
| Danger | Danger | White | Danger |
| Success | Success | White | Success |
| Text | Transparent | Secondary | Transparent |
| Disabled | Disabled background | Disabled text | Border |

Green success buttons are only for explicit positive actions such as confirming healthy recovery. Generic `Save`, `Continue`, and `Create` use Primary.

## Inputs and Selectors

- Default: surface background, standard border, primary text.
- Hover: strong border.
- Focus: focus border plus a 3 px focus ring.
- Invalid: danger border plus a translucent danger ring and written error.
- Valid: do not turn the whole input green; use a success icon or helper text.
- Disabled: disabled background and text, with no opacity reduction that harms readability.
- Dropdown/elevated menu: elevated surface with standard border and shadow.

## Tables

- Header: subtle surface and secondary text.
- Border: standard border.
- Stripe: `--color-row-stripe`.
- Hover: `--color-row-hover`.
- Selected: `--color-row-selected` with a mineral secondary indicator.
- Semantic cell backgrounds must be limited to the affected cell or status element, not the entire table by default.

## Alerts and Notifications

- Notification/info: Info pair.
- Warning: Warning pair.
- Error/critical: Danger pair.
- Recommendation: AI accent pair.
- Success confirmation: Success pair.
- Offline/stale: Offline or Stale pair, never Danger unless data loss creates a critical operational condition.

## Accessibility

- Primary and secondary text combinations are selected for WCAG AA on their intended surfaces.
- White text is used only on sufficiently dark Primary, Success, or Danger controls.
- Tertiary text is not permitted for essential instructions or values.
- Focus is visible on both light and dark surfaces.
- Semantic state always includes text or an icon.
- Charts require labels, legends, and tooltips; color is never the only differentiator.
- Avoid placing chart colors directly behind body text. They are optimized for strokes, points, and small fills.

## Implementation

Authoritative tokens and component mappings live in:

- `src/styles/neurocrop-color-system.css`
- `public/approved-dashboard-runtime.js` for chart token lookup

The color system stylesheet must remain the final stylesheet import in `src/App.tsx` until legacy component styles are fully tokenized.
