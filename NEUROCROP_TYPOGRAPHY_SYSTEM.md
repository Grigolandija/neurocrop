# NeuroCrop Precision Typography System

## Philosophy

NeuroCrop typography is designed for operational scanning over an eight-hour workday. Hierarchy comes from size, spacing, placement, and color before weight. The interface uses one coherent UI family so pages feel engineered rather than assembled from unrelated templates.

Principles:

1. Use regular weight for reading and medium weight for controls.
2. Use semibold for titles, selected navigation, and important values.
3. Reserve bold for rare campaign-level emphasis or exceptional alerts.
4. Use whitespace to separate information groups instead of making every label bold.
5. Use tabular numbers for measurements, scores, battery values, timestamps, and table numbers.
6. Use monospace only for technical identifiers, payload fragments, and device addresses.
7. Keep body copy between 45 and 75 characters per line where practical.

## Font Families

| Role | Family | Usage |
|---|---|---|
| UI | IBM Plex Sans | All navigation, headings, controls, tables, charts, and body copy |
| Technical | IBM Plex Mono | DevEUI, sensor IDs, payload fragments, technical codes |

Fallbacks:

```css
--font-ui: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-technical: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
```

## Weight Rules

| Weight | Token | Usage |
|---|---|---|
| 400 Regular | `--weight-regular` | Body text, descriptions, helper text, table cells |
| 500 Medium | `--weight-medium` | Navigation, inputs, dropdown items, chart legends |
| 600 Semibold | `--weight-semibold` | Headings, buttons, selected items, metric values |
| 700 Bold | `--weight-bold` | Rare exceptional emphasis only |

Do not use 750, 800, 820, 850, or 900. Bold is not a substitute for hierarchy.

## Type Scale

All values assume a 16 px root.

| Style | Size | Weight | Line height | Letter spacing | Transform |
|---|---:|---:|---:|---:|---|
| Display XL | `3rem` | 600 | `1.08` | `-0.035em` | None |
| Display L | `2.5rem` | 600 | `1.08` | `-0.035em` | None |
| Display M | `2rem` | 600 | `1.08` | `-0.035em` | None |
| H1 | `1.75rem` | 600 | `1.2` | `-0.02em` | None |
| H2 | `1.5rem` | 600 | `1.2` | `-0.02em` | None |
| H3 | `1.25rem` | 600 | `1.2` | `-0.01em` | None |
| H4 | `1.125rem` | 600 | `1.35` | `-0.01em` | None |
| Title | `1rem` | 600 | `1.35` | `-0.01em` | None |
| Subtitle | `0.9375rem` | 400 | `1.6` | `0` | None |
| Section title | `1.125rem` | 600 | `1.35` | `-0.01em` | None |
| Card title | `0.9375rem` | 600 | `1.35` | `-0.01em` | None |
| Body Large | `1rem` | 400 | `1.6` | `0` | None |
| Body | `0.875rem` | 400 | `1.55` | `0` | None |
| Body Small | `0.8125rem` | 400 | `1.55` | `0` | None |
| Caption | `0.75rem` | 400 | `1.35` | `0` | None |
| Label | `0.75rem` | 600 | `1.35` | `0.01em` | None |
| Overline | `0.6875rem` | 600 | `1.35` | `0.09em` | Uppercase |
| Button | `0.8125rem` | 600 | `1` | `0` | None |
| Navigation | `0.875rem` | 500 | `1` | `0` | None |
| Table Header | `0.6875rem` | 600 | `1.2` | `0.055em` | Uppercase |
| Table Cell | `0.8125rem` | 400 | `1.4` | `0` | None |
| Tooltip | `0.75rem` | 400 | `1.45` | `0` | None |
| Badge | `0.6875rem` | 600 | `1.2` | `0.015em` | None |
| Input | `0.875rem` | 400 | `1.4` | `0` | None |
| Dropdown | `0.8125rem` | 400 | `1.35` | `0` | None |
| Chart title | `0.875rem` | 600 | `1.35` | `0` | None |
| Chart legend | `0.75rem` | 500 | `1.35` | `0` | None |
| Axis label/value | `0.6875rem` | 500 | `1.35` | `0` | None |
| Metric value | `2rem` | 600 | `1` | `-0.025em` | None |
| Hero metric | `3.5rem` | 600 | `0.95` | `-0.045em` | None |
| Metric unit | `0.75rem` | 500 | `1.35` | `0` | None |
| Alert text | `0.8125rem` | 400 | `1.55` | `0` | None |
| Empty state title | `1.25rem` | 600 | `1.2` | `-0.01em` | None |
| Empty state text | `0.875rem` | 400 | `1.55` | `0` | None |
| Helper text | `0.75rem` | 400 | `1.35` | `0` | None |
| Validation | `0.75rem` | 500 | `1.35` | `0` | None |

Display XL is reserved for authentication or a singular top-level product statement. Dashboard page titles use Display M, not Display XL.

## Dashboard Hierarchy

The visual reading order must be:

1. Current priority or active exception.
2. Current measurement or decision value.
3. Action control.
4. Context and explanation.
5. Technical detail.

Page titles use Display M. Recommendation titles use H2. Section titles use Section Title. Card titles remain compact. Supporting descriptions are regular weight and gain separation through spacing, not boldness.

## Metric Typography

