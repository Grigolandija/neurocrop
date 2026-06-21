(function () {
  const STORAGE_KEY = "neurocrop-dashboard-data-v1";

  const defaultDashboardData = {
    sites: [
      {
        id: "greenhouse-1",
        name: "Greenhouse No. 1",
        zones: [
          {
            id: "tomato-a-back",
            name: "Tomato Block A, Rear",
            profile: "tomato",
            sensorCount: 4,
            batteryNodes: [
              { id: "NS-000001", level: 63 },
              { id: "NS-000002", level: 58 },
              { id: "NS-000003", level: 52 },
              { id: "NS-000004", level: 49 }
            ],
            availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"]
          },
          {
            id: "tomato-a-front",
            name: "Tomato Block A, Front",
            profile: "tomato",
            sensorCount: 3,
            batteryNodes: [
              { id: "NS-000005", level: 61 },
              { id: "NS-000006", level: 44 },
              { id: "NS-000007", level: 38 }
            ],
            availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"]
          },
          {
            id: "lettuce-rack-under",
            name: "Lettuce Rack, Under Shelf",
            profile: "lettuce",
            sensorCount: 5,
            batteryNodes: [
              { id: "NS-000008", level: 84 },
              { id: "NS-000009", level: 79 },
              { id: "NS-000010", level: 77 },
              { id: "NS-000011", level: 74 },
              { id: "NS-000012", level: 69 }
            ],
            availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"]
          }
        ]
      },
      {
        id: "greenhouse-2",
        name: "Greenhouse No. 2",
        zones: [
          {
            id: "strawberry-west",
            name: "Strawberry Block, West Side",
            profile: "strawberry",
            sensorCount: 4,
            batteryNodes: [
              { id: "NS-000013", level: 58 },
              { id: "NS-000014", level: 41 },
              { id: "NS-000015", level: 33 },
              { id: "NS-000016", level: 29 }
            ],
            availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"]
          },
          {
            id: "strawberry-east",
            name: "Strawberry Block, East Side",
            profile: "strawberry",
            sensorCount: 4,
            batteryNodes: [
              { id: "NS-000017", level: 72 },
              { id: "NS-000018", level: 68 },
              { id: "NS-000019", level: 65 },
              { id: "NS-000020", level: 60 }
            ],
            availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"]
          },
          {
            id: "seedling-center",
            name: "Nursery, Central Block",
            profile: "lettuce",
            sensorCount: 2,
            batteryNodes: [
              { id: "NS-000021", level: 57 },
              { id: "NS-000022", level: 46 }
            ],
            availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"]
          }
        ]
      }
    ],
    note: "Only the selected block is shown."
  };

  let memoryData = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeNodeId(nodeId) {
    const trimmed = String(nodeId || "").trim().toUpperCase();
    const match = trimmed.match(/^NS-(\d{1,6})$/);
    if (!match) return trimmed;
    return `NS-${match[1].padStart(6, "0")}`;
  }

  function sanitizeDevEui(devEui) {
    return String(devEui || "")
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-F]/g, "");
  }

  function sanitizeNodeName(nodeName) {
    return String(nodeName || "").trim();
  }

  function normalizeDashboardData(data) {
    const nextData = clone(data);
    nextData.sites = Array.isArray(nextData.sites) ? nextData.sites : [];

    nextData.sites = nextData.sites.map((site) => ({
      ...site,
      zones: (Array.isArray(site.zones) ? site.zones : []).map((zone) => {
        const batteryNodes = (Array.isArray(zone.batteryNodes) ? zone.batteryNodes : [])
          .map((node) => ({
            id: sanitizeNodeId(node.id),
            name: sanitizeNodeName(node.name) || sanitizeNodeId(node.id),
            level: Math.max(0, Math.min(Number(node.level) || 0, 100)),
            devEui: sanitizeDevEui(node.devEui),
            active: node.active !== false
          }))
          .sort((left, right) => left.id.localeCompare(right.id));
        const availableMetrics = Array.isArray(zone.availableMetrics) ? zone.availableMetrics.slice() : [];

        if (!availableMetrics.includes("batteryLevel")) {
          availableMetrics.push("batteryLevel");
        }

        return {
          ...zone,
          batteryNodes,
          sensorCount: batteryNodes.length,
          availableMetrics
        };
      })
    }));

    return nextData;
  }

  function readStoredData() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeDashboardData(JSON.parse(raw));
    } catch (error) {
      return memoryData ? normalizeDashboardData(memoryData) : null;
    }
  }

  function writeStoredData(data) {
    const normalized = normalizeDashboardData(data);
    memoryData = clone(normalized);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      return clone(normalized);
    }

    return clone(normalized);
  }

  function getDefaultDashboardData() {
    return normalizeDashboardData(defaultDashboardData);
  }

  function getDashboardData() {
    return readStoredData() || getDefaultDashboardData();
  }

  function getNextNodeId(data = getDashboardData()) {
    const maxId = data.sites
      .flatMap((site) => site.zones || [])
      .flatMap((zone) => zone.batteryNodes || [])
      .reduce((highest, node) => {
        const match = String(node.id || "").match(/^NS-(\d{1,6})$/);
        if (!match) return highest;
        return Math.max(highest, Number(match[1]));
      }, 0);

    return `NS-${String(maxId + 1).padStart(6, "0")}`;
  }

  function validateDevEui(devEui) {
    const nextDevEui = sanitizeDevEui(devEui);
    if (!/^[0-9A-F]{16}$/.test(nextDevEui)) {
      throw new Error("DevEUI must be 16 hexadecimal characters.");
    }
    return nextDevEui;
  }

  function hasDuplicateDevEui(data, devEui, excludedNodeId = "") {
    return data.sites
      .flatMap((item) => item.zones || [])
      .flatMap((item) => item.batteryNodes || [])
      .some((node) => node.devEui === devEui && node.id !== excludedNodeId);
  }

  function registerNode({ siteId, zoneId, nodeId, nodeName, batteryLevel, devEui }) {
    const data = getDashboardData();
    const site = data.sites.find((item) => item.id === siteId);
    if (!site) {
      throw new Error("Selected site was not found.");
    }

    const zone = (site.zones || []).find((item) => item.id === zoneId);
    if (!zone) {
      throw new Error("Selected zone was not found.");
    }

    const nextNodeId = nodeId ? sanitizeNodeId(nodeId) : getNextNodeId(data);
    const nextNodeName = sanitizeNodeName(nodeName);
    const nextDevEui = validateDevEui(devEui);
    if (!/^NS-\d{6}$/.test(nextNodeId)) {
      throw new Error("Node ID must use the format NS-000001.");
    }

    const alreadyExists = data.sites
      .flatMap((item) => item.zones || [])
      .flatMap((item) => item.batteryNodes || [])
      .some((node) => node.id === nextNodeId);
    if (alreadyExists) {
      throw new Error("This slave node ID already exists.");
    }

    if (hasDuplicateDevEui(data, nextDevEui)) {
      throw new Error("This DevEUI already exists.");
    }

    zone.batteryNodes = Array.isArray(zone.batteryNodes) ? zone.batteryNodes : [];
    zone.batteryNodes.push({
      id: nextNodeId,
      name: nextNodeName,
      level: Math.max(0, Math.min(Number(batteryLevel) || 0, 100)),
      devEui: nextDevEui,
      active: true
    });

    return writeStoredData(data);
  }

  function getNodeRecord(nodeId, data = getDashboardData()) {
    const nextNodeId = sanitizeNodeId(nodeId);

    for (const site of data.sites) {
      for (const zone of site.zones || []) {
        const node = (zone.batteryNodes || []).find((item) => item.id === nextNodeId);
        if (node) {
          return {
            node: clone(node),
            site: clone(site),
            zone: clone(zone)
          };
        }
      }
    }

    return null;
  }

  function updateNode({ currentNodeId, nextNodeId, siteId, zoneId, nodeName, batteryLevel, devEui }) {
    const data = getDashboardData();
    const existingRecord = getNodeRecord(currentNodeId, data);

    if (!existingRecord) {
      throw new Error("Selected slave node was not found.");
    }

    const targetSite = data.sites.find((item) => item.id === siteId);
    if (!targetSite) {
      throw new Error("Selected site was not found.");
    }

    const targetZone = (targetSite.zones || []).find((item) => item.id === zoneId);
    if (!targetZone) {
      throw new Error("Selected zone was not found.");
    }

    const sanitizedCurrentId = sanitizeNodeId(currentNodeId);
    const sanitizedNextId = nextNodeId ? sanitizeNodeId(nextNodeId) : sanitizedCurrentId;
    const nextNodeName = sanitizeNodeName(nodeName) || existingRecord.node.name || "";
    const currentDevEui = sanitizeDevEui(existingRecord.node.devEui);
    const submittedDevEui = sanitizeDevEui(devEui);
    const nextDevEui = submittedDevEui ? validateDevEui(submittedDevEui) : currentDevEui;
    if (!/^NS-\d{6}$/.test(sanitizedNextId)) {
      throw new Error("Node ID must use the format NS-000001.");
    }

    const idChanged = sanitizedCurrentId !== sanitizedNextId;
    if (idChanged) {
      const duplicate = data.sites
        .flatMap((item) => item.zones || [])
        .flatMap((item) => item.batteryNodes || [])
        .some((node) => node.id === sanitizedNextId);
      if (duplicate) {
        throw new Error("This slave node ID already exists.");
      }
    }

    if (nextDevEui && hasDuplicateDevEui(data, nextDevEui, sanitizedCurrentId)) {
      throw new Error("This DevEUI already exists.");
    }

    const sourceSite = data.sites.find((item) => item.id === existingRecord.site.id);
    const sourceZone = (sourceSite?.zones || []).find((item) => item.id === existingRecord.zone.id);
    if (!sourceZone) {
      throw new Error("Current node zone was not found.");
    }

    sourceZone.batteryNodes = (sourceZone.batteryNodes || []).filter((item) => item.id !== sanitizedCurrentId);
    targetZone.batteryNodes = Array.isArray(targetZone.batteryNodes) ? targetZone.batteryNodes : [];
    targetZone.batteryNodes.push({
      id: sanitizedNextId,
      name: nextNodeName,
      level: Math.max(0, Math.min(Number(batteryLevel ?? existingRecord.node.level) || 0, 100)),
      devEui: nextDevEui,
      active: existingRecord.node.active !== false
    });

    return writeStoredData(data);
  }

  function deleteNode(nodeId) {
    const data = getDashboardData();
    const record = getNodeRecord(nodeId, data);

    if (!record) {
      throw new Error("Selected slave node was not found.");
    }

    const site = data.sites.find((item) => item.id === record.site.id);
    const zone = (site?.zones || []).find((item) => item.id === record.zone.id);
    if (!zone) {
      throw new Error("Current node zone was not found.");
    }

    zone.batteryNodes = (zone.batteryNodes || []).filter((item) => item.id !== sanitizeNodeId(nodeId));
    return writeStoredData(data);
  }

  window.NeuroCropStore = {
    getDashboardData,
    getDefaultDashboardData,
    getNodeRecord,
    getNextNodeId,
    updateNode,
    deleteNode,
    registerNode,
    saveDashboardData: writeStoredData
  };
})();
