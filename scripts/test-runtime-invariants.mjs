import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = await fs.readFile(path.join(root, "public/approved-dashboard-runtime.js"), "utf8");
const config = await fs.readFile(path.join(root, "public/runtime-config.js"), "utf8");
const contract = await fs.readFile(path.join(root, "API-CONTRACT.md"), "utf8");
let failures = 0;

function assert(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${message}`);
}

assert(!runtime.includes("fetchLatestReadingsForAllZones"), "dashboard must not fetch latest readings for every section");
assert(runtime.includes("if (!nextZone) {") && runtime.includes("renderDashboard();"), "empty areas must render instead of returning during hydration");
assert(runtime.includes('elements.dashboardShell.setAttribute("aria-busy", "true")') && runtime.includes('elements.dashboardShell.removeAttribute("aria-busy")'), "dashboard hydration must expose its loading state without leaving the UI blank");
assert(runtime.includes("if (isApiDataMode()) {") && runtime.includes("Never infer installed sensors"), "API mode must not fabricate per-node sensor readings");
assert(runtime.includes("const warningColor = \"#d08a2d\""), "trend warning segments must use amber, not critical red");
assert(runtime.includes("function renderRuntimeErrorState()"), "render failures must replace stale content with an explicit error state");
assert(runtime.includes('role="alert"') && runtime.includes("data-dashboard-retry"), "runtime errors must be announced and offer a retry action");
assert(runtime.includes("function renderEmptyAreaState(site)") && runtime.includes("empty-area-state"), "empty areas must render a neutral dedicated state");
assert(runtime.includes("const { preferCurrentZone = false } = options;"), "the selected Area must take precedence over a stale Section context");
assert(runtime.includes("const alertsModuleEnabled = false;") && runtime.includes('nextRoute.page === "alerts" && !alertsModuleEnabled'), "Alerts must remain unavailable until the module is released");
assert(runtime.includes('const aggregationName = isPeak ? "Section peak" : "Section median";'), "Light history must identify peak aggregation instead of pretending it is a median");
assert(runtime.includes("const dataValues = values.map(Number).filter(Number.isFinite);") && runtime.includes("A nearby target line provides useful context; a distant target must not flatten the real curve."), "trend Y axes must prioritize real measurement ranges over wide display ranges");
assert(runtime.includes('const filteredSites = blockSites.filter((site) => site.id === activeSiteId);'), "Sections must always follow the Area selected in the global header");
assert(!runtime.includes('data-block-filter-select class='), "Sections must not expose a competing local Area filter");
assert(runtime.includes("function rebuildEnhancedSelect(select)"), "Node Area changes must rebuild the visible Section selector");
assert(runtime.includes("function setEnhancedSelectOpen") && runtime.includes("function focusEnhancedSelectOption"), "enhanced selects must support managed open state and keyboard focus");
assert(runtime.includes('aria-controls="${escapeAttribute(selectId)}-menu"') && runtime.includes('document.addEventListener("keydown", (event) => {'), "enhanced selects must expose an associated menu and keyboard controls");
assert(runtime.includes('sectionSelect.disabled = targetZones.length === 0;'), "Node Section selector must reflect whether the selected Area has sections");
assert(runtime.includes('aria-expanded="${String(isExpanded)}"') && runtime.includes('class="node-table-detail"'), "Nodes must expose compact expandable detail rows");
assert(runtime.includes("function getNodeReportingModeLabel(profile)") && runtime.includes('power_save: "Power save"'), "Node reporting modes must be presented with clear labels");
assert(runtime.includes("Sensor reinitialised ${counters.reinit} times") && runtime.includes('label: reasons[0]') && runtime.includes('<div><span>Health</span>'), "Node health status must show a concise primary reason and full diagnostics");
assert(runtime.includes('class="crop-profile-metric-row"') && runtime.includes('data-profile-alert-limit="warning"'), "Crop profile targets must retain visible automatic alert boundaries");
assert(runtime.includes("await hydrateDashboardFromApi();") && runtime.includes("Scores are calculated by the backend from the saved profile ranges."), "saving a crop profile must immediately refresh canonical backend scores");
assert(runtime.includes('class="settings-local-notice"'), "non-API settings must be clearly identified as browser-local");
assert(runtime.includes('snapshot?.overall?.source === "backend"') && runtime.includes("Number.isFinite(snapshot.overall.indexScore)"), "Area and Section selectors must display backend scores before local readings load");
assert(runtime.includes("function refreshDataForActivePage()") && runtime.includes("const dashboardRefreshTtlMs = 30 * 1000;") && runtime.includes("refreshDataForActivePage();"), "data pages must refresh stale dashboard data on navigation without reloading every page");
assert(runtime.includes('setLoginState(session, { resetWorkspace: true });'), "authenticated workspace entry must reset to Overview and a concrete priority zone");
assert(runtime.includes('function renderTrendAnalytics(') && runtime.includes('Time in target') && runtime.includes('function renderTrendComparisonChart('), "Trends must provide time in target and zone comparison");
assert(runtime.includes('smooth: 0.38') && runtime.includes('smoothMonotone: "x"'), "Trend curves must use visible monotone smoothing without changing measurement data");
assert(config.includes('apiBaseUrl: "https://api.neurocrop.lt"'), "runtime config must use the deployed API base URL");
assert(contract.includes('apiBaseUrl: "https://api.neurocrop.lt"'), "API contract must match the deployed API base URL");

if (failures) process.exitCode = 1;
else console.log("Runtime invariants passed.");