- Main metric: `2rem / 600 / 1` with tabular lining numbers.
- Hero score: `3.5rem / 600 / 0.95`.
- Unit: `0.75rem / 500`, placed on the same baseline when possible.
- Metric label: Caption or Label.
- Do not use monospace for normal measurements.
- Keep decimals visually stable and use a fixed precision per metric.
- In tables, right-align numeric values and keep units in a separate aligned column or secondary span.

## Buttons

| Size | Height | Horizontal padding | Font | Weight | Radius |
|---|---:|---:|---:|---:|---:|
| Small | `2rem` | `0.75rem` | `0.75rem` | 600 | `0.625rem` |
| Medium | `2.5rem` | `1rem` | `0.8125rem` | 600 | `0.625rem` |
| Large | `3rem` | `1.25rem` | `0.875rem` | 600 | `0.625rem` |

Primary, Secondary, Ghost, Danger, and Success share the same typography. Hierarchy comes from component color and placement, not different font weights. Text buttons use `0.8125rem / 600` with no uppercase transform.

Button icon gap is 8 px. Groups use 8 px between related actions and 12 px when actions have different consequences.

## Forms

| Element | Style |
|---|---|
| Field label | Label, placed 8 px above control |
| Input value | Input, regular |
| Placeholder | Input, regular, secondary color |
| Helper text | Helper, placed 4 px below control |
| Validation | Validation, placed 4 px below control with icon/text |
| Dropdown item | Dropdown, 36 px minimum height |
| Section legend | Card Title or Label depending on scope |

Default control height is 40 px. Use 48 px only for authentication or a deliberate large-action form. Textareas use Body and at least 1.5 line height.

## Tables

- Header height: 40 px.
- Row height: 44 px default.
- Header: Table Header.
- Cell: Table Cell.
- Primary identity in a cell: Body Small Semibold.
- Secondary cell metadata: Caption Regular.
- Numbers: tabular lining figures, right aligned.
- Units: separate muted span or column; never mixed into sortable numeric text.
- Column padding: 12 px horizontal, 8 px vertical.
- Sorting icon: 10 px, 4 px after header label.
- Avoid centered text except status, icon, or action columns.
- Use 52-56 px rows only when a row contains two meaningful text lines.

## Charts

| Element | Size | Weight |
|---|---:|---:|
| Chart title | `0.875rem` | 600 |
| Legend | `0.75rem` | 500 |
| Axis label/value | `0.6875rem` | 500 |
| Tooltip timestamp | `0.75rem` | 400 |
| Tooltip value | `0.75rem` | 600 |
| Target annotation | `0.6875rem` | 600 |

Chart numbers use tabular figures. Keep labels horizontal whenever possible. Limit axis ticks to the minimum needed for interpretation. A tooltip must not exceed 320 px unless it compares multiple metrics.

## Spacing Scale

| Token | Value | Use |
|---|---:|---|
| `--space-4` | 4 px | Icon/text micro-gap, helper-to-control gap |
| `--space-8` | 8 px | Related controls, button icon gap, table vertical padding |
| `--space-12` | 12 px | Control padding, compact card internals, table columns |
| `--space-16` | 16 px | Default card gap, standard card padding, form fields |
| `--space-20` | 20 px | Operational card padding, compact section padding |
| `--space-24` | 24 px | Page gutters, section header separation |
| `--space-32` | 32 px | Wide-screen page gutter, major block separation |
| `--space-40` | 40 px | Mobile page bottom space, large content transition |
| `--space-48` | 48 px | Desktop page bottom space, major page sections |
| `--space-64` | 64 px | Wide-screen page bottom space or isolated hero rhythm |

Do not invent intermediate spacing values without a component-specific reason.

## Layout Rhythm

- Dashboard gutter: 24 px desktop, 32 px at 1800 px and wider, 12 px mobile.
- Card-to-card gap: 16 px.
- Major section gap: 32 px.
- Page header to first section: 24 px.
- Card internal padding: 16 px normal, 20 px for recommendation/decision cards.
- Sidebar link height: 44 px normal, 48 px wide desktop.
- Sidebar label to first link: 8 px.
- Sidebar group separation: 24 px.
- Header control gap: 8 px.
- Form field gap: 16 px.
- Label to control: 8 px.
- Control to helper/error: 4 px.
- Table to pagination/filter bar: 12 px.

## Density by Target Screen

### 2560 x 1440

- 32 px page gutters.
- 48 px sidebar links.
- 44 px table rows.
- Prefer multi-column comparison views where labels remain readable.

### 1920 x 1080

- 24 px page gutters.
- 44 px sidebar links.
- 44 px table rows.
- Keep primary operational content above the fold.

### MacBook Pro

- 20-24 px page gutters depending on viewport.
- Preserve 40 px controls.
- Collapse secondary panels before shrinking readable text.

## Accessibility

- Root size remains 16 px; never reduce it to make a layout fit.
- Body text uses at least 14 px with 1.55 line height.
- Text hierarchy never relies on weight alone.
- Focus styles remain visually separate from selected state.
- Uppercase is limited to short labels and table headers.
- Avoid paragraphs in uppercase.
- Do not render essential text below 12 px.
- Browser zoom to 200 percent must preserve content and actions.
- Metric meaning must remain available to screen readers and not depend on visual scale.

## Implementation

Authoritative typography and spacing tokens:

- `src/styles/neurocrop-typography-system.css`
- `public/approved-dashboard-runtime.js` for ECharts text settings

The typography stylesheet must remain the final stylesheet import in `src/App.tsx` while legacy styles are being removed.
