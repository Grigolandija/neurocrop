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
assert(runtime.includes("if (isApiDataMode()) {") && runtime.includes("Never infer installed sensors"), "API mode must not fabricate per-node sensor readings");
assert(runtime.includes("const warningColor = \"#d08a2d\""), "trend warning segments must use amber, not critical red");
assert(runtime.includes("function renderRuntimeErrorState()"), "render failures must replace stale content with an explicit error state");
assert(runtime.includes('const filteredSites = blockSites.filter((site) => site.id === activeSiteId);'), "Sections must always follow the Area selected in the global header");
assert(!runtime.includes('data-block-filter-select class='), "Sections must not expose a competing local Area filter");
assert(runtime.includes("function rebuildEnhancedSelect(select)"), "Node Area changes must rebuild the visible Section selector");
assert(runtime.includes('sectionSelect.disabled = targetZones.length === 0;'), "Node Section selector must reflect whether the selected Area has sections");
assert(config.includes('apiBaseUrl: "https://api.neurocrop.lt"'), "runtime config must use the deployed API base URL");
assert(contract.includes('apiBaseUrl: "https://api.neurocrop.lt"'), "API contract must match the deployed API base URL");

if (failures) process.exitCode = 1;
else console.log("Runtime invariants passed.");
