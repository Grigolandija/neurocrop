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
(function () {
  const config = window.NEUROCROP_CONFIG || {};
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");

  async function request(path, options = {}) {
    if (!apiBaseUrl) {
      throw new Error("API base URL is not configured.");
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `API request failed with ${response.status}.`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function queryString(params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, value);
    });
    const serialized = query.toString();
    return serialized ? `?${serialized}` : "";
  }

  // This is the frontend/backend contract. The backend owns credentials,
  // ChirpStack connectivity, validation, and database queries.
  window.NeuroCropApi = {
    isConnected: () => Boolean(apiBaseUrl),
    login: (email, password) => request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
    logout: () => request("/auth/logout", { method: "POST" }),
    getCurrentUser: () => request("/auth/me"),
    getDashboard: () => request("/dashboard"),
    getLatestReadings: (sectionId) => request(`/readings/latest${queryString({ sectionId })}`),
    getHistory: (params) => request(`/history${queryString(params)}`),
    getAreas: () => request("/areas"),
    getSections: (areaId) => request(`/sections${queryString({ areaId })}`),
    getNodes: (sectionId) => request(`/nodes${queryString({ sectionId })}`),
    registerNode: (payload) => request("/nodes/register", {
      method: "POST",
      body: JSON.stringify(payload)
    })
  };
})();
    const interfaceLanguageStorageKey = "neurocrop-interface-language-v1";
    const originalInterfaceText = new WeakMap();
    let interfaceLanguage = (() => {
      try {
        return window.localStorage.getItem(interfaceLanguageStorageKey) === "lt" ? "lt" : "en";
      } catch (error) {
        return "en";
      }
    })();

    const lithuanianInterfaceText = {
      "Language": "Kalba",
      "Sign out": "Atsijungti",
      "Control Center": "Valdymo centras",
      "Overview": "Apžvalga",
      "Areas": "Erdvės",
      "Area": "Erdvė",
      "Sections": "Sekcijos",
      "Section": "Sekcija",
      "Nodes": "Mazgai",
      "Node": "Mazgas",
      "Alerts": "Perspėjimai",
      "Trends": "Tendencijos",
      "Settings": "Nustatymai",
      "Workspace access": "Prieiga prie sistemos",
      "Know what your crop needs next.": "Žinokite, ko jūsų augalams reikia dabar.",
      "A single workspace for live growing conditions, section history, alerts, and sensor health.": "Viena sistema esamoms auginimo sąlygoms, istorijai, perspėjimams ir sensorių būklei.",
      "Sign in to NeuroCrop": "Prisijungti prie NeuroCrop",
      "Use the email address assigned to your farm workspace.": "Naudokite jūsų ūkiui priskirtą el. pašto adresą.",
      "Email address": "El. pašto adresas",
      "Password": "Slaptažodis",
      "Enter your password": "Įveskite slaptažodį",
      "Sign in": "Prisijungti",
      "Need access? Contact your workspace administrator.": "Reikia prieigos? Kreipkitės į sistemos administratorių.",
      "Low battery nodes": "Mazgai su silpna baterija",
      "Nodes below configured threshold": "Mazgai žemiau nustatytos baterijos ribos",
      "Today’s priority": "Šiandienos prioritetas",
      "Current": "Dabar",
      "Target": "Tikslas",
      "Trend": "Tendencija",
      "Out of range": "Už ribų",
      "Open metrics": "Atidaryti rodiklius",
      "Live readings": "Dabartiniai rodmenys",
      "Why?": "Kodėl?",
      "Review alerts": "Peržiūrėti perspėjimus",
      "other active alerts elsewhere in the system.": "kiti aktyvūs perspėjimai kitose sistemos vietose.",
      "Increase relative humidity": "Padidinti santykinę drėgmę",
      "Check Relative humidity": "Patikrinti santykinę drėgmę",
      "Relative humidity is pulling the score down. 4 metrics excluded.": "Santykinė drėgmė mažina balą. 4 rodikliai neįtraukti.",
      "Relative humidity is the main reason this score is low.": "Santykinė drėgmė yra pagrindinė žemo balo priežastis.",
      "Review humidification and ventilation settings. 4 metrics are excluded, so verify the change with live readings.": "Patikrinkite drėkinimo ir vėdinimo nustatymus. 4 rodikliai neįtraukti, todėl pokytį patvirtinkite dabartiniais matavimais.",
      "These three live parameters are the fastest way to understand Tomato Block A, Rear before opening all readings.": "Šie trys dabartiniai rodikliai greičiausiai parodo sekcijos Tomato Block A, Rear būklę prieš atidarant visus matavimus.",
      "Amber section": "Gintarinė sekcija",
      "Green section": "Žalia sekcija",
      "Red section": "Raudona sekcija",
      "Crop profile": "Kultūros profilis",
      "Inherited from section": "Paveldėta iš sekcijos",
      "View": "Vaizdas",
      "Simple": "Paprastas",
      "Detailed": "Išsamus",
      "Growing Conditions Score": "Auginimo sąlygų balas",
      "Growing Conditions Index": "Auginimo sąlygų indeksas",
      "Conditions score": "Sąlygų balas",
      "Needs attention": "Reikia dėmesio",
      "Good": "Gera",
      "Optimal": "Optimalu",
      "Warning": "Įspėjimas",
      "Critical": "Kritinė",
      "Unavailable": "Nepasiekiama",
      "Today": "Šiandien",
      "Sensor glance": "Sensorių apžvalga",
      "Live sensor snapshot": "Dabartinė sensorių suvestinė",
      "Growth limiting factors": "Augimą ribojantys veiksniai",
      "Air temperature": "Oro temperatūra",
      "Relative humidity": "Santykinė drėgmė",
      "Light": "Apšvietimas",
      "Soil temperature": "Substrato temperatūra",
      "Soil moisture": "Substrato drėgmė",
      "Water temperature": "Vandens temperatūra",
      "Air pressure": "Oro slėgis",
      "Leaf temperature": "Lapo temperatūra",
      "Battery level": "Baterijos lygis",
      "Currently viewing": "Šiuo metu rodoma",
      "Not installed": "Neįdiegta",
      "Holding inside target": "Išlieka tikslinėse ribose",
      "Dual-axis comparison · left and right Y axes use real units": "Dviejų ašių palyginimas · kairė ir dešinė Y ašys naudoja tikrus vienetus",
      "Now": "Dabar",
      "Change": "Pokytis",
      "Window low": "Laikotarpio minimumas",
      "Window high": "Laikotarpio maksimumas",
      "Why this matters": "Kodėl tai svarbu",
      "Ready for real sensor history once live readings are connected.": "Paruošta realiai sensorių istorijai, kai bus prijungti duomenys.",
      "24h window": "24 val. laikotarpis",
      "Optimal min + max": "Optimali min. ir maks. riba",
      "Left axis + right axis": "Kairė ir dešinė ašys",
      "Tooltip shows both real values": "Užvedus rodomos abi tikros reikšmės",
      "Time": "Laikas",
      "Active": "Aktyvūs",
      "Acknowledged": "Patvirtinti",
      "Snoozed": "Atidėti",
      "Resolved": "Išspręsti",
      "Acknowledge": "Patvirtinti",
      "Snooze": "Atidėti",
      "Resolve": "Išspręsti",
      "Current locations": "Esamos erdvės",
      "Current sections": "Esamos sekcijos",
      "Current nodes": "Esami mazgai",
      "Filter by Area": "Filtruoti pagal erdvę",
      "Filter by Section": "Filtruoti pagal sekciją",
      "All Areas": "Visos erdvės",
      "All Sections": "Visos sekcijos",
      "No low-battery nodes in this view": "Šiame vaizde nėra mazgų su silpna baterija",
      "No nodes match these filters.": "Nė vienas mazgas neatitinka pasirinktų filtrų.",
      "Choose another Area or Section to see its nodes.": "Pasirinkite kitą erdvę arba sekciją, kad pamatytumėte jos mazgus.",
      "Current areas": "Esamos erdvės",
      "Active alerts": "Aktyvūs perspėjimai",
      "Low battery": "Silpna baterija",
      "Shown sections": "Rodomos sekcijos",
      "Register area": "Registruoti erdvę",
      "Register section": "Registruoti sekciją",
      "Register node": "Registruoti mazgą",
      "Create area": "Sukurti erdvę",
      "Edit area": "Redaguoti erdvę",
      "Save area": "Išsaugoti erdvę",
      "Area name": "Erdvės pavadinimas",
      "Create section": "Sukurti sekciją",
      "Edit section": "Redaguoti sekciją",
      "Save section": "Išsaugoti sekciją",
      "Section name": "Sekcijos pavadinimas",
      "Connect a sensor to a section": "Prijungti sensorių prie sekcijos",
      "Setup needed": "Reikia paruošti",
      "Open": "Atidaryti",
      "Live": "Tiesiogiai",
      "Delayed": "Vėluoja",
      "Stale": "Pasenę",
      "Offline": "Neprisijungęs",
      "Reporting now": "Dabar siunčia",
      "metrics live now": "rodikliai dabar aktyvūs",
      "Restore sensor data": "Atkurkite sensorių duomenis",
      "Current reading unavailable": "Dabartinis rodmuo nepasiekiamas",
      "Connection lost": "Ryšys nutrūko",
      "On schedule": "Pagal grafiką",
      "Last known": "Paskutinė žinoma",
      "Reading failed": "Matavimas nepavyko",
      "Disconnected": "Atsijungęs",
      "Node offline": "Mazgas nepasiekiamas",
      "New measurement": "Naujas matavimas",
      "Showing the last known value": "Rodoma paskutinė žinoma reikšmė",
      "Expected sensor was not detected": "Numatytas sensorius neaptiktas",
      "Unassigned": "Nepriskirta",
      "All areas": "Visos erdvės",
      "Filtered area": "Filtruota erdvė",
      "Ready for live monitoring.": "Paruošta tiesioginiam stebėjimui.",
      "No live metrics": "Nėra aktyvių rodiklių",
      "Edit": "Redaguoti",
      "Delete": "Ištrinti",
      "Cancel": "Atšaukti",
      "Save changes": "Išsaugoti pakeitimus",
      "Create": "Sukurti",
      "Organization": "Organizacija",
      "Crop profiles": "Kultūrų profiliai",
      "Growth logic and account setup": "Auginimo logika ir paskyros nustatymai",
      "Profiles used by sections": "Sekcijose naudojami profiliai",
      "Create profile": "Sukurti profilį",
      "Profile name": "Profilio pavadinimas",
      "Short crop name": "Trumpas kultūros pavadinimas",
      "Growth stage": "Augimo stadija",
      "Copy targets from": "Kopijuoti tikslus iš",
      "Create crop profile": "Sukurti kultūros profilį",
      "Active profile": "Aktyvus profilis",
      "Duplicate": "Dubliuoti",
      "Alert rules": "Perspėjimų taisyklės",
      "Escalation timing": "Perspėjimo aktyvavimo laikas",
      "Save alert rules": "Išsaugoti perspėjimų taisykles",
      "Team & access": "Komanda ir prieigos",
      "People who can use this workspace": "Žmonės, galintys naudotis šia sistema",
      "Add user": "Pridėti naudotoją",
      "Remove": "Pašalinti",
      "Notifications": "Pranešimai",
      "Delivery and quiet hours": "Pristatymas ir ramybės valandos",
      "Save notifications": "Išsaugoti pranešimus",
      "Units & time": "Vienetai ir laikas",
      "Display preferences": "Vaizdavimo nustatymai",
      "Save preferences": "Išsaugoti nustatymus",
      "Data retention": "Duomenų saugojimas",
      "Trend storage policy": "Tendencijų saugojimo politika",
      "Save retention policy": "Išsaugoti saugojimo politiką",
      "Account": "Paskyra",
      "Account identity": "Paskyros informacija",
      "Save organization": "Išsaugoti organizaciją",
      "Work the issues that need attention": "Tvarkykite svarbiausius perspėjimus",
      "Each alert is tied to an Area, Section and live sensor reading. Actions are recorded locally until the backend is connected.": "Kiekvienas perspėjimas susietas su erdve, sekcija ir dabartiniu sensoriaus matavimu. Veiksmai saugomi lokaliai, kol bus prijungtas backend.",
      "View trend": "Peržiūrėti tendenciją",
      "There is nothing to action in this list right now.": "Šiuo metu šiame sąraše nėra veiksmų."
    };

    function translateInterfaceText(value) {
      const text = String(value || "");
      if (interfaceLanguage !== "lt" || !text.trim()) return text;
      const leading = text.match(/^\s*/)?.[0] || "";
      const trailing = text.match(/\s*$/)?.[0] || "";
      const core = text.trim().replace(/\s+/g, " ");
      if (lithuanianInterfaceText[core]) {
        return `${leading}${lithuanianInterfaceText[core]}${trailing}`;
      }

      const optimalBoundary = core.match(/^(.+) optimal (max|min)$/i);
      if (optimalBoundary) {
        const metric = lithuanianInterfaceText[optimalBoundary[1]] || optimalBoundary[1];
        const boundary = optimalBoundary[2].toLowerCase() === "max" ? "maks." : "min.";
        return `${leading}${metric} optimali ${boundary} riba${trailing}`;
      }

      const stableOutsideTarget = core.match(/^(.+) stable outside target$/i);
      if (stableOutsideTarget) {
        const metric = lithuanianInterfaceText[stableOutsideTarget[1]] || stableOutsideTarget[1];
        return `${leading}${metric} stabiliai laikosi už tikslinių ribų${trailing}`;
      }

      const returningToTarget = core.match(/^(.+) moving back toward target$/i);
      if (returningToTarget) {
        const metric = lithuanianInterfaceText[returningToTarget[1]] || returningToTarget[1];
        return `${leading}${metric} grįžta į tikslines ribas${trailing}`;
      }

      const humidityPriority = core.match(/^(.+) in (.+) is below target by (.+)\. Expected effect: VPD moves closer to target and plant water stress risk decreases\.$/i);
      if (humidityPriority) {
        return `${leading}Sekcijoje ${humidityPriority[1]}, erdvėje ${humidityPriority[2]}, rodiklis yra žemiau tikslo per ${humidityPriority[3]}. Tikėtinas poveikis: VPD priartės prie tikslo ir sumažės augalų vandens streso rizika.${trailing}`;
      }

      const patterns = [
        [/^Showing:\s*(.+)$/i, "Rodoma: $1"],
        [/^Updated\s+(.+)$/i, "Atnaujinta $1"],
        [/^(\d+)\s+sections available$/i, "$1 sekcijos"],
        [/^(\d+)\s+sections included in area score$/i, "$1 sekcijos įtrauktos į erdvės balą"],
        [/^(\d+)\s+nodes in this section$/i, "$1 mazgai šioje sekcijoje"],
        [/^(\d+)\s+nodes\s+·\s+(\d+)\s+unavailable$/i, "$1 mazgai · $2 nepasiekiami"],
        [/^(\d+)\s+nodes$/i, "$1 mazgai"],
        [/^(\d+)\s+metrics selected$/i, "Pasirinkti $1 rodikliai"],
        [/^(\d+)\s+registered nodes?$/i, "Užregistruoti mazgai: $1"],
        [/^(\d+)\s+areas? connected$/i, "Prijungtos erdvės: $1"],
        [/^(\d+)\s+sections? in this view$/i, "Šiame vaizde sekcijų: $1"],
        [/^(\d+)\s+sections? using it$/i, "Naudoja $1 sekcijos"],
        [/^(\d+)\s+users?$/i, "$1 naudotojai"],
        [/^(\d+)\s+critical$/i, "$1 kritiniai"],
        [/^(\d+)\s+warning$/i, "$1 įspėjimai"],
        [/^(\d+)\s+resolved$/i, "$1 išspręsti"],
        [/^Open for\s+(.+)$/i, "Aktyvus $1"],
        [/^Target\s+(.+)$/i, "Tikslas $1"],
        [/^Time\s*\\((.+)\\)$/i, "Laikas ($1)"],
        [/^Y unit:\s*(.+)$/i, "Y vienetas: $1"],
        [/^24-hour trends for\s+(.+)$/i, "24 val. tendencijos: $1"],
        [/^Select up to two metrics to compare how temperature, humidity, CO2, or VPD moved inside\s+(.+?)\.?$/i, "Pasirinkite iki dviejų rodiklių ir palyginkite temperatūros, drėgmės, CO2 ar VPD pokyčius sekcijoje $1."],
        [/^Select up to two metrics to compare how growing conditions moved across\s+(.+?)\.?$/i, "Pasirinkite iki dviejų rodiklių ir palyginkite auginimo sąlygų pokyčius erdvėje $1."],
        [/^(\d+)\s+other active alerts elsewhere in the system\\.?$/i, "Dar $1 aktyvūs perspėjimai kitose sistemos vietose."],
        [/^Inside target band$/i, "Tikslinėse ribose"],
        [/^Below target by\s+(.+)$/i, "Žemiau tikslo per $1"],
        [/^Above target by\s+(.+)$/i, "Virš tikslo per $1"],
        [/^Compared with the start of the\s+(.+)\s+window$/i, "Palyginti su $1 laikotarpio pradžia"],
        [/^Lowest point in the selected history window$/i, "Mažiausia pasirinkto laikotarpio reikšmė"],
        [/^Highest point in the selected history window$/i, "Didžiausia pasirinkto laikotarpio reikšmė"]
      ];
      const matchedPattern = patterns.find(([pattern]) => pattern.test(core));
      if (matchedPattern) {
        return `${leading}${core.replace(matchedPattern[0], matchedPattern[1])}${trailing}`;
      }
      return text;
    }

    function applyInterfaceLanguage(root = document.body) {
      document.documentElement.lang = interfaceLanguage;
      document.querySelectorAll("[data-language-option]").forEach((button) => {
        const isActive = button.dataset.languageOption === interfaceLanguage;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parentTag = node.parentElement?.tagName;
        if (parentTag !== "SCRIPT" && parentTag !== "STYLE") {
          if (!originalInterfaceText.has(node)) originalInterfaceText.set(node, node.nodeValue);
          const englishText = originalInterfaceText.get(node);
          node.nodeValue = interfaceLanguage === "lt" ? translateInterfaceText(englishText) : englishText;
        }
        node = walker.nextNode();
      }

      document.querySelectorAll("[placeholder], [title], [aria-label]").forEach((element) => {
        ["placeholder", "title", "aria-label"].forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          const dataKey = `i18n${attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}En`;
          if (!element.dataset[dataKey]) element.dataset[dataKey] = element.getAttribute(attribute);
          const englishValue = element.dataset[dataKey];
          element.setAttribute(
            attribute,
            interfaceLanguage === "lt" ? translateInterfaceText(englishValue).trim() : englishValue
          );
        });
      });
    }

    function setInterfaceLanguage(nextLanguage) {
      interfaceLanguage = nextLanguage === "lt" ? "lt" : "en";
      try {
        window.localStorage.setItem(interfaceLanguageStorageKey, interfaceLanguage);
      } catch (error) {
        // Language still works for the active session if storage is unavailable.
      }
      renderDashboard();
      applyInterfaceLanguage();
    }

    const stateConfig = {
      optimal: { label: "Optimal", shortLabel: "Optimal", badge: "Green section", textClass: "text-moss", thumb: "#2F6A4F", uplink: "4 min ago" },
      warning: { label: "Warning", shortLabel: "Attention", badge: "Amber section", textClass: "text-amber", thumb: "#D08A2D", uplink: "7 min ago" },
      critical: { label: "Critical", shortLabel: "Critical", badge: "Red section", textClass: "text-ember", thumb: "#AF4D38", uplink: "11 min ago" }
    };

    const scenarioConfig = {
      optimal: {
        label: "Live baseline",
        shortLabel: "Live",
        meta: "Balanced readings that mirror the current modeled operating band.",
        commandMeta: "Open the live baseline before pressure-testing the environment.",
        icon: "fa-seedling"
      },
      warning: {
        label: "Warning drill",
        shortLabel: "Warning",
        meta: "Recoverable drift that reveals where the first weak signals appear.",
        commandMeta: "Introduce warning-level stress across the generated environment.",
        icon: "fa-triangle-exclamation"
      },
      critical: {
        label: "Critical drill",
        shortLabel: "Critical",
        meta: "High-risk conditions that help you rehearse the recovery path.",
        commandMeta: "Push the environment into a critical simulation state.",
        icon: "fa-bolt"
      }
    };

    const criticalBatteryThreshold = 35;
    const unassignedLocationId = "unassigned-blocks";
    const unassignedLocationName = "Unassigned sections";

    function isUnassignedLocation(site) {
      return site?.id === unassignedLocationId || site?.isUnassigned === true;
    }

    function ensureUnassignedLocation(data) {
      let unassignedSite = data.sites.find((site) => isUnassignedLocation(site));
      if (!unassignedSite) {
        unassignedSite = { id: unassignedLocationId, name: unassignedLocationName, isUnassigned: true, zones: [] };
        data.sites.push(unassignedSite);
      }
      unassignedSite.name = unassignedLocationName;
      unassignedSite.isUnassigned = true;
      unassignedSite.zones = Array.isArray(unassignedSite.zones) ? unassignedSite.zones : [];
      return unassignedSite;
    }

    const cropProfiles = {
      tomato: {
        name: "Tomatoes, vegetative",
        heroName: "Tomato",
        hint: "Profile focused on active vegetative growth with stable CO2 and light conditions.",
        metrics: {
          airTemp: { label: "Air temperature", unit: "degC", decimals: 1, aggregation: "Block avg", optimal: [22, 26], warning: [20, 28], critical: [18, 32], zone: "Greenhouse No. 1 / central climate zone", action: "Check ventilation and heating balance." },
          humidity: { label: "Relative humidity", unit: "%", decimals: 0, aggregation: "Block avg", optimal: [60, 70], warning: [55, 75], critical: [45, 85], zone: "Greenhouse No. 1 / microclimate zone", action: "Review humidification and ventilation settings." },
          co2: { label: "CO2", unit: "ppm", decimals: 0, aggregation: "Block avg", optimal: [900, 1100], warning: [750, 1250], critical: [550, 1500], zone: "Greenhouse No. 1 / CO2 zone", action: "Check CO2 dosing cycle and valve timing." },
          lux: { label: "Light", unit: "lx", decimals: 0, aggregation: "Block avg", optimal: [28000, 36000], warning: [24000, 40000], critical: [18000, 46000], zone: "Stand 1 / lighting line", action: "Assess LED schedule stability and light curve." },
          soilTemp: { label: "Soil temperature", unit: "degC", decimals: 1, aggregation: "Root-zone avg", optimal: [20, 24], warning: [18, 26], critical: [15, 30], zone: "Nursery / root zone", action: "Monitor substrate heating and irrigation behavior." },
          vpd: { label: "VPD", unit: "kPa", decimals: 2, aggregation: "Block avg", optimal: [0.80, 1.20], warning: [0.60, 1.40], critical: [0.40, 1.80], zone: "Greenhouse No. 1 / climate zone", action: "Balance temperature and humidity to stabilize transpiration." },
          soilMoisture: { label: "Soil moisture", unit: "%", decimals: 0, aggregation: "Root-zone avg", optimal: [48, 62], warning: [40, 70], critical: [30, 80], zone: "Nursery / irrigation zone", action: "Check irrigation volume and substrate retention." },
          ec: { label: "EC", unit: "mS/cm", decimals: 2, aggregation: "Feed-line avg", optimal: [2.20, 3.20], warning: [1.80, 3.60], critical: [1.20, 4.20], zone: "Fertigation line", action: "Review nutrient dosing and EC target." },
          ph: { label: "pH", unit: "pH", decimals: 1, aggregation: "Feed-line avg", optimal: [5.8, 6.4], warning: [5.5, 6.8], critical: [5.0, 7.2], zone: "Fertigation line", action: "Correct nutrient solution pH." },
          leafTemp: { label: "Leaf temperature", unit: "degC", decimals: 1, aggregation: "Canopy avg", optimal: [21, 25], warning: [19, 27], critical: [16, 30], zone: "Canopy layer", action: "Inspect canopy stress and ventilation." },
          soilEc: { label: "Soil EC", unit: "mS/cm", decimals: 2, aggregation: "Root-zone avg", optimal: [1.80, 2.80], warning: [1.50, 3.20], critical: [1.00, 3.80], zone: "Root zone", action: "Check substrate salinity in the root zone." },
          waterTemp: { label: "Water temperature", unit: "degC", decimals: 1, aggregation: "Tank avg", optimal: [18, 21], warning: [16, 23], critical: [12, 26], zone: "Irrigation tank", action: "Inspect tank and irrigation loop temperature." },
          airPressure: { label: "Air pressure", unit: "hPa", decimals: 0, aggregation: "Block avg", optimal: [1004, 1018], warning: [998, 1024], critical: [990, 1032], zone: "Climate layer", action: "Use pressure changes to validate climate instability." },
          batteryLevel: { label: "Battery level", unit: "%", decimals: 0, aggregation: "Lowest node", optimal: [55, 100], warning: [35, 54], critical: [0, 34], alertThreshold: 55, displayRange: [0, 100], behavior: "higherIsBetter", zone: "Sensor nodes", action: "Plan battery replacement for low-power nodes." }
        }
      },
      lettuce: {
        name: "Lettuce, intensive growth",
        heroName: "Lettuce",
        hint: "Profile tuned for a milder climate and lower light intensity.",
        metrics: {
          airTemp: { label: "Air temperature", unit: "degC", decimals: 1, aggregation: "Block avg", optimal: [18, 22], warning: [16, 24], critical: [12, 28], zone: "Lettuce block / central zone", action: "Check cooling and air exchange balance." },
          humidity: { label: "Relative humidity", unit: "%", decimals: 0, aggregation: "Block avg", optimal: [55, 70], warning: [50, 75], critical: [40, 82], zone: "Lettuce block / humidity zone", action: "Adjust humidification interval and ventilation." },
          co2: { label: "CO2", unit: "ppm", decimals: 0, aggregation: "Block avg", optimal: [700, 900], warning: [600, 1000], critical: [450, 1200], zone: "Lettuce block / CO2 line", action: "Review CO2 dosing timing in this block." },
          lux: { label: "Light", unit: "lx", decimals: 0, aggregation: "Block avg", optimal: [18000, 26000], warning: [15000, 30000], critical: [10000, 36000], zone: "LED rack / lighting zone", action: "Adjust light intensity or photoperiod." },
          soilTemp: { label: "Soil temperature", unit: "degC", decimals: 1, aggregation: "Root-zone avg", optimal: [17, 20], warning: [15, 22], critical: [12, 26], zone: "Lettuce block / root zone", action: "Check substrate temperature control." },
          vpd: { label: "VPD", unit: "kPa", decimals: 2, aggregation: "Block avg", optimal: [0.55, 0.90], warning: [0.40, 1.05], critical: [0.25, 1.30], zone: "Lettuce block / climate zone", action: "Balance temperature and humidity for stable transpiration." },
          soilMoisture: { label: "Soil moisture", unit: "%", decimals: 0, aggregation: "Root-zone avg", optimal: [55, 70], warning: [48, 76], critical: [38, 84], zone: "Lettuce block / irrigation zone", action: "Adjust irrigation interval and substrate moisture." },
          ec: { label: "EC", unit: "mS/cm", decimals: 2, aggregation: "Feed-line avg", optimal: [1.40, 2.10], warning: [1.10, 2.40], critical: [0.80, 2.90], zone: "Fertigation line", action: "Tune nutrient EC for the lettuce stage." },
          ph: { label: "pH", unit: "pH", decimals: 1, aggregation: "Feed-line avg", optimal: [5.7, 6.3], warning: [5.4, 6.7], critical: [5.0, 7.1], zone: "Fertigation line", action: "Adjust nutrient solution pH." },
          leafTemp: { label: "Leaf temperature", unit: "degC", decimals: 1, aggregation: "Canopy avg", optimal: [17, 21], warning: [15, 23], critical: [12, 26], zone: "Canopy layer", action: "Inspect cooling and canopy stress." },
          soilEc: { label: "Soil EC", unit: "mS/cm", decimals: 2, aggregation: "Root-zone avg", optimal: [1.20, 1.90], warning: [1.00, 2.20], critical: [0.70, 2.70], zone: "Root zone", action: "Check substrate salinity." },
          waterTemp: { label: "Water temperature", unit: "degC", decimals: 1, aggregation: "Tank avg", optimal: [17, 20], warning: [15, 22], critical: [12, 25], zone: "Irrigation tank", action: "Check irrigation water temperature." },
          airPressure: { label: "Air pressure", unit: "hPa", decimals: 0, aggregation: "Block avg", optimal: [1004, 1018], warning: [998, 1024], critical: [990, 1032], zone: "Climate layer", action: "Track pressure swings during ventilation changes." },
          batteryLevel: { label: "Battery level", unit: "%", decimals: 0, aggregation: "Lowest node", optimal: [55, 100], warning: [35, 54], critical: [0, 34], alertThreshold: 55, displayRange: [0, 100], behavior: "higherIsBetter", zone: "Sensor nodes", action: "Schedule battery replacement." }
        }
      },
      strawberry: {
        name: "Strawberries, fruiting",
        heroName: "Strawberry",
        hint: "Profile focused on stable light and balanced temperature during fruiting.",
        metrics: {
          airTemp: { label: "Air temperature", unit: "degC", decimals: 1, aggregation: "Block avg", optimal: [20, 24], warning: [18, 26], critical: [15, 30], zone: "Strawberry block / climate zone", action: "Check temperature control and air circulation." },
          humidity: { label: "Relative humidity", unit: "%", decimals: 0, aggregation: "Block avg", optimal: [60, 70], warning: [55, 75], critical: [45, 82], zone: "Strawberry block / microclimate zone", action: "Check humidity stability in the fruiting area." },
          co2: { label: "CO2", unit: "ppm", decimals: 0, aggregation: "Block avg", optimal: [800, 1000], warning: [650, 1100], critical: [500, 1300], zone: "Strawberry block / CO2 zone", action: "Align CO2 supply with the active lighting period." },
          lux: { label: "Light", unit: "lx", decimals: 0, aggregation: "Block avg", optimal: [22000, 30000], warning: [19000, 34000], critical: [14000, 40000], zone: "Strawberry block / lighting line", action: "Check lamp load and lighting schedule." },
          soilTemp: { label: "Soil temperature", unit: "degC", decimals: 1, aggregation: "Root-zone avg", optimal: [18, 22], warning: [16, 24], critical: [13, 27], zone: "Strawberry block / substrate zone", action: "Monitor thermal stability in the root zone." },
          vpd: { label: "VPD", unit: "kPa", decimals: 2, aggregation: "Block avg", optimal: [0.70, 1.10], warning: [0.50, 1.30], critical: [0.35, 1.65], zone: "Strawberry block / climate zone", action: "Balance humidity and temperature for fruiting stability." },
          soilMoisture: { label: "Soil moisture", unit: "%", decimals: 0, aggregation: "Root-zone avg", optimal: [50, 64], warning: [42, 72], critical: [34, 80], zone: "Strawberry block / irrigation zone", action: "Check irrigation timing and substrate moisture." },
          ec: { label: "EC", unit: "mS/cm", decimals: 2, aggregation: "Feed-line avg", optimal: [1.60, 2.40], warning: [1.30, 2.80], critical: [0.90, 3.30], zone: "Fertigation line", action: "Review nutrient EC for fruiting." },
          ph: { label: "pH", unit: "pH", decimals: 1, aggregation: "Feed-line avg", optimal: [5.7, 6.3], warning: [5.4, 6.7], critical: [5.0, 7.1], zone: "Fertigation line", action: "Correct nutrient solution pH." },
          leafTemp: { label: "Leaf temperature", unit: "degC", decimals: 1, aggregation: "Canopy avg", optimal: [19, 23], warning: [17, 25], critical: [14, 28], zone: "Canopy layer", action: "Check canopy temperature and transpiration stress." },
          soilEc: { label: "Soil EC", unit: "mS/cm", decimals: 2, aggregation: "Root-zone avg", optimal: [1.30, 2.20], warning: [1.00, 2.60], critical: [0.70, 3.20], zone: "Root zone", action: "Check root-zone salinity." },
          waterTemp: { label: "Water temperature", unit: "degC", decimals: 1, aggregation: "Tank avg", optimal: [17, 20], warning: [15, 22], critical: [12, 25], zone: "Irrigation tank", action: "Inspect water loop temperature." },
          airPressure: { label: "Air pressure", unit: "hPa", decimals: 0, aggregation: "Block avg", optimal: [1004, 1018], warning: [998, 1024], critical: [990, 1032], zone: "Climate layer", action: "Use pressure shifts to detect climate instability." },
          batteryLevel: { label: "Battery level", unit: "%", decimals: 0, aggregation: "Lowest node", optimal: [55, 100], warning: [35, 54], critical: [0, 34], alertThreshold: 55, displayRange: [0, 100], behavior: "higherIsBetter", zone: "Sensor nodes", action: "Replace low battery nodes before data loss." }
        }
      }
    };

    // Custom profiles are kept separately from the built-in templates so they
    // survive reloads now and can later map cleanly to backend profile records.
    const cropProfilesStorageKey = "neurocrop-dashboard-crop-profiles-v1";
    const cropProfileOverridesStorageKey = "neurocrop-dashboard-crop-profile-overrides-v1";
    const builtInCropProfileKeys = new Set(Object.keys(cropProfiles));
    const cropProfileTemplateLibrary = [
      {
        key: "tomato-vegetative",
        crop: "Tomato",
        stage: "Vegetative",
        name: "Tomatoes, vegetative",
        sourceProfile: "tomato",
        status: "available",
        note: "NeuroCrop starting point"
      },
      {
        key: "lettuce-intensive",
        crop: "Lettuce",
        stage: "Intensive growth",
        name: "Lettuce, intensive growth",
        sourceProfile: "lettuce",
        status: "available",
        note: "NeuroCrop starting point"
      },
      {
        key: "strawberry-fruiting",
        crop: "Strawberry",
        stage: "Fruiting",
        name: "Strawberries, fruiting",
        sourceProfile: "strawberry",
        status: "available",
        note: "NeuroCrop starting point"
      },
      {
        key: "cucumber",
        crop: "Cucumber",
        stage: "",
        name: "Cucumber program",
        sourceProfile: "",
        status: "manual",
        note: "Set targets manually"
      },
      {
        key: "pepper",
        crop: "Pepper",
        stage: "",
        name: "Pepper program",
        sourceProfile: "",
        status: "manual",
        note: "Set targets manually"
      },
      {
        key: "herbs",
        crop: "Herbs",
        stage: "",
        name: "Herbs program",
        sourceProfile: "",
        status: "manual",
        note: "Set targets manually"
      }
    ];

    function loadCustomCropProfiles() {
      try {
        const savedProfiles = JSON.parse(window.localStorage.getItem(cropProfilesStorageKey) || "{}");
        if (!savedProfiles || typeof savedProfiles !== "object" || Array.isArray(savedProfiles)) return;

        Object.entries(savedProfiles).forEach(([profileKey, profile]) => {
          const isUsableProfile = profile
            && typeof profile === "object"
            && typeof profile.name === "string"
            && profile.metrics
            && typeof profile.metrics === "object";

          if (!builtInCropProfileKeys.has(profileKey) && isUsableProfile) {
            cropProfiles[profileKey] = profile;
          }
        });
      } catch (error) {
        // An invalid browser cache must never block the dashboard.
      }
    }

    function persistCustomCropProfiles() {
      const customProfiles = Object.fromEntries(
        Object.entries(cropProfiles).filter(([profileKey]) => !builtInCropProfileKeys.has(profileKey))
      );

      try {
        window.localStorage.setItem(cropProfilesStorageKey, JSON.stringify(customProfiles));
      } catch (error) {
        // The UI still works in restricted file:// browser contexts.
      }
    }

    function loadCropProfileOverrides() {
      try {
        const savedProfiles = JSON.parse(window.localStorage.getItem(cropProfileOverridesStorageKey) || "{}");
        if (!savedProfiles || typeof savedProfiles !== "object" || Array.isArray(savedProfiles)) return;

        Object.entries(savedProfiles).forEach(([profileKey, savedProfile]) => {
          if (!cropProfiles[profileKey] || !savedProfile || typeof savedProfile !== "object") return;
          const profile = cropProfiles[profileKey];
          profile.name = typeof savedProfile.name === "string" ? savedProfile.name : profile.name;
          profile.heroName = typeof savedProfile.heroName === "string" ? savedProfile.heroName : profile.heroName;
          profile.hint = typeof savedProfile.hint === "string" ? savedProfile.hint : profile.hint;
          profile.stage = typeof savedProfile.stage === "string" ? savedProfile.stage : (profile.stage || "");
          if (savedProfile.metrics && typeof savedProfile.metrics === "object") {
            Object.entries(savedProfile.metrics).forEach(([metricKey, metric]) => {
              if (profile.metrics[metricKey] && metric && typeof metric === "object") {
                profile.metrics[metricKey] = { ...profile.metrics[metricKey], ...metric };
              }
            });
          }
        });
      } catch (error) {
        // Browser cache is optional in the prototype.
      }
    }

    function persistCropProfileOverrides() {
      const savedProfiles = Object.fromEntries(Object.entries(cropProfiles).map(([profileKey, profile]) => [profileKey, {
        name: profile.name,
        heroName: profile.heroName,
        hint: profile.hint,
        stage: profile.stage || "",
        metrics: profile.metrics
      }]));

      try {
        window.localStorage.setItem(cropProfileOverridesStorageKey, JSON.stringify(savedProfiles));
      } catch (error) {
        // The dashboard still functions when localStorage is unavailable.
      }
    }

    loadCustomCropProfiles();
    loadCropProfileOverrides();

    const scenarioDirections = {
      optimal: { airTemp: "optimal", humidity: "optimal", co2: "optimal", lux: "optimal", soilTemp: "optimal" },
      warning: { airTemp: "highWarning", humidity: "lowWarning", co2: "lowWarning", lux: "highWarning", soilTemp: "optimal" },
      critical: { airTemp: "highCritical", humidity: "lowCritical", co2: "lowCritical", lux: "highCritical", soilTemp: "highWarning" }
    };

    const zoneReadingOverrides = {
      "tomato-a-back": {
        optimal: { humidity: 58.1 }
      },
      "tomato-a-front": {
        optimal: { vpd: 1.13, humidity: 56 }
      },
      "lettuce-rack-under": {
        optimal: { vpd: 0.74 }
      },
      "strawberry-west": {
        optimal: { humidity: 57.9 }
      },
      "strawberry-east": {
        optimal: { vpd: 1.06 }
      },
      "seedling-center": {
        optimal: { airTemp: 20.5, humidity: 53 }
      }
    };

    let dashboardData = {
      sites: [
        {
          id: "greenhouse-1",
          name: "Greenhouse No. 1",
          zones: [
            { id: "tomato-a-back", name: "Tomato Block A, Rear", profile: "tomato", sensorCount: 4, batteryNodes: [{ id: "NS-000001", level: 63 }, { id: "NS-000002", level: 58 }, { id: "NS-000003", level: 52 }, { id: "NS-000004", level: 49 }], availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"] },
            { id: "tomato-a-front", name: "Tomato Block A, Front", profile: "tomato", sensorCount: 3, batteryNodes: [{ id: "NS-000005", level: 61 }, { id: "NS-000006", level: 44 }, { id: "NS-000007", level: 38 }], availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"] },
            { id: "lettuce-rack-under", name: "Lettuce Rack, Under Shelf", profile: "lettuce", sensorCount: 5, batteryNodes: [{ id: "NS-000008", level: 84 }, { id: "NS-000009", level: 79 }, { id: "NS-000010", level: 77 }, { id: "NS-000011", level: 74 }, { id: "NS-000012", level: 69 }], availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"] }
          ]
        },
        {
          id: "greenhouse-2",
          name: "Greenhouse No. 2",
          zones: [
            { id: "strawberry-west", name: "Strawberry Block, West Side", profile: "strawberry", sensorCount: 4, batteryNodes: [{ id: "NS-000013", level: 58 }, { id: "NS-000014", level: 41 }, { id: "NS-000015", level: 33 }, { id: "NS-000016", level: 29 }], availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"] },
            { id: "strawberry-east", name: "Strawberry Block, East Side", profile: "strawberry", sensorCount: 4, batteryNodes: [{ id: "NS-000017", level: 72 }, { id: "NS-000018", level: 68 }, { id: "NS-000019", level: 65 }, { id: "NS-000020", level: 60 }], availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"] },
            { id: "seedling-center", name: "Nursery, Central Block", profile: "lettuce", sensorCount: 2, batteryNodes: [{ id: "NS-000021", level: 57 }, { id: "NS-000022", level: 46 }], availableMetrics: ["airTemp", "humidity", "co2", "lux", "soilTemp", "vpd", "soilMoisture", "waterTemp", "airPressure", "batteryLevel"] }
          ]
        }
      ],
      note: "Only the selected block is shown."
    };

    if (window.NeuroCropStore) {
      dashboardData = window.NeuroCropStore.getDashboardData();
    }

    const elements = {
      loginScreen: document.getElementById("loginScreen"),
      dashboardShell: document.getElementById("dashboardShell"),
      loginForm: document.getElementById("loginForm"),
      loginEmail: document.getElementById("loginEmail"),
      loginPassword: document.getElementById("loginPassword"),
      loginError: document.getElementById("loginError"),
      appHeader: document.getElementById("dashboardHeader"),
      experienceModeSection: document.getElementById("experienceModeSection"),
      experienceModeTitle: document.getElementById("experienceModeTitle"),
      experienceModeSummary: document.getElementById("experienceModeSummary"),
      experienceModeControl: document.getElementById("experienceModeControl"),
      locationsManagementSection: document.getElementById("locationsManagementSection"),
      locationsManagementShell: document.getElementById("locationsManagementShell"),
      blocksManagementSection: document.getElementById("blocksManagementSection"),
      blocksManagementShell: document.getElementById("blocksManagementShell"),
      nodesManagementSection: document.getElementById("nodesManagementSection"),
      nodesManagementShell: document.getElementById("nodesManagementShell"),
      settingsManagementSection: document.getElementById("settingsManagementSection"),
      settingsManagementShell: document.getElementById("settingsManagementShell"),
      alertsManagementSection: document.getElementById("alertsManagementSection"),
      alertsManagementShell: document.getElementById("alertsManagementShell"),
      sidebarQuickActions: document.getElementById("sidebarQuickActions"),
      heroStatusPanel: document.getElementById("heroStatusPanel"),
      overviewTriageSection: document.getElementById("overviewTriageSection"),
      todayPriorityPanel: document.getElementById("todayPriorityPanel"),
      todayPriorityMain: document.getElementById("todayPriorityMain"),
      todayPriorityAlerts: document.getElementById("todayPriorityAlerts"),
      commandPaletteButton: document.getElementById("commandPaletteButton"),
      headerBatteryIndicator: document.getElementById("headerBatteryIndicator"),
      headerBatteryCount: document.getElementById("headerBatteryCount"),
      headerBatteryDropdown: document.getElementById("headerBatteryDropdown"),
      headerBatteryDropdownCount: document.getElementById("headerBatteryDropdownCount"),
      headerBatteryDropdownContent: document.getElementById("headerBatteryDropdownContent"),
      headerConnectionStatus: document.getElementById("headerConnectionStatus"),
      headerConnectionLabel: document.getElementById("headerConnectionLabel"),
      headerAccountEmail: document.getElementById("headerAccountEmail"),
      headerAccountButton: document.getElementById("headerAccountButton"),
      headerAccountMenu: document.getElementById("headerAccountMenu"),
      signOutButton: document.getElementById("signOutButton"),
      heroHeadline: document.getElementById("heroHeadline"),
      heroDescription: document.getElementById("heroDescription"),
      scopeHelperText: document.getElementById("scopeHelperText"),
      zoneScopeButton: document.getElementById("zoneScopeButton"),
      siteScopeButton: document.getElementById("siteScopeButton"),
      scopeChip: document.getElementById("scopeChip"),
      heroTimestampChip: document.getElementById("heroTimestampChip"),
      advancedToolsPanel: document.getElementById("advancedToolsPanel"),
      advancedToolsTitle: document.getElementById("advancedToolsTitle"),
      advancedToolsSummaryText: document.getElementById("advancedToolsSummaryText"),
      advancedToolsStateChip: document.getElementById("advancedToolsStateChip"),
      scenarioLabPanel: document.getElementById("scenarioLabPanel"),
      scenarioLabTitle: document.getElementById("scenarioLabTitle"),
      scenarioLabSummary: document.getElementById("scenarioLabSummary"),
      scenarioLabScopeChip: document.getElementById("scenarioLabScopeChip"),
      scenarioLabModeChip: document.getElementById("scenarioLabModeChip"),
      impactBoardPanel: document.getElementById("impactBoardPanel"),
      impactBoardTitle: document.getElementById("impactBoardTitle"),
      impactBoardSummary: document.getElementById("impactBoardSummary"),
      impactBaselineScore: document.getElementById("impactBaselineScore"),
      impactCurrentScore: document.getElementById("impactCurrentScore"),
      impactScoreDeltaChip: document.getElementById("impactScoreDeltaChip"),
      impactBoardMeta: document.getElementById("impactBoardMeta"),
      impactBoardActionButton: document.getElementById("impactBoardActionButton"),
      impactBoardCards: document.getElementById("impactBoardCards"),
      decisionBriefPanel: document.getElementById("decisionBriefPanel"),
      decisionBriefTitle: document.getElementById("decisionBriefTitle"),
      decisionBriefSummary: document.getElementById("decisionBriefSummary"),
      decisionBriefStatus: document.getElementById("decisionBriefStatus"),
      decisionBriefCopyShortButton: document.getElementById("decisionBriefCopyShortButton"),
      decisionBriefCopyButton: document.getElementById("decisionBriefCopyButton"),
      decisionBriefPreview: document.getElementById("decisionBriefPreview"),
      decisionBriefChips: document.getElementById("decisionBriefChips"),
      manualOverridePanel: document.getElementById("manualOverridePanel"),
      manualOverrideState: document.getElementById("manualOverrideState"),
      manualOverrideTitle: document.getElementById("manualOverrideTitle"),
      manualOverrideSummary: document.getElementById("manualOverrideSummary"),
      manualOverrideMeta: document.getElementById("manualOverrideMeta"),
      manualOverrideResetButton: document.getElementById("manualOverrideResetButton"),
      indicatorTitle: document.getElementById("indicatorTitle"),
      indicatorScoreLabel: document.getElementById("indicatorScoreLabel"),
      indicatorScoreState: document.getElementById("indicatorScoreState"),
      indicatorSummary: document.getElementById("indicatorSummary"),
      indicatorZoneBadge: document.getElementById("indicatorZoneBadge"),
      indicatorScoreWrap: document.getElementById("indicatorScoreWrap"),
      indicatorScore: document.getElementById("indicatorScore"),
      heroSensorGlanceTitle: document.getElementById("heroSensorGlanceTitle"),
      heroSensorGlanceSummary: document.getElementById("heroSensorGlanceSummary"),
      heroSensorGlanceShell: document.getElementById("heroSensorGlanceShell"),
      heroSensorGlanceGrid: document.getElementById("heroSensorGlanceGrid"),
      indicatorDriverGroup: document.getElementById("indicatorDriverGroup"),
      indicatorDrivers: document.getElementById("indicatorDrivers"),
      indicatorSupportGrid: document.getElementById("indicatorSupportGrid"),
      indicatorCountStrip: document.getElementById("indicatorCountStrip"),
      actionDeckLabel: document.getElementById("actionDeckLabel"),
      actionDeckSummary: document.getElementById("actionDeckSummary"),
      actionDeckShortcuts: document.getElementById("actionDeckShortcuts"),
      actionDeckShell: document.getElementById("actionDeckShell"),
      actionDeck: document.getElementById("actionDeck"),
      indicatorMetaLabel: document.getElementById("indicatorMetaLabel"),
      indicatorUplink: document.getElementById("indicatorUplink"),
      conditionTrackShell: document.getElementById("conditionTrackShell"),
      indicatorStageFooter: document.getElementById("indicatorStageFooter"),
      conditionFill: document.getElementById("conditionFill"),
      conditionThumb: document.getElementById("conditionThumb"),
      conditionThumbLabel: document.getElementById("conditionThumbLabel"),
      overallStateCard: document.getElementById("overallStateCard"),
      overallStateTitle: document.getElementById("overallStateTitle"),
      stableCount: document.getElementById("stableCount"),
      warningCount: document.getElementById("warningCount"),
      criticalCount: document.getElementById("criticalCount"),
      decisionFocusValue: document.getElementById("decisionFocusValue"),
      decisionFocusNote: document.getElementById("decisionFocusNote"),
      decisionUrgencyValue: document.getElementById("decisionUrgencyValue"),
      decisionUrgencyNote: document.getElementById("decisionUrgencyNote"),
      decisionConfidenceValue: document.getElementById("decisionConfidenceValue"),
      decisionConfidenceNote: document.getElementById("decisionConfidenceNote"),
      siteTrigger: document.getElementById("siteTrigger"),
      zoneTrigger: document.getElementById("zoneTrigger"),
      zoneContextCard: document.getElementById("zoneContextCard"),
      siteMenu: document.getElementById("siteMenu"),
      zoneMenu: document.getElementById("zoneMenu"),
      siteContextValue: document.getElementById("siteContextValue"),
      siteContextMeta: document.getElementById("siteContextMeta"),
      zoneContextValue: document.getElementById("zoneContextValue"),
      zoneContextMeta: document.getElementById("zoneContextMeta"),
      profileContextValue: document.getElementById("profileContextValue"),
      profileContextMeta: document.getElementById("profileContextMeta"),
      globalSystemCard: document.getElementById("globalSystemCard"),
      globalSystemTitle: document.getElementById("globalSystemTitle"),
      globalSystemSummary: document.getElementById("globalSystemSummary"),
      globalSystemText: document.getElementById("globalSystemText"),
      globalSystemChip: document.getElementById("globalSystemChip"),
      globalSystemExpanded: document.getElementById("globalSystemExpanded"),
      globalStableCount: document.getElementById("globalStableCount"),
      globalWarningCount: document.getElementById("globalWarningCount"),
      globalCriticalCount: document.getElementById("globalCriticalCount"),
      alertRailMeta: document.getElementById("alertRailMeta"),
      alertRailFilters: document.getElementById("alertRailFilters"),
      globalSystemList: document.getElementById("globalSystemList"),
      alertsSection: document.getElementById("alertsSection"),
      opsDockSection: document.getElementById("opsDockSection"),
      opsDockTitle: document.getElementById("opsDockTitle"),
      opsDockStateChip: document.getElementById("opsDockStateChip"),
      opsDockSummary: document.getElementById("opsDockSummary"),
      opsDockResetButton: document.getElementById("opsDockResetButton"),
      opsDockSecondaryButton: document.getElementById("opsDockSecondaryButton"),
      workspaceFocusSummary: document.getElementById("workspaceFocusSummary"),
      workspaceFocusBar: document.getElementById("workspaceFocusBar"),
      opsDockCards: document.getElementById("opsDockCards"),
      metricsSection: document.getElementById("metricsSection"),
      sensorHealthSection: document.getElementById("sensorHealthSection"),
      metricsSectionKicker: document.getElementById("metricsSectionKicker"),
      metricsSectionTitle: document.getElementById("metricsSectionTitle"),
      siteMetricsViewToggle: document.getElementById("siteMetricsViewToggle"),
      siteAveragesButton: document.getElementById("siteAveragesButton"),
      siteZonesButton: document.getElementById("siteZonesButton"),
      workbenchToolbar: document.getElementById("workbenchToolbar"),
      workbenchLensBar: document.getElementById("workbenchLensBar"),
      workbenchLensSummary: document.getElementById("workbenchLensSummary"),
      metricsGrid: document.getElementById("metricsGrid"),
      historySection: document.getElementById("historySection"),
      trendHistoryTitle: document.getElementById("trendHistoryTitle"),
      trendHistorySummary: document.getElementById("trendHistorySummary"),
      trendHistoryStateChip: document.getElementById("trendHistoryStateChip"),
      trendHistoryRangeMeta: document.getElementById("trendHistoryRangeMeta"),
      trendHistoryActiveAreaLabel: document.getElementById("trendHistoryActiveAreaLabel"),
      trendHistoryActiveSectionLabel: document.getElementById("trendHistoryActiveSectionLabel"),
      historyLocationTrigger: document.getElementById("historyLocationTrigger"),
      historyLocationValue: document.getElementById("historyLocationValue"),
      historyLocationScore: document.getElementById("historyLocationScore"),
      historyLocationMenu: document.getElementById("historyLocationMenu"),
      historyBlockTrigger: document.getElementById("historyBlockTrigger"),
      historyBlockValue: document.getElementById("historyBlockValue"),
      historyBlockScore: document.getElementById("historyBlockScore"),
      historyBlockMenu: document.getElementById("historyBlockMenu"),
      trendMetricBar: document.getElementById("trendMetricBar"),
      trendRangeBar: document.getElementById("trendRangeBar"),
      trendHistoryMetricLabel: document.getElementById("trendHistoryMetricLabel"),
      trendHistoryMetricMeta: document.getElementById("trendHistoryMetricMeta"),
      trendHistoryReadout: document.getElementById("trendHistoryReadout"),
      trendHistoryChart: document.getElementById("trendHistoryChart"),
      trendHistoryTooltip: document.getElementById("trendHistoryTooltip"),
      trendHistoryStartLabel: document.getElementById("trendHistoryStartLabel"),
      trendHistoryMidLabel: document.getElementById("trendHistoryMidLabel"),
      trendHistoryEndLabel: document.getElementById("trendHistoryEndLabel"),
      trendHistoryCallout: document.getElementById("trendHistoryCallout"),
      trendHistoryBackendNote: document.getElementById("trendHistoryBackendNote"),
      sensorHealthTitle: document.getElementById("sensorHealthTitle"),
      sensorHealthActionButton: document.getElementById("sensorHealthActionButton"),
      sensorHealthChip: document.getElementById("sensorHealthChip"),
      sensorHealthSummary: document.getElementById("sensorHealthSummary"),
      sensorHealthMeta: document.getElementById("sensorHealthMeta"),
      sensorHealthFilters: document.getElementById("sensorHealthFilters"),
      sensorHealthList: document.getElementById("sensorHealthList"),
      unavailableMetricsPanel: document.getElementById("unavailableMetricsPanel"),
      unavailableMetricsTitle: document.getElementById("unavailableMetricsTitle"),
      unavailableMetricsCount: document.getElementById("unavailableMetricsCount"),
      unavailableMetricsGrid: document.getElementById("unavailableMetricsGrid"),
      zoneImpactSection: document.getElementById("zoneImpactSection"),
      zoneImpactKicker: document.getElementById("zoneImpactKicker"),
      zoneImpactTitle: document.getElementById("zoneImpactTitle"),
      zoneImpactMeta: document.getElementById("zoneImpactMeta"),
      zoneImpactFilters: document.getElementById("zoneImpactFilters"),
      zoneImpactGrid: document.getElementById("zoneImpactGrid"),
      zoneImpactActionButton: document.getElementById("zoneImpactActionButton"),
      commandPaletteOverlay: document.getElementById("commandPaletteOverlay"),
      managementModalOverlay: document.getElementById("managementModalOverlay"),
      commandPaletteInput: document.getElementById("commandPaletteInput"),
      commandPaletteResults: document.getElementById("commandPaletteResults"),
      detailedDiagnosticsSection: document.getElementById("detailedDiagnosticsSection"),
      headerContextSelectors: document.getElementById("headerContextSelectors")
    };

    const heroContextBar = document.querySelector("#heroStatusPanel .hero-context-bar");
    const heroScopeToggle = document.querySelector("#heroStatusPanel .scope-toggle");
    if (elements.headerContextSelectors && heroContextBar && heroScopeToggle) {
      elements.headerContextSelectors.append(heroContextBar, heroScopeToggle);
    }

    // Keep optional simulation tools out of the primary overview hierarchy.
    if (elements.advancedToolsPanel && elements.zoneImpactSection) {
      elements.zoneImpactSection.insertAdjacentElement("afterend", elements.advancedToolsPanel);
      elements.advancedToolsPanel.classList.add("standalone-advanced-tools");
    }

    const loginSessionKey = "neurocrop-dashboard-session-v1";

    function getLoginSession() {
      try {
        return JSON.parse(window.sessionStorage.getItem(loginSessionKey) || "null");
      } catch (error) {
        return null;
      }
    }

    function setLoginState(session) {
      const signedIn = Boolean(session?.email);
      elements.loginScreen.hidden = signedIn;
      elements.dashboardShell.hidden = !signedIn;
      if (signedIn) {
        elements.headerAccountEmail.textContent = session.email;
        window.requestAnimationFrame(syncStickyOffsets);
        hydrateDashboardFromApi();
      }
    }

    async function hydrateDashboardFromApi() {
      if (!window.NeuroCropApi?.isConnected()) return;
      try {
        const nextDashboardData = await window.NeuroCropApi.getDashboard();
        if (!nextDashboardData || !Array.isArray(nextDashboardData.sites) || nextDashboardData.sites.length === 0) {
          dashboardData = { sites: [], note: "API returned no dashboard structure." };
          currentReadings = {};
          renderDashboard();
          return;
        }
        dashboardData = normalizeApiDashboardData(nextDashboardData);
        const nextSite = getActiveSite() || dashboardData.sites[0];
        const nextZone = getActiveZone(nextSite) || nextSite.zones?.[0];
        if (!nextSite || !nextZone) return;
        activeSiteId = nextSite.id;
        activeZoneId = nextZone.id;
        renderSiteOptions();
        renderZoneOptions();
        resetCurrentReadingsFromActiveZone();
        renderDashboard();
      } catch (error) {
        console.warn("NeuroCrop API dashboard load failed.", error);
        dashboardData = { sites: [], note: "API dashboard load failed." };
        currentReadings = {};
        renderDashboard();
      }
    }

    async function initializeLoginGate() {
      if (window.NeuroCropApi?.isConnected()) {
        try {
          const response = await window.NeuroCropApi.getCurrentUser();
          const session = { email: response?.user?.email || "" };
          if (!session.email) throw new Error("Authenticated user email is missing.");
          window.sessionStorage.setItem(loginSessionKey, JSON.stringify(session));
          setLoginState(session);
          return;
        } catch (error) {
          window.sessionStorage.removeItem(loginSessionKey);
          setLoginState(null);
          elements.loginEmail.focus();
          return;
        }
      }

      const session = getLoginSession();
      setLoginState(session);
      if (!session) elements.loginEmail.focus();
    }

    function setHeaderAccountMenuOpen(isOpen) {
      isHeaderAccountMenuOpen = Boolean(isOpen);
      elements.headerAccountMenu.hidden = !isHeaderAccountMenuOpen;
      elements.headerAccountButton.setAttribute("aria-expanded", String(isHeaderAccountMenuOpen));
    }

    async function signOut() {
      try {
        if (window.NeuroCropApi?.isConnected()) await window.NeuroCropApi.logout();
      } catch (error) {
        console.warn("NeuroCrop API logout failed; clearing the local session.", error);
      } finally {
        window.sessionStorage.removeItem(loginSessionKey);
        setHeaderAccountMenuOpen(false);
        setLoginState(null);
        elements.loginPassword.value = "";
        elements.loginError.hidden = true;
        elements.loginEmail.focus();
      }
    }

    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = elements.loginEmail.value.trim();
      const password = elements.loginPassword.value;
      if (!elements.loginEmail.validity.valid || password.length < 4) {
        elements.loginError.textContent = "Enter a valid email address and a password of at least 4 characters.";
        elements.loginError.hidden = false;
        return;
      }

      let session = { email };
      if (window.NeuroCropApi?.isConnected()) {
        try {
          const response = await window.NeuroCropApi.login(email, password);
          session = { email: response?.user?.email || email };
        } catch (error) {
          elements.loginError.textContent = "We could not sign you in. Check your email and password, then try again.";
          elements.loginError.hidden = false;
          return;
        }
      }

      window.sessionStorage.setItem(loginSessionKey, JSON.stringify(session));
      elements.loginError.hidden = true;
      setLoginState(session);
      syncStickyOffsets();
    });

    let activeSiteId = "greenhouse-1";
    let activeZoneId = "tomato-a-back";
    let activeProfileKey = "tomato";
    let activeScenarioKey = "optimal";
    let activeViewScope = "zone";
    let activePrimaryPage = "overview";
    let activeSiteDetailView = "averages";
    let activeExperienceMode = "simple";
    let currentReadings = {};
    let manualOverride = false;
    let globalSystemCollapsed = true;
    let isHeaderBatteryDropdownOpen = false;
    let isHeaderAccountMenuOpen = false;
    let currentActionDeckCards = [];
    let currentTodayPriorityAction = null;
    let currentTodayPriorityActions = [];
    let currentAlertRecords = [];
    let actionDeckShortcutMap = new Map();
    let highlightedJumpTarget = null;
    let zoneImpactAction = null;
    let impactBoardAction = null;
    let currentImpactBoardCards = [];
    let currentDecisionBriefPayload = { shortText: "", detailedText: "", preview: "", chips: [] };
    let decisionBriefStatusTimeoutId = null;
    let sidebarActionOverride = null;
    let isCommandPaletteOpen = false;
    let commandPaletteItems = [];
    let filteredCommandPaletteItems = [];
    let activeCommandPaletteIndex = 0;
    let commandPaletteReturnFocus = null;
    let activeWorkbenchLensKey = "focus";
    let currentWorkbenchLenses = [];
    let dashboardRenderTimeoutId = null;
    let activeAlertRailFilterKey = "all";
    let activeSensorHealthFilterKey = "focus";
    let activeInspectionRouteFilterKey = "focus";
    let activeWorkspaceFocus = "all";
    let activeAlertsPageFilter = "active";
    let activeTrendMetricKey = "";
    let activeTrendMetricKeys = [];
    let activeTrendRangeKey = "24h";
    let expandedLiveMetricKey = "";
    let currentTrendMetricOptions = [];
    let currentTrendHistoryPoints = [];
    let trendHistoryChartInstance = null;
    let latestReadingsRequestId = 0;
    let latestReadingsBySectionId = {};
    let latestReadingsStatusBySectionId = {};
    let activeBlockFilterSiteId = "all";
    let activeNodeFilterSiteId = "all";
    let activeNodeFilterZoneId = "all";
    let activeSettingsProfileKey = activeProfileKey;
    let activeSettingsPanelKey = "profiles";
    let activeCropProfileView = "mine";
    let managementNotice = { page: "", tone: "optimal", text: "" };
    const dashboardRouteMap = {
      overview: { page: "overview", route: "/" },
      areas: { page: "locations", route: "/areas" },
      sites: { page: "locations", route: "/areas" },
      sections: { page: "blocks", route: "/sections" },
      zones: { page: "blocks", route: "/sections" },
      nodes: { page: "nodes", route: "/nodes" },
      readings: { page: "readings", route: "/readings" },
      history: { page: "history", route: "/history" },
      alerts: { page: "alerts", route: "/alerts" },
      settings: { page: "settings", route: "/settings" },
      "crop-profiles": { page: "settings", route: "/crop-profiles" }
    };
    const alertActionStorageKey = "neurocrop-dashboard-alert-actions-v1";
    let alertActionState = {};

    try {
      const savedAlertActions = JSON.parse(window.localStorage.getItem(alertActionStorageKey) || "{}");
      if (savedAlertActions && typeof savedAlertActions === "object" && !Array.isArray(savedAlertActions)) {
        alertActionState = savedAlertActions;
      }
    } catch (error) {
      // Alert actions are optional while the dashboard is running without a backend.
    }
    let locationFormState = { mode: "create", siteId: "", name: "" };
    let blockFormState = { mode: "create", siteId: activeSiteId, zoneId: "", name: "", profile: activeProfileKey, sensorCount: "4" };
    let nodeFormState = { siteId: activeSiteId, zoneId: activeZoneId, devEui: "" };
    let settingsProfileFormState = { name: "", heroName: "", stage: "", sourceProfile: activeProfileKey, mode: "template" };
    let managementModalState = null;
    const settingsStorageKey = "neurocrop-dashboard-settings-v1";
    const defaultSettingsState = {
      organization: { name: "NeuroCrop Farm", contactEmail: "admin@neurocrop.com" },
      alerts: { warningAfterMinutes: 15, criticalAfterMinutes: 45, recipients: "admin@neurocrop.com" },
      notifications: { emailEnabled: true, smsEnabled: false, quietStart: "22:00", quietEnd: "06:00", criticalOverride: true },
      preferences: { temperatureUnit: "C", timeFormat: "24h", timezone: "Europe/Vilnius", locale: "lt-LT" },
      integrations: { chirpStackUrl: "", chirpStackStatus: "Not connected", databaseStatus: "Not connected", lastSync: "Not connected" },
      retention: { rawDays: 90, aggregateMonths: 24 },
      team: [
        { id: "admin", name: "Admin", email: "admin@neurocrop.com", role: "Admin" },
        { id: "grower", name: "Grower", email: "grower@neurocrop.com", role: "Grower" }
      ]
    };
    let settingsState = loadSettingsState();
    const scenarioPresetButtons = [...document.querySelectorAll("[data-scenario-preset]")];
    const sidebarActionButtons = [...document.querySelectorAll("[data-sidebar-action]")];
    const dashboardActionButtons = [...document.querySelectorAll("[data-dashboard-action]")];
    const mobileCommandButtons = [...document.querySelectorAll("[data-mobile-command]")];
    const detailedExperienceTargets = new Set([
      "opsDockSection",
      "globalSystemCard",
      "scenarioLabPanel",
      "impactBoardPanel",
      "decisionBriefPanel",
      "metricsSection",
      "historySection",
      "sensorHealthSection",
      "zoneImpactSection"
    ]);
    const trendRangeConfig = {
      "24h": { label: "24h", intervalMinutes: 10, totalHours: 24, meta: "24h · 10 min steps" },
      "7d": { label: "7d", intervalMinutes: 60, totalHours: 24 * 7, meta: "7d · hourly" },
      "30d": { label: "30d", intervalMinutes: 240, totalHours: 24 * 30, meta: "30d · 4h steps" }
    };

    function resolveDashboardRoute(rawValue) {
      const normalizedValue = String(rawValue || "")
        .replace(/^#/, "")
        .replace(/^\/+/, "")
        .toLowerCase();
      return dashboardRouteMap[normalizedValue] || dashboardRouteMap.overview;
    }

    function syncTopLevelRoute(route, options = {}) {
      const normalizedRoute = route || "/";
      try {
        if (window.top && window.top !== window) {
          window.top.postMessage({
            type: "neurocrop:navigate",
            route: normalizedRoute,
            replace: Boolean(options.replace)
          }, window.location.origin);
          return;
        }

        if (window.location.pathname !== normalizedRoute) {
          const historyMethod = options.replace ? "replaceState" : "pushState";
          window.history[historyMethod]({}, "", normalizedRoute);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      } catch (error) {
        // Parent routing is optional when the dashboard is opened standalone.
      }
    }

    function applyDashboardRoute(rawRoute) {
      const nextRoute = resolveDashboardRoute(rawRoute);
      if (nextRoute.page === activePrimaryPage) return;

      activePrimaryPage = nextRoute.page;
      sidebarActionOverride = null;
      closeContextMenus();

      if (activePrimaryPage === "history" || activePrimaryPage === "readings") {
        activeWorkspaceFocus = "all";
        if (activePrimaryPage === "readings") activeWorkbenchLensKey = "all";
        setExperienceMode("detailed");
      }

      renderDashboard();

      const targetByPage = {
        overview: "heroStatusPanel",
        locations: "locationsManagementSection",
        blocks: "blocksManagementSection",
        nodes: "nodesManagementSection",
        readings: "metricsSection",
        history: "historySection",
        alerts: "alertsManagementSection",
        settings: "settingsManagementSection"
      };
      scrollToSection(targetByPage[activePrimaryPage] || "heroStatusPanel", {
        behavior: "auto",
        highlight: false
      });
    }

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "neurocrop:route") return;
      applyDashboardRoute(event.data.route);
    });

    function isDetailedExperience() {
      return activeExperienceMode === "detailed";
    }

    function setExperienceMode(nextMode, options = {}) {
      const { scroll = false, force = false, render = true } = options;
      const normalizedMode = nextMode === "detailed" ? "detailed" : "simple";
      if (normalizedMode === activeExperienceMode && !force) return;

      activeExperienceMode = normalizedMode;

      if (normalizedMode === "simple") {
        activeWorkspaceFocus = "all";
        sidebarActionOverride = null;
        globalSystemCollapsed = true;
        if (elements.advancedToolsPanel) {
          elements.advancedToolsPanel.open = false;
        }
      }

      if (render) renderDashboard();

      if (scroll) {
        const target = normalizedMode === "detailed"
          ? document.getElementById("metricsSection")
          : document.getElementById("heroStatusPanel");
        if (target) {
          requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
    }

    function ensureDetailedExperienceForTarget(targetId) {
      if (!targetId || !detailedExperienceTargets.has(targetId) || isDetailedExperience()) return;
      activeExperienceMode = "detailed";
      renderDashboard();
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function midpoint(range) {
      return (range[0] + range[1]) / 2;
    }

    function roundValue(value, decimals) {
      const factor = 10 ** decimals;
      return Math.round(value * factor) / factor;
    }

    function formatNumber(value, decimals) {
      return new Intl.NumberFormat("lt-LT", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
    }

    function formatUnit(unit) {
      if (unit === "degC") return "°C";
      return unit;
    }

    function formatValue(value, definition) {
      return `${formatNumber(value, definition.decimals)} ${formatUnit(definition.unit)}`;
    }

    function formatRange(range, definition) {
      return `${formatValue(range[0], definition)} - ${formatValue(range[1], definition)}`;
    }

    function formatSignedValue(value, definition) {
      const sign = value > 0 ? "+" : value < 0 ? "-" : "";
      return `${sign}${formatNumber(Math.abs(value), definition.decimals)} ${formatUnit(definition.unit)}`;
    }

    function getScenarioDefinition(scenarioKey = activeScenarioKey) {
      return scenarioConfig[scenarioKey] || scenarioConfig.optimal;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value);
    }

    function cloneDashboardValue(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function slugifyValue(value, fallback = "item") {
      const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      return normalized || fallback;
    }

    function createUniqueId(label, existingIds, fallbackPrefix) {
      const baseId = slugifyValue(label, fallbackPrefix);
      let nextId = baseId;
      let index = 2;

      while (existingIds.has(nextId)) {
        nextId = `${baseId}-${index}`;
        index += 1;
      }

      return nextId;
    }

    function getAllSiteIds(data = dashboardData) {
      return new Set((data.sites || []).map((site) => site.id));
    }

    function getAllZoneIds(data = dashboardData) {
      return new Set((data.sites || []).flatMap((site) => (site.zones || []).map((zone) => zone.id)));
    }

    function getNextNodeIdFromData(data) {
      if (window.NeuroCropStore?.getNextNodeId) {
        return window.NeuroCropStore.getNextNodeId(data);
      }

      const maxId = (data.sites || [])
        .flatMap((site) => site.zones || [])
        .flatMap((zone) => zone.batteryNodes || [])
        .reduce((highest, node) => {
          const match = String(node.id || "").match(/^NS-(\d{1,6})$/);
          return match ? Math.max(highest, Number(match[1])) : highest;
        }, 0);

      return `NS-${String(maxId + 1).padStart(6, "0")}`;
    }

    function getDefaultNodeBatteryLevel(index) {
      const defaults = [78, 72, 67, 61, 56, 51, 46, 41];
      return defaults[index % defaults.length];
    }

    function resizeZoneBatteryNodes(data, zone, desiredCount) {
      const nextCount = clamp(Math.round(Number(desiredCount) || 0), 0, 48);
      zone.batteryNodes = Array.isArray(zone.batteryNodes) ? zone.batteryNodes.slice(0, nextCount) : [];

      while (zone.batteryNodes.length < nextCount) {
        const nextId = getNextNodeIdFromData(data);
        zone.batteryNodes.push({
          id: nextId,
          name: nextId,
          level: getDefaultNodeBatteryLevel(zone.batteryNodes.length),
          active: true
        });
      }

      zone.sensorCount = zone.batteryNodes.length;
    }

    function persistDashboardData(nextData, options = {}) {
      const { preferredSiteId = "", preferredZoneId = "" } = options;
      dashboardData = window.NeuroCropStore?.saveDashboardData
        ? window.NeuroCropStore.saveDashboardData(nextData)
        : cloneDashboardValue(nextData);

      const preferredSite = preferredSiteId
        ? dashboardData.sites.find((site) => site.id === preferredSiteId)
        : null;
      const preferredZone = preferredSite && preferredZoneId
        ? (preferredSite.zones || []).find((zone) => zone.id === preferredZoneId)
        : null;

      if (preferredSite && preferredZone) {
        activeSiteId = preferredSite.id;
        activeZoneId = preferredZone.id;
      } else {
        const currentSite = dashboardData.sites.find((site) => site.id === activeSiteId) || null;
        const currentZone = currentSite
          ? (currentSite.zones || []).find((zone) => zone.id === activeZoneId) || null
          : null;

        if (!currentZone) {
          const fallbackSite = dashboardData.sites.find((site) => (site.zones || []).length > 0) || dashboardData.sites[0] || null;
          if (fallbackSite) {
            activeSiteId = fallbackSite.id;
            activeZoneId = (fallbackSite.zones || [])[0]?.id || activeZoneId;
          }
        }
      }

      renderSiteOptions();
      renderZoneOptions();
      if (getActiveSite() && getActiveZone()) {
        resetCurrentReadingsFromActiveZone();
      }
    }

    function setManagementNotice(page, text, tone = "optimal") {
      managementNotice = { page, text, tone };
    }

    function clearManagementNotice(page = "") {
      if (!page || managementNotice.page === page) {
        managementNotice = { page: "", tone: "optimal", text: "" };
      }
    }

    function getDefaultProfileKey() {
      return cropProfiles[activeProfileKey]
        ? activeProfileKey
        : Object.keys(cropProfiles)[0] || "tomato";
    }

    function resetLocationForm() {
      locationFormState = {
        mode: "create",
        siteId: "",
        name: ""
      };
    }

    function openLocationEditor(siteId) {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      if (!site) return;

      locationFormState = {
        mode: "edit",
        siteId: site.id,
        name: site.name
      };
      clearManagementNotice("locations");
      renderDashboard();
    }

    function resetBlockForm(options = {}) {
      const filteredLocationId = activeBlockFilterSiteId !== "all" && !isUnassignedLocation(
        dashboardData.sites.find((site) => site.id === activeBlockFilterSiteId)
      )
        ? activeBlockFilterSiteId
        : "";
      const preferredSiteId = options.siteId
        || filteredLocationId
        || activeSiteId
        || dashboardData.sites.find((site) => !isUnassignedLocation(site))?.id
        || "";

      blockFormState = {
        mode: "create",
        siteId: preferredSiteId,
        zoneId: "",
        name: "",
        profile: options.profile || getDefaultProfileKey(),
        sensorCount: String(options.sensorCount ?? 0)
      };
    }

    function resetNodeForm(options = {}) {
      const preferredSite = dashboardData.sites.find((site) => site.id === (options.siteId || activeSiteId))
        || dashboardData.sites.find((site) => (site.zones || []).length > 0)
        || null;
      const preferredZone = preferredSite?.zones?.find((zone) => zone.id === (options.zoneId || activeZoneId))
        || preferredSite?.zones?.[0]
        || null;

      nodeFormState = {
        siteId: preferredSite?.id || "",
        zoneId: preferredZone?.id || "",
        devEui: ""
      };
    }

    function openBlockEditor(siteId, zoneId) {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      const zone = (site?.zones || []).find((item) => item.id === zoneId);
      if (!site || !zone) return;

      activeBlockFilterSiteId = site.id;
      blockFormState = {
        mode: "edit",
        siteId: site.id,
        zoneId: zone.id,
        name: zone.name,
        profile: zone.profile,
        sensorCount: String((zone.batteryNodes || []).length || zone.sensorCount || 0)
      };
      clearManagementNotice("blocks");
      renderDashboard();
    }

    function closeManagementModal() {
      managementModalState = null;
      elements.managementModalOverlay.hidden = true;
      elements.managementModalOverlay.innerHTML = "";
    }

    function setManagementModalError(message) {
      const error = elements.managementModalOverlay.querySelector(".management-modal-error");
      if (!error) return;
      error.textContent = message;
      error.hidden = !message;
    }

    function syncLocationUnassignedChoice() {
      const checkbox = elements.managementModalOverlay.querySelector('[name="modalLocationLeaveUnassigned"]');
      const select = elements.managementModalOverlay.querySelector('[name="modalLocationMoveTarget"]');
      if (!checkbox || !select) return;

      select.disabled = checkbox.checked;
      select.closest("label")?.classList.toggle("opacity-45", checkbox.checked);
      syncEnhancedSelect(select);
    }

    function openLocationManagementModal(siteId) {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      if (!site) return;

      managementModalState = { type: "location", siteId };
      const otherSites = dashboardData.sites.filter((item) => item.id !== site.id && !isUnassignedLocation(item));
      const blockCount = (site.zones || []).length;
      const nodeCount = getSiteNodeCount(site);
      const profiles = getSiteProfileNames(site);
      const canDelete = true;

      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop" data-management-modal-close></div>
        <section class="management-modal-shell" role="dialog" aria-modal="true" aria-labelledby="locationManagementTitle">
          <header class="management-modal-header">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-pine/56">Area settings</p>
              <h2 id="locationManagementTitle" class="mt-1.5 font-display text-2xl font-bold text-ink">Manage ${escapeHtml(site.name)}</h2>
              <p class="mt-2 text-sm leading-6 text-ink/60">An Area is the larger operating space, such as one greenhouse, room, or tunnel.</p>
            </div>
            <button type="button" class="management-modal-close actionable" data-management-modal-close aria-label="Close area settings"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <div class="management-modal-body">
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-[18px] bg-[#f8f3ea] px-3.5 py-3"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Sections</div><div class="mt-1 text-xl font-extrabold text-ink">${blockCount}</div></div>
              <div class="rounded-[18px] bg-[#f8f3ea] px-3.5 py-3"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Nodes</div><div class="mt-1 text-xl font-extrabold text-ink">${nodeCount}</div></div>
              <div class="rounded-[18px] bg-[#f8f3ea] px-3.5 py-3"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Profiles</div><div class="mt-1 truncate text-sm font-extrabold text-ink">${escapeHtml(profiles.length ? profiles.join(", ") : "None yet")}</div></div>
            </div>

            <form class="mt-5" data-management-modal-form="location">
              <label class="block">
                <span class="text-sm font-semibold text-ink/72">Area name</span>
                <input name="modalLocationName" value="${escapeAttribute(site.name)}" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
              </label>
              <p class="management-modal-error mt-3 rounded-[16px] bg-[#f9e3df] px-3.5 py-2.5 text-sm font-semibold text-ember" role="alert" hidden></p>
              <div class="mt-4 flex flex-wrap gap-3">
                <button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save changes</button>
                <button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-modal-location-open-live="${escapeAttribute(site.id)}">Open live view</button>
                <button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-modal-location-blocks="${escapeAttribute(site.id)}">Manage sections</button>
              </div>
            </form>

            <div class="management-modal-danger">
              <h3 class="font-display text-base font-bold text-ink">Delete area</h3>
              ${canDelete
                ? `
                  <p class="mt-1 text-xs leading-5 text-ink/60">${blockCount > 0 ? `${blockCount} section${blockCount === 1 ? "" : "s"} need a new assignment.` : "No sections to move."}</p>
                  ${blockCount > 0 && otherSites.length > 0 ? `
                    <label class="mt-2 block">
                      <span class="text-xs font-semibold text-ink/72">Move sections to</span>
                      <select name="modalLocationMoveTarget" class="mt-1 w-full rounded-[15px] border border-black/10 bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                        ${otherSites.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
                      </select>
                    </label>` : ""}
                  ${blockCount > 0 ? `<label class="mt-2 flex items-center gap-2 text-xs text-ink/70"><input name="modalLocationLeaveUnassigned" type="checkbox" class="h-4 w-4 accent-[#21473b]"><span>Leave sections unassigned</span></label>` : ""}
                  <div class="mt-2 flex flex-wrap items-center gap-3"><label class="flex items-center gap-2 text-xs text-ink/70"><input name="modalLocationDeleteConfirm" type="checkbox" class="h-4 w-4 accent-[#21473b]"><span>Confirm deletion</span></label><button type="button" class="actionable rounded-xl border border-ember/20 bg-white px-3.5 py-2 text-sm font-semibold text-ember" data-modal-location-delete="${escapeAttribute(site.id)}">Delete</button></div>
                `
                : ""}
            </div>
          </div>
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      enhanceDashboardSelects(elements.managementModalOverlay);
      syncLocationUnassignedChoice();
    }

    function openBlockManagementModal(siteId, zoneId) {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      const zone = (site?.zones || []).find((item) => item.id === zoneId);
      if (!site || !zone) return;

      managementModalState = { type: "block", siteId, zoneId };
      const nodeCount = (zone.batteryNodes || []).length || zone.sensorCount || 0;
      const profileOptions = Object.entries(cropProfiles).map(([profileKey, profile]) => `<option value="${escapeAttribute(profileKey)}" ${zone.profile === profileKey ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("");

      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop" data-management-modal-close></div>
        <section class="management-modal-shell" role="dialog" aria-modal="true" aria-labelledby="blockManagementTitle">
          <header class="management-modal-header">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-pine/56">Section settings</p>
              <h2 id="blockManagementTitle" class="mt-1.5 font-display text-2xl font-bold text-ink">Manage ${escapeHtml(zone.name)}</h2>
              <p class="mt-2 text-sm leading-6 text-ink/60">A Section is the smaller monitored growing area inside an Area.</p>
            </div>
            <button type="button" class="management-modal-close actionable" data-management-modal-close aria-label="Close section settings"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <div class="management-modal-body">
            <form data-management-modal-form="block">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block sm:col-span-2"><span class="text-sm font-semibold text-ink/72">Section name</span><input name="modalBlockName" value="${escapeAttribute(zone.name)}" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"></label>
                <label class="block"><span class="text-sm font-semibold text-ink/72">Area</span><select name="modalBlockSiteId" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">${dashboardData.sites.map((item) => `<option value="${escapeAttribute(item.id)}" ${item.id === site.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
                <label class="block"><span class="text-sm font-semibold text-ink/72">Crop profile</span><select name="modalBlockProfile" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">${profileOptions}</select></label>
                <div class="rounded-[18px] bg-[#f8f3ea] px-4 py-3 sm:col-span-2"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Current setup</div><div class="mt-1 font-bold text-ink">${escapeHtml(site.name)}</div><div class="mt-1 text-sm text-ink/56">${nodeCount} registered node${nodeCount === 1 ? "" : "s"} · ${escapeHtml(cropProfiles[zone.profile]?.name || zone.profile)}</div></div>
              </div>
              <p class="management-modal-error mt-3 rounded-[16px] bg-[#f9e3df] px-3.5 py-2.5 text-sm font-semibold text-ember" role="alert" hidden></p>
              <div class="mt-5 flex flex-wrap gap-3"><button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save changes</button><button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-modal-block-open-live-site="${escapeAttribute(site.id)}" data-modal-block-open-live-zone="${escapeAttribute(zone.id)}">Open live view</button></div>
            </form>
            <div class="management-modal-danger">
              <h3 class="font-display text-base font-bold text-ink">Delete section</h3>
              <p class="mt-1 text-xs leading-5 text-ink/60">Removes this section and ${nodeCount} node${nodeCount === 1 ? "" : "s"}.</p>
              <div class="mt-2 flex flex-wrap items-center gap-3"><label class="flex items-center gap-2 text-xs text-ink/70"><input name="modalBlockDeleteConfirm" type="checkbox" class="h-4 w-4 accent-[#21473b]"><span>Confirm deletion</span></label><button type="button" class="actionable rounded-xl border border-ember/20 bg-white px-3.5 py-2 text-sm font-semibold text-ember" data-modal-block-delete-site="${escapeAttribute(site.id)}" data-modal-block-delete-zone="${escapeAttribute(zone.id)}">Delete</button></div>
            </div>
          </div>
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      enhanceDashboardSelects(elements.managementModalOverlay);
    }

    function saveLocationFromModal() {
      const siteId = managementModalState?.siteId;
      const input = elements.managementModalOverlay.querySelector('[name="modalLocationName"]');
      const nextName = String(input?.value || "").trim();
      if (!siteId || !nextName) return setManagementModalError("Location name is required before saving.");

      const nextData = cloneDashboardValue(dashboardData);
      const site = nextData.sites.find((item) => item.id === siteId);
      if (!site) return setManagementModalError("This location could not be found anymore.");
      site.name = nextName;
      persistDashboardData(nextData);
      closeManagementModal();
      setManagementNotice("locations", `${nextName} updated.`);
      renderDashboard();
    }

    function deleteLocationFromModal(siteId) {
      const confirmation = elements.managementModalOverlay.querySelector('[name="modalLocationDeleteConfirm"]');
      if (!confirmation?.checked) return setManagementModalError("Confirm that you want to delete this location.");

      const nextData = cloneDashboardValue(dashboardData);
      const sourceSite = nextData.sites.find((item) => item.id === siteId);
      const remainingSites = nextData.sites.filter((item) => item.id !== siteId);
      const otherSites = remainingSites.filter((item) => !isUnassignedLocation(item));
      if (!sourceSite) return setManagementModalError("This location could not be found anymore.");

      const movedBlocks = (sourceSite.zones || []).length;
      let destinationLabel = "";
      if (movedBlocks > 0) {
        const leaveUnassigned = elements.managementModalOverlay.querySelector('[name="modalLocationLeaveUnassigned"]')?.checked;
        const targetId = elements.managementModalOverlay.querySelector('[name="modalLocationMoveTarget"]')?.value;
        const targetSite = leaveUnassigned
          ? ensureUnassignedLocation(nextData)
          : otherSites.find((item) => item.id === targetId);
        if (!targetSite) return setManagementModalError("Choose another location or leave the blocks unassigned.");
        targetSite.zones = [...(targetSite.zones || []), ...(sourceSite.zones || [])];
        destinationLabel = isUnassignedLocation(targetSite) ? " left unassigned" : ` moved to ${targetSite.name}`;
      }

      nextData.sites = nextData.sites.filter((item) => item.id !== siteId);
      persistDashboardData(nextData);
      closeManagementModal();
      setManagementNotice("locations", `${sourceSite.name} deleted.${movedBlocks ? ` ${movedBlocks} block${movedBlocks === 1 ? " was" : "s were"}${destinationLabel}.` : ""}`);
      renderDashboard();
    }

    function saveBlockFromModal() {
      const { siteId, zoneId } = managementModalState || {};
      const form = elements.managementModalOverlay.querySelector('[data-management-modal-form="block"]');
      const formData = new FormData(form);
      const nextName = String(formData.get("modalBlockName") || "").trim();
      const targetSiteId = String(formData.get("modalBlockSiteId") || "");
      const nextProfile = String(formData.get("modalBlockProfile") || "");
      if (!nextName) return setManagementModalError("Block name is required before saving.");
      if (!cropProfiles[nextProfile]) return setManagementModalError("Choose a valid crop profile.");

      const nextData = cloneDashboardValue(dashboardData);
      const sourceSite = nextData.sites.find((item) => item.id === siteId);
      const targetSite = nextData.sites.find((item) => item.id === targetSiteId);
      const zone = (sourceSite?.zones || []).find((item) => item.id === zoneId);
      if (!sourceSite || !targetSite || !zone) return setManagementModalError("This block could not be found anymore.");

      zone.name = nextName;
      zone.profile = nextProfile;
      zone.availableMetrics = Object.keys(cropProfiles[nextProfile].metrics);
      if (sourceSite.id !== targetSite.id) {
        sourceSite.zones = (sourceSite.zones || []).filter((item) => item.id !== zone.id);
        targetSite.zones = [...(targetSite.zones || []), zone];
      }

      const wasActiveBlock = activeZoneId === zone.id;
      persistDashboardData(nextData, wasActiveBlock ? { preferredSiteId: targetSite.id, preferredZoneId: zone.id } : {});
      activeBlockFilterSiteId = targetSite.id;
      closeManagementModal();
      setManagementNotice("blocks", `${nextName} updated.`);
      renderDashboard();
    }

    function deleteBlockFromModal(siteId, zoneId) {
      const confirmation = elements.managementModalOverlay.querySelector('[name="modalBlockDeleteConfirm"]');
      if (!confirmation?.checked) return setManagementModalError("Confirm that you want to delete this block.");

      const nextData = cloneDashboardValue(dashboardData);
      const site = nextData.sites.find((item) => item.id === siteId);
      const zone = (site?.zones || []).find((item) => item.id === zoneId);
      if (!site || !zone) return setManagementModalError("This block could not be found anymore.");

      const nodeCount = (zone.batteryNodes || []).length || zone.sensorCount || 0;
      site.zones = (site.zones || []).filter((item) => item.id !== zoneId);
      persistDashboardData(nextData);
      activeBlockFilterSiteId = siteId;
      closeManagementModal();
      setManagementNotice("blocks", `${zone.name} deleted with ${nodeCount} node${nodeCount === 1 ? "" : "s"}.`);
      renderDashboard();
    }

    function openNodeManagementModal(siteId, zoneId, nodeId) {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      const zone = (site?.zones || []).find((item) => item.id === zoneId);
      const node = (zone?.batteryNodes || []).find((item) => item.id === nodeId);
      if (!site || !zone || !node) return;

      managementModalState = { type: "node", siteId, zoneId, nodeId };
      const assignmentOptions = dashboardData.sites
        .filter((item) => (item.zones || []).length > 0)
        .map((location) => `
          <optgroup label="${escapeAttribute(location.name)}">
            ${(location.zones || []).map((block) => {
              const assignmentId = `${location.id}|${block.id}`;
              const selected = location.id === site.id && block.id === zone.id;
              return `<option value="${escapeAttribute(assignmentId)}" ${selected ? "selected" : ""}>${escapeHtml(block.name)}</option>`;
            }).join("")}
          </optgroup>
        `).join("");
      const nodeName = node.name && node.name !== node.id ? node.name : "";

      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop" data-management-modal-close></div>
        <section class="management-modal-shell" role="dialog" aria-modal="true" aria-labelledby="nodeManagementTitle">
          <header class="management-modal-header">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-pine/56">Node settings</p>
              <h2 id="nodeManagementTitle" class="mt-1.5 font-display text-2xl font-bold text-ink">Manage ${escapeHtml(node.name || node.id)}</h2>
              <p class="mt-2 text-sm leading-6 text-ink/60">The Node ID stays stable. Use the assignment control to place the sensor in the correct monitored block.</p>
            </div>
            <button type="button" class="management-modal-close actionable" data-management-modal-close aria-label="Close node settings"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <div class="management-modal-body">
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-[18px] bg-[#f8f3ea] px-3.5 py-3"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Node ID</div><div class="mt-1 font-mono text-sm font-extrabold text-ink">${escapeHtml(node.id)}</div></div>
              <div class="rounded-[18px] bg-[#f8f3ea] px-3.5 py-3"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Battery</div><div class="mt-1 text-xl font-extrabold ${node.level < criticalBatteryThreshold ? "text-ember" : "text-ink"}">${escapeHtml(node.level)}%</div></div>
              <div class="rounded-[18px] bg-[#f8f3ea] px-3.5 py-3"><div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Status</div><div class="mt-1 text-sm font-extrabold ${node.active === false ? "text-amber" : "text-moss"}">${node.active === false ? "Inactive" : "Active"}</div></div>
            </div>

            <form class="mt-5" data-management-modal-form="node">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block"><span class="text-sm font-semibold text-ink/72">Node display name</span><input name="modalNodeName" value="${escapeAttribute(nodeName)}" placeholder="Climate sensor, north side" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"></label>
                <label class="block"><span class="text-sm font-semibold text-ink/72">DevEUI</span><input name="modalNodeDevEui" value="${escapeAttribute(node.devEui || "")}" placeholder="70B3D57ED006ABCD" maxlength="16" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 font-mono text-sm uppercase text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"></label>
                <label class="block sm:col-span-2"><span class="text-sm font-semibold text-ink/72">Assigned section</span><select name="modalNodeAssignment" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">${assignmentOptions}</select><span class="mt-1.5 block text-xs leading-5 text-ink/50">Moving a node keeps its Node ID and DevEUI, but its future readings will belong to the selected section.</span></label>
              </div>
              <p class="management-modal-error mt-3 rounded-[16px] bg-[#f9e3df] px-3.5 py-2.5 text-sm font-semibold text-ember" role="alert" hidden></p>
              <div class="mt-5 flex flex-wrap gap-3"><button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save node</button><button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-modal-node-open-live-site="${escapeAttribute(site.id)}" data-modal-node-open-live-zone="${escapeAttribute(zone.id)}">Open current block</button></div>
            </form>
            <div class="management-modal-danger">
              <h3 class="font-display text-base font-bold text-ink">Remove node</h3>
              <p class="mt-1 text-xs leading-5 text-ink/60">Removes it from this workspace.</p>
              <div class="mt-2 flex flex-wrap items-center gap-3"><label class="flex items-center gap-2 text-xs text-ink/70"><input name="modalNodeDeleteConfirm" type="checkbox" class="h-4 w-4 accent-[#21473b]"><span>Confirm removal</span></label><button type="button" class="actionable rounded-xl border border-ember/20 bg-white px-3.5 py-2 text-sm font-semibold text-ember" data-modal-node-delete="${escapeAttribute(node.id)}">Remove</button></div>
            </div>
          </div>
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      enhanceDashboardSelects(elements.managementModalOverlay);
    }

    function saveNodeFromModal() {
      const { nodeId } = managementModalState || {};
      const form = elements.managementModalOverlay.querySelector('[data-management-modal-form="node"]');
      const formData = new FormData(form);
      const assignment = String(formData.get("modalNodeAssignment") || "");
      const [targetSiteId, targetZoneId] = assignment.split("|");
      const nodeName = String(formData.get("modalNodeName") || "").trim();
      const devEui = String(formData.get("modalNodeDevEui") || "").trim().toUpperCase();
      if (!nodeId || !targetSiteId || !targetZoneId) return setManagementModalError("Choose the block that should own this node.");
      if (devEui && !/^[0-9A-F]{16}$/.test(devEui)) return setManagementModalError("DevEUI must be 16 hexadecimal characters.");
      if (!window.NeuroCropStore?.updateNode) return setManagementModalError("Node editing is not available in this browser context.");

      try {
        const currentRecord = window.NeuroCropStore.getNodeRecord(nodeId);
        const nextData = window.NeuroCropStore.updateNode({
          currentNodeId: nodeId,
          nextNodeId: nodeId,
          siteId: targetSiteId,
          zoneId: targetZoneId,
          nodeName,
          batteryLevel: currentRecord?.node?.level ?? 0,
          devEui
        });
        dashboardData = nextData;
        activeSiteId = targetSiteId;
        activeZoneId = targetZoneId;
        resetCurrentReadingsFromActiveZone();
        resetNodeForm({ siteId: targetSiteId, zoneId: targetZoneId });
        const targetSite = dashboardData.sites.find((item) => item.id === targetSiteId);
        const targetZone = (targetSite?.zones || []).find((item) => item.id === targetZoneId);
        closeManagementModal();
        setManagementNotice("nodes", `${nodeName || nodeId} saved${targetZone ? ` and assigned to ${targetZone.name}` : ""}.`);
        renderDashboard();
      } catch (error) {
        setManagementModalError(error instanceof Error ? error.message : "The node could not be saved.");
      }
    }

    function deleteNodeFromModal(nodeId) {
      const confirmation = elements.managementModalOverlay.querySelector('[name="modalNodeDeleteConfirm"]');
      if (!confirmation?.checked) return setManagementModalError("Confirm that you want to remove this node.");
      if (!window.NeuroCropStore?.deleteNode) return setManagementModalError("Node deletion is not available in this browser context.");

      try {
        window.NeuroCropStore.deleteNode(nodeId);
        dashboardData = window.NeuroCropStore.getDashboardData();
        resetNodeForm();
        closeManagementModal();
        setManagementNotice("nodes", `${nodeId} removed from the workspace.`);
        renderDashboard();
      } catch (error) {
        setManagementModalError(error instanceof Error ? error.message : "The node could not be removed.");
      }
    }

    function getSiteNodeCount(site) {
      return (site.zones || []).reduce(
        (sum, zone) => sum + ((zone.batteryNodes || []).length || Number(zone.sensorCount) || 0),
        0
      );
    }

    function getSiteProfileNames(site) {
      return [...new Set((site.zones || []).map((zone) => cropProfiles[zone.profile]?.name || zone.profile))];
    }

    function isGrowthMetricKey(key) {
      return key !== "batteryLevel";
    }

    function getBatteryAlertThreshold(definition) {
      return definition.alertThreshold ?? definition.warning?.[0] ?? 35;
    }

    function getBatteryNodeState(level, definition) {
      const threshold = getBatteryAlertThreshold(definition);
      if (level < criticalBatteryThreshold) return "critical";
      if (level < threshold) return "warning";
      return "optimal";
    }

    function getBatteryNodeNote(level, definition) {
      const threshold = getBatteryAlertThreshold(definition);
      if (level < criticalBatteryThreshold) {
        return `Below the ${criticalBatteryThreshold}% critical floor. Replace this node before trusting long-term trends.`;
      }
      if (level < threshold) {
        return `Below the ${threshold}% watch threshold. Add this node to the next replacement round.`;
      }
      return `Above the ${threshold}% watch threshold. This node still has comfortable runway.`;
    }

    const nodeFreshnessStateCache = new Map();
    const scopeFarmStateCache = new Map();
    let latestRenderedFarmState = null;

    function getDemoFreshnessOffsetSec(node) {
      if (node?.active === false) return 7200;
      const nodeNumber = Number(String(node?.id || "").match(/(\d+)$/)?.[1] || 0);
      if (nodeNumber === 16) return 7200;
      if (nodeNumber === 12 || nodeNumber === 22) return 2400;
      if (nodeNumber === 3 || nodeNumber === 6) return 1200;
      return 240;
    }

    function getNodeFreshnessInput(node, zone, now = Date.now()) {
      const expectedUplinkIntervalSec = Math.max(30, Number(node?.expectedUplinkIntervalSec) || 600);
      const fallbackReceivedAt = new Date(now - getDemoFreshnessOffsetSec(node) * 1000).toISOString();
      const lastReceivedAt = node?.lastReceivedAt || fallbackReceivedAt;
      const observations = node?.observations && typeof node.observations === "object"
        ? node.observations
        : Object.fromEntries((zone?.availableMetrics || []).map((metricId) => [
            metricId,
            {
              lastObservedAt: lastReceivedAt,
              expectedIntervalSec: metricId === "batteryLevel" ? 21600 : 600
            }
          ]));

      return {
        ...node,
        lastReceivedAt,
        expectedUplinkIntervalSec,
        observations
      };
    }

    function getNodeFreshness(node, zone, now = Date.now()) {
      const engine = window.NeuroCropStateEngine;
      if (!engine?.computeNodeFreshness) {
        return {
          nodeId: node?.id || "",
          transportStatus: node?.active === false ? "offline" : "live",
          status: node?.active === false ? "offline" : "live",
          ageSec: null,
          observations: {},
          reasons: []
        };
      }

      const input = getNodeFreshnessInput(node, zone, now);
      const sourceVersion = node?.lastReceivedAt
        ? `${node.lastReceivedAt}:${Object.values(node.observations || {}).map((observation) => observation.lastObservedAt || "").join("|")}`
        : `demo:${getDemoFreshnessOffsetSec(node)}`;
      const cached = nodeFreshnessStateCache.get(node.id);
      if (cached?.sourceVersion === sourceVersion) return cached.result;

      const result = engine.computeNodeFreshness(
        input,
        now,
        cached?.result,
        { graceSec: 15, recoverySamples: 2 }
      );
      nodeFreshnessStateCache.set(node.id, { sourceVersion, result });
      return result;
    }

    function getFreshnessLabel(status) {
      return {
        live: diagnosticText("Live", "Tiesiogiai"),
        delayed: diagnosticText("Delayed", "Vėluoja"),
        stale: diagnosticText("Stale", "Pasenę"),
        offline: diagnosticText("Offline", "Neprisijungęs")
      }[status] || diagnosticText("Unknown", "Nežinoma");
    }

    function formatFreshnessAge(ageSec) {
      if (!Number.isFinite(ageSec)) return diagnosticText("time unknown", "laikas nežinomas");
      if (ageSec < 60) return diagnosticText(`${Math.max(1, Math.round(ageSec))} sec ago`, `prieš ${Math.max(1, Math.round(ageSec))} sek.`);
      const minutes = Math.round(ageSec / 60);
      if (minutes < 60) return diagnosticText(`${minutes} min ago`, `prieš ${minutes} min.`);
      const hours = Math.round(minutes / 60);
      return diagnosticText(`${hours} h ago`, `prieš ${hours} val.`);
    }

    function getZoneMetricFreshness(zone, metricKey, now = Date.now()) {
      const nodeStates = (zone?.batteryNodes || []).map((node) => getNodeFreshness(node, zone, now));
      const observations = nodeStates
        .map((state) => state.observations?.[metricKey])
        .filter(Boolean);
      if (observations.some((observation) => observation.status === "live")) return "live";
      if (observations.some((observation) => observation.status === "delayed")) return "delayed";
      if (observations.some((observation) => observation.status === "stale")) return "stale";
      return nodeStates.some((state) => state.transportStatus !== "offline") ? "stale" : "offline";
    }

    function getDemoObservationState(zone, metricKey) {
      if (zone?.id === "tomato-a-back" && metricKey === "co2") {
        return { state: "not_due", ageMinutes: 18, nextDueMinutes: 12 };
      }
      if (zone?.id === "tomato-a-front" && metricKey === "soilTemp") {
        return { state: "failed", ageMinutes: 22 };
      }
      if (zone?.id === "strawberry-west" && metricKey === "soilTemp") {
        return { state: "missing", ageMinutes: null };
      }
      return null;
    }

    function getObservationPresentation(zone, metricKey, result, freshnessStatus = "live") {
      if (result?.available === false) {
        return {
          state: "not-installed",
          label: diagnosticText("Not installed", "Neįdiegta"),
          detail: diagnosticText("No sensor is configured", "Sensorius nesukonfigūruotas"),
          hasCurrentValue: false
        };
      }

      const source = zone?.observationStates?.[metricKey] || getDemoObservationState(zone, metricKey);
      const state = source?.state
        || (freshnessStatus === "offline"
          ? "offline"
          : freshnessStatus === "stale"
            ? "cached"
            : freshnessStatus === "delayed"
              ? "delayed"
              : "fresh");
      const ageMinutes = Number.isFinite(source?.ageMinutes) ? source.ageMinutes : null;
      const nextDueMinutes = Number.isFinite(source?.nextDueMinutes) ? source.nextDueMinutes : null;

      const presentations = {
        fresh: {
          label: diagnosticText("Live", "Tiesiogiai"),
          detail: diagnosticText("New measurement", "Naujas matavimas"),
          hasCurrentValue: true
        },
        not_due: {
          label: diagnosticText("On schedule", "Pagal grafiką"),
          detail: ageMinutes !== null && nextDueMinutes !== null
            ? diagnosticText(
                `Measured ${ageMinutes} min ago · next in ${nextDueMinutes} min`,
                `Matuota prieš ${ageMinutes} min. · kitas po ${nextDueMinutes} min.`
              )
            : diagnosticText("Waiting for the scheduled measurement", "Laukiama suplanuoto matavimo"),
          hasCurrentValue: true
        },
        cached: {
          label: diagnosticText("Last known", "Paskutinė žinoma"),
          detail: ageMinutes !== null
            ? diagnosticText(`Last measured ${ageMinutes} min ago`, `Paskutinį kartą matuota prieš ${ageMinutes} min.`)
            : diagnosticText("Waiting for a fresh measurement", "Laukiama naujo matavimo"),
          hasCurrentValue: true
        },
        failed: {
          label: diagnosticText("Reading failed", "Matavimas nepavyko"),
          detail: diagnosticText("Showing the last known value", "Rodoma paskutinė žinoma reikšmė"),
          hasCurrentValue: true
        },
        missing: {
          label: diagnosticText("Disconnected", "Atsijungęs"),
          detail: diagnosticText("Expected sensor was not detected", "Numatytas sensorius neaptiktas"),
          hasCurrentValue: false
        },
        delayed: {
          label: diagnosticText("Delayed", "Vėluoja"),
          detail: diagnosticText("A new measurement is later than expected", "Naujas matavimas vėluoja"),
          hasCurrentValue: true
        },
        offline: {
          label: diagnosticText("Node offline", "Mazgas nepasiekiamas"),
          detail: diagnosticText("Current reading unavailable", "Dabartinis rodmuo nepasiekiamas"),
          hasCurrentValue: false
        }
      };

      return { state, ...(presentations[state] || presentations.cached) };
    }

    function getMetricSensorSource(metricKey) {
      const sources = {
        airTemp: "SHT45 · air",
        humidity: "SHT45 · air",
        vpd: "Derived · SHT45",
        co2: "I²C · SCD41",
        lux: "I²C · light",
        soilTemp: "DS18B20 · substrate",
        waterTemp: "DS18B20 · water",
        soilMoisture: "I²C · substrate",
        airPressure: "I²C · air",
        batteryLevel: "Node battery"
      };
      return sources[metricKey] || "External sensor";
    }

    function getMetricInstalledNodeCount(metricKey, nodeCount) {
      if (["airTemp", "humidity", "vpd", "batteryLevel"].includes(metricKey)) return nodeCount;
      if (metricKey === "co2") return Math.max(1, Math.ceil(nodeCount * 0.6));
      if (metricKey === "soilTemp") return Math.max(1, nodeCount - 1);
      if (metricKey === "lux" || metricKey === "soilMoisture") return Math.max(1, Math.ceil(nodeCount * 0.4));
      return Math.min(nodeCount, 1);
    }

    function getNodePositionLabel(index, count) {
      const labels = count >= 5
        ? ["Front left", "Front right", "Centre", "Rear left", "Rear right"]
        : count === 4
          ? ["Front left", "Front right", "Rear left", "Rear right"]
          : count === 3
            ? ["Front", "Centre", "Rear"]
            : count === 2
              ? ["Front", "Rear"]
              : ["Section centre"];
      return labels[index] || `Point ${index + 1}`;
    }

    function median(values) {
      if (!values.length) return null;
      const sorted = [...values].sort((left, right) => left - right);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function getNodeMetricSummary(zone, metricKey, definition, result) {
      const nodes = zone?.batteryNodes || [];
      const installedCount = Math.min(
        nodes.length,
        getMetricInstalledNodeCount(metricKey, nodes.length)
      );
      const installedNodes = nodes.slice(0, installedCount);
      const optimalSpan = Math.abs((definition.optimal?.[1] || 1) - (definition.optimal?.[0] || 0));
      const baseStep = Math.max(
        optimalSpan * 0.055,
        definition.decimals === 0 ? 1 : 1 / (10 ** definition.decimals)
      );
      const centre = (installedNodes.length - 1) / 2;
      const readings = installedNodes.map((node, index) => {
        const freshness = getNodeFreshness(node, zone);
        const freshnessStatus = freshness.observations?.[metricKey]?.status || freshness.transportStatus;
        const observation = getObservationPresentation(zone, metricKey, result, freshnessStatus);
        let value = Number(result.value) + (index - centre) * baseStep;

        // Demonstrates why a normal Section median must not hide a local hot spot.
        if (zone.id === "tomato-a-back" && metricKey === "airTemp" && index === installedNodes.length - 1) {
          value = 29.2;
        }

        value = roundValue(value, definition.decimals);
        const metricResult = evaluateMetric(definition, value);
        return {
          node,
          position: getNodePositionLabel(index, installedNodes.length),
          source: getMetricSensorSource(metricKey),
          value,
          metricResult,
          observation
        };
      });
      const reportingReadings = readings.filter((reading) => reading.observation.hasCurrentValue);
      const values = reportingReadings.map((reading) => reading.value);
      const medianValue = median(values);
      const medianResult = medianValue === null
        ? { value: null, state: "unavailable", severity: 0 }
        : evaluateMetric(definition, roundValue(medianValue, definition.decimals));
      const outsideReadings = reportingReadings.filter((reading) => reading.metricResult.state !== "optimal");
      const localOutliers = medianResult.state === "optimal" ? outsideReadings : [];

      return {
        installedCount,
        reportingCount: reportingReadings.length,
        readings,
        medianValue: medianResult.value,
        medianResult,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        outsideCount: outsideReadings.length,
        localOutliers
      };
    }

    function getConditionStatusFromResults(results) {
      const available = (results || []).filter((result) => result.available !== false && isGrowthMetricKey(result.key));
      if (available.length === 0) return "unknown";
      if (available.some((result) => result.state === "critical")) return "critical";
      if (available.some((result) => result.state === "warning")) return "warning";
      return "optimal";
    }

    function getZoneFarmState(site, zone, results, now = Date.now()) {
      const engine = window.NeuroCropStateEngine;
      const growthResults = (results || []).filter((result) => isGrowthMetricKey(result.key));
      const availableResults = growthResults.filter((result) => result.available !== false);
      const conditionStatus = getConditionStatusFromResults(results);
      const nodeInputs = (zone?.batteryNodes || []).map((node) => ({
        ...getNodeFreshnessInput(node, zone, now),
        freshness: getNodeFreshness(node, zone, now)
      }));
      const fallback = {
        scope: { type: "section", id: zone?.id || "", name: zone?.name || "" },
        conditionStatus,
        dataStatus: nodeInputs.length ? "live" : "offline",
        coverage: {
          liveMetrics: availableResults.length,
          expectedMetrics: growthResults.length,
          reportingNodes: nodeInputs.length,
          registeredNodes: nodeInputs.length
        },
        nodeSummary: { live: nodeInputs.length, delayed: 0, stale: 0, offline: 0 },
        lastKnownCondition: conditionStatus === "unknown" ? null : {
          status: conditionStatus,
          asOf: new Date(now).toISOString(),
          reasons: []
        },
        reasons: []
      };
      if (!engine?.deriveFarmState) return fallback;

      const previousState = scopeFarmStateCache.get(zone.id);
      const state = engine.deriveFarmState({
        scope: { type: "section", id: zone.id, name: zone.name },
        nodes: nodeInputs,
        condition: {
          status: conditionStatus,
          reasons: availableResults
            .filter((result) => result.state !== "optimal")
            .map((result) => ({ code: `CONDITION_${result.state.toUpperCase()}`, metricId: result.key, value: result.value }))
        },
        conditionAsOf: now,
        previousState,
        coverage: {
          liveMetrics: availableResults.filter((result) => getZoneMetricFreshness(zone, result.key, now) === "live").length,
          expectedMetrics: growthResults.length
        },
        stateTtlSec: 120
      }, now);
      scopeFarmStateCache.set(zone.id, state);
      return state;
    }

    function updateClientConnectionStatus() {
      if (!elements.headerConnectionStatus || !elements.headerConnectionLabel) return;
      const engine = window.NeuroCropStateEngine;
      const apiConnected = Boolean(window.NeuroCropApi?.isConnected?.());
      const lease = engine?.getClientLeaseStatus && latestRenderedFarmState
        ? engine.getClientLeaseStatus(latestRenderedFarmState, Date.now())
        : { connected: true, computedAt: null };
      const connected = navigator.onLine && (!apiConnected || lease.connected);
      elements.headerConnectionStatus.dataset.connection = connected ? "online" : "lost";
      elements.headerConnectionLabel.textContent = connected
        ? "Online"
        : diagnosticText("Connection lost", "Ryšys nutrūko");
      elements.headerConnectionStatus.title = connected
        ? diagnosticText("Dashboard connection is active.", "Sistemos ryšys aktyvus.")
        : lease.computedAt
          ? diagnosticText(
              `Showing state computed at ${new Date(lease.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
              `Rodoma būsena, apskaičiuota ${new Date(lease.computedAt).toLocaleTimeString("lt-LT", { hour: "2-digit", minute: "2-digit" })}.`
            )
          : diagnosticText("The browser is offline.", "Naršyklė neprisijungusi.");
    }

    function getLowBatteryNodes(zone, definition) {
      const threshold = getBatteryAlertThreshold(definition);
      return (zone?.batteryNodes || [])
        .filter((node) => node.level < threshold)
        .sort((left, right) => left.level - right.level);
    }

    function getZoneBatteryReading(zone, definition) {
      const nodes = zone?.batteryNodes || [];
      if (nodes.length === 0) return null;
      return roundValue(Math.min(...nodes.map((node) => node.level)), definition.decimals);
    }

    function getZoneReadings(profile, zone, scenarioKey) {
      const readings = generateReadings(profile, scenarioKey);
      const scenarioOverrides = zoneReadingOverrides[zone?.id]?.[scenarioKey];
      if (scenarioOverrides) {
        Object.assign(readings, scenarioOverrides);
      }
      if (profile.metrics.batteryLevel) {
        const batteryReading = getZoneBatteryReading(zone, profile.metrics.batteryLevel);
        if (batteryReading !== null) readings.batteryLevel = batteryReading;
      }
      return readings;
    }

    function isApiDataMode() {
      return Boolean(window.NeuroCropApi?.isConnected?.());
    }

    function normalizeApiDashboardData(data) {
      const nextData = cloneDashboardValue(data || {});
      nextData.sites = Array.isArray(nextData.sites) ? nextData.sites : [];
      nextData.sites = nextData.sites.map((site) => ({
        ...site,
        zones: (Array.isArray(site.zones) ? site.zones : []).map((zone) => {
          const batteryNodes = (Array.isArray(zone.batteryNodes) ? zone.batteryNodes : []).map((node) => {
            const id = String(node.id || node.name || node.devEui || "").trim();
            return {
              ...node,
              id,
              name: String(node.name || id || node.devEui || "").trim(),
              devEui: String(node.devEui || "").trim(),
              level: Math.max(0, Math.min(Number(node.level ?? node.batteryPercent ?? 0) || 0, 100)),
              active: node.active !== false
            };
          });
          const availableMetrics = Array.isArray(zone.availableMetrics) ? zone.availableMetrics.slice() : [];
          if (batteryNodes.length > 0 && !availableMetrics.includes("batteryLevel")) {
            availableMetrics.push("batteryLevel");
          }
          return {
            ...zone,
            profile: cropProfiles[zone.profile] ? zone.profile : activeProfileKey,
            batteryNodes,
            sensorCount: Number(zone.sensorCount) || batteryNodes.length,
            availableMetrics
          };
        })
      }));
      return nextData;
    }

    function readingsFromApiObservations(response) {
      const observations = response?.observations && typeof response.observations === "object"
        ? response.observations
        : {};
      return Object.fromEntries(Object.entries(observations)
        .filter(([, observation]) => observation && Number.isFinite(Number(observation.value)))
        .map(([metricKey, observation]) => [metricKey, Number(observation.value)]));
    }

    function getUnavailableMetricEvaluation(definition, reason = "No live data") {
      return {
        value: null,
        state: "unavailable",
        severity: 0,
        scalePosition: 0,
        deviationText: reason,
        narrative: definition?.label ? `${definition.label} is not available from the API.` : reason
      };
    }

    function evaluateMetricForReadings(definition, metricKey, availableMetrics, readings) {
      const isConfigured = availableMetrics.has(metricKey);
      const rawValue = readings?.[metricKey];
      if (!isConfigured) return getUnavailableMetricEvaluation(definition, "Sensor not installed.");
      if (!Number.isFinite(Number(rawValue))) return getUnavailableMetricEvaluation(definition, "No live data");
      return evaluateMetric(definition, Number(rawValue));
    }

    async function fetchLatestReadingsForZone(zoneId, options = {}) {
      if (!isApiDataMode() || !zoneId) return;
      const requestId = ++latestReadingsRequestId;
      latestReadingsStatusBySectionId[zoneId] = { status: "loading", error: "" };

      try {
        const response = await window.NeuroCropApi.getLatestReadings(zoneId);
        if (requestId !== latestReadingsRequestId && options.onlyActive !== false) return;
        latestReadingsBySectionId[zoneId] = response;
        latestReadingsStatusBySectionId[zoneId] = { status: "ready", error: "" };
        if (zoneId === getActiveZone()?.id) {
          currentReadings = readingsFromApiObservations(response);
          manualOverride = false;
          renderDashboard();
        }
      } catch (error) {
        latestReadingsStatusBySectionId[zoneId] = {
          status: "error",
          error: error instanceof Error ? error.message : "Latest readings could not be loaded."
        };
        if (zoneId === getActiveZone()?.id) {
          currentReadings = {};
          manualOverride = false;
          renderDashboard();
        }
      }
    }

    function getSystemLowBatteryNodes() {
      return dashboardData.sites.flatMap((site) =>
        site.zones.flatMap((zone) => {
          const profile = cropProfiles[zone.profile];
          const definition = profile?.metrics?.batteryLevel;
          if (!definition) return [];
          const threshold = getBatteryAlertThreshold(definition);

          return getLowBatteryNodes(zone, definition).map((node) => ({
            ...node,
            threshold,
            siteName: site.name,
            zoneName: zone.name
          }));
        })
      ).sort((left, right) => left.level - right.level);
    }

    function renderSensorHealthList(zone, definition) {
      const lowNodes = getLowBatteryNodes(zone, definition);
      if (lowNodes.length === 0) {
        return `<div class="battery-node-empty">No slave nodes are below ${getBatteryAlertThreshold(definition)}% in this block.</div>`;
      }

      return lowNodes
        .map((node) => `<span class="battery-node-chip"><strong>${escapeHtml(node.id)}</strong> ${escapeHtml(node.level)}%</span>`)
        .join("");
    }

    function getZoneBatteryNodeDetails(zone, definition, site = null) {
      if (!(zone?.availableMetrics || []).includes("batteryLevel")) {
        return [];
      }

      return (zone?.batteryNodes || [])
        .map((node) => ({
          ...node,
          siteId: site?.id || "",
          siteName: site?.name || "",
          zoneId: zone?.id || "",
          zoneName: zone?.name || "",
          state: getBatteryNodeState(node.level, definition)
        }))
        .sort((left, right) => left.level - right.level);
    }

    function getSiteBatteryNodeDetails(site, definition) {
      return site.zones.flatMap((zone) => getZoneBatteryNodeDetails(zone, definition, site))
        .sort((left, right) => left.level - right.level);
    }

    function stepFromDecimals(decimals) {
      return decimals === 0 ? 1 : 1 / (10 ** decimals);
    }

    function joinLabels(labels) {
      if (labels.length === 0) return "";
      if (labels.length === 1) return labels[0];
      if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
      return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    }

    function getManualOverrideDiffs(profile, zone) {
      if (!manualOverride || !profile || !zone) return [];

      const baselineReadings = getZoneReadings(profile, zone, activeScenarioKey);
      const availableMetrics = new Set(zone.availableMetrics || []);

      return Object.entries(profile.metrics)
        .filter(([key]) => availableMetrics.has(key))
        .map(([key, definition]) => {
          const baselineValue = baselineReadings[key];
          const currentValue = currentReadings[key];
          const delta = roundValue((currentValue ?? baselineValue) - baselineValue, definition.decimals);

          return {
            key,
            definition,
            baselineValue,
            currentValue,
            delta,
            absoluteDelta: Math.abs(delta)
          };
        })
        .filter((item) => item.absoluteDelta > 0)
        .sort((left, right) => {
          if (left.absoluteDelta !== right.absoluteDelta) return right.absoluteDelta - left.absoluteDelta;
          return left.definition.label.localeCompare(right.definition.label);
        });
    }

    function deriveStateFromIndexScore(indexScore) {
      if (indexScore <= 32) return "critical";
      if (indexScore <= 66) return "warning";
      return "optimal";
    }

    function getTopIndicatorDrivers(profile, nonOptimalResults) {
      return [...nonOptimalResults]
        .sort((left, right) => right.severity - left.severity)
        .slice(0, 2)
        .map((item) => profile.metrics[item.key].label);
    }

    function buildGrowthIndicatorSummary(topDriverLabels, unavailableCount) {
      let summary = topDriverLabels.length === 0
        ? "All core metrics are inside the target range."
        : `${joinLabels(topDriverLabels)} ${topDriverLabels.length === 1 ? "is" : "are"} pulling the score down.`;

      if (unavailableCount > 0) {
        summary += ` ${unavailableCount} metrics excluded.`;
      }

      return summary;
    }

    function renderIndicatorDrivers(topDriverLabels) {
      return topDriverLabels.map((label) => `
        <span class="indicator-driver-chip">${escapeHtml(label)}</span>
      `).join("");
    }

    function buildHeroSensorGlanceState(options) {
      const {
        isSiteView,
        isSiteHotspotsView = false,
        site,
        zone,
        profile,
        growthResults,
        siteAverageSummaries
      } = options;

      if (isSiteView) {
        const items = siteAverageSummaries
          .slice(0, 3)
          .map((summary) => {
            const statusNote = summary.criticalCount > 0
              ? `${summary.criticalCount} critical block${summary.criticalCount === 1 ? "" : "s"}`
              : summary.warningCount > 0
                ? `${summary.warningCount} warning block${summary.warningCount === 1 ? "" : "s"}`
                : `Stable across ${summary.coverage}/${summary.totalZones} blocks`;

            return {
              label: summary.definition.label,
              value: formatValue(summary.averageValue, summary.definition),
              state: summary.state,
              meta: `Target ${formatRange(summary.averageOptimal, summary.definition)}`,
              note: `Location avg · ${statusNote}`
            };
          });

        return {
          title: isSiteHotspotsView ? "Sensor baseline behind hotspots" : "Live sensor snapshot",
          summary: isSiteHotspotsView
            ? `Hotspots rank blocks, but these three location-level sensor averages explain what is shaping ${site.name} overall.`
            : `These three location-level sensor averages explain what is shaping ${site.name} right now.`,
          items
        };
      }

      const statePriority = { critical: 3, warning: 2, optimal: 1 };
      const items = growthResults
        .filter((item) => item.available !== false)
        .sort((left, right) => {
          const stateDelta = (statePriority[right.state] || 0) - (statePriority[left.state] || 0);
          if (stateDelta !== 0) return stateDelta;
          return right.severity - left.severity;
        })
        .slice(0, 3)
        .map((result) => {
          const definition = profile.metrics[result.key];

          return {
            label: definition.label,
            value: formatValue(result.value, definition),
            state: result.state,
            meta: `Target ${formatRange(definition.optimal, definition)}`,
            note: result.state === "optimal" ? "Inside target band" : result.deviationText
          };
        });

      return {
        title: "Live sensor snapshot",
        summary: `These three live parameters are the fastest way to understand ${zone.name} before opening all readings.`,
        items
      };
    }

    function renderHeroSensorGlanceCards(items) {
      if (!items.length) {
        return `
          <div class="hero-sensor-empty">
            No live sensor parameters are available in this scope yet. Open all readings if you want to inspect installed and missing sensors in detail.
          </div>
        `;
      }

      return items.map((item) => `
        <article class="hero-sensor-card" data-state="${escapeAttribute(item.state)}">
          <div class="hero-sensor-card-top">
            <div class="hero-sensor-card-meta">${escapeHtml(item.meta)}</div>
            <span class="state-chip state-chip-outline shrink-0" data-state="${escapeAttribute(item.state)}">${escapeHtml(stateConfig[item.state].label)}</span>
          </div>
          <div class="hero-sensor-card-label">${escapeHtml(item.label)}</div>
          <div class="hero-sensor-card-value">${escapeHtml(item.value)}</div>
          <div class="hero-sensor-card-note">${escapeHtml(item.note)}</div>
        </article>
      `).join("");
    }

    function deriveSiteOverallState(siteSnapshots) {
      const zoneSeverities = siteSnapshots.map((snapshot) => 1 - (snapshot.overall.indexScore / 100));
      const averageSeverity = zoneSeverities.reduce((sum, severity) => sum + severity, 0) / Math.max(zoneSeverities.length, 1);
      const worstSeverity = zoneSeverities.length > 0 ? Math.max(...zoneSeverities) : 0;
      const riskScore = Math.round((averageSeverity * 0.65 + worstSeverity * 0.35) * 100);
      const riskIndex = Math.round(Math.max(riskScore, worstSeverity * 100));
      const indexScore = Math.max(0, 100 - riskIndex);

      return {
        state: deriveStateFromIndexScore(indexScore),
        stableCount: siteSnapshots.filter((snapshot) => snapshot.overall.state === "optimal").length,
        warningCount: siteSnapshots.filter((snapshot) => snapshot.overall.state === "warning").length,
        criticalCount: siteSnapshots.filter((snapshot) => snapshot.overall.state === "critical").length,
        indexScore
      };
    }

    function getTopSiteDrivers(siteSnapshots) {
      return [...siteSnapshots]
        .filter((snapshot) => snapshot.overall.state !== "optimal")
        .sort((left, right) => left.overall.indexScore - right.overall.indexScore)
        .slice(0, 2)
        .map((snapshot) => snapshot.zone.name);
    }

    function getCoverageStatsFromResults(results) {
      const growthResults = results.filter((item) => isGrowthMetricKey(item.key));
      const total = growthResults.length;
      const available = growthResults.filter((item) => item.available !== false).length;

      return {
        total,
        available,
        unavailable: total - available
      };
    }

    function getCoverageStatsFromSiteSnapshots(siteSnapshots) {
      return siteSnapshots.reduce((stats, snapshot) => {
        const next = getCoverageStatsFromResults(snapshot.results);
        stats.total += next.total;
        stats.available += next.available;
        stats.unavailable += next.unavailable;
        return stats;
      }, { total: 0, available: 0, unavailable: 0 });
    }

    function getPrimaryNonOptimalResult(nonOptimalResults) {
      return [...nonOptimalResults]
        .sort((left, right) => right.severity - left.severity)[0] || null;
    }

    function getWeakestSiteSnapshot(siteSnapshots) {
      return [...siteSnapshots]
        .sort((left, right) => left.overall.indexScore - right.overall.indexScore)[0] || null;
    }

    function getUrgencyModel(stateKey, indexScore, issueCount) {
      if (stateKey === "critical") {
        return {
          value: "Now",
          note: issueCount > 1
            ? "More than one reading needs a fix today."
            : "One reading is already in the red range."
        };
      }

      if (stateKey === "warning") {
        if (indexScore <= 50 || issueCount > 1) {
          return {
            value: "Soon",
            note: "Correct this before the next routine round."
          };
        }

        return {
          value: "Today",
          note: "One focused correction round should be enough."
        };
      }

      return {
        value: "Routine",
        note: "No special action is needed right now."
      };
    }

    function getConfidenceModel(coverage, manualOverride, scopeLabel) {
      const baseScore = Math.round((coverage.available / Math.max(coverage.total, 1)) * 100);
      const confidenceScore = clamp(baseScore - (manualOverride ? 8 : 0), 35, 100);
      let note = coverage.unavailable > 0
        ? `${coverage.unavailable} ${coverage.unavailable === 1 ? "metric is" : "metrics are"} missing from this ${scopeLabel}.`
        : `All configured metrics are live for this ${scopeLabel}.`;

      if (manualOverride) {
        note = `Manual override is active. ${note}`;
      }

      return {
        value: `${confidenceScore}%`,
        note
      };
    }

    function getHealthStateLabel(state) {
      if (state === "critical") return "Critical";
      if (state === "warning") return "Needs attention";
      return "Good";
    }

    function buildZoneHeroDecision(profile, zone, nonOptimalResults, overallState, coverage, manualOverride) {
      const primaryResult = getPrimaryNonOptimalResult(nonOptimalResults);
      const confidence = getConfidenceModel(coverage, manualOverride, "zone");
      const urgency = getUrgencyModel(overallState.state, overallState.indexScore, nonOptimalResults.length);

      if (!primaryResult) {
        return {
          title: "No change needed",
          headline: `${zone.name} is in a healthy range.`,
          description: "Keep the normal routine. The live readings behind this score are staying inside the target band.",
          focusValue: "Nothing urgent",
          focusNote: "No single reading is pulling the score down.",
          urgency,
          confidence
        };
      }

      const definition = profile.metrics[primaryResult.key];
      const missingNote = coverage.unavailable > 0
        ? ` ${coverage.unavailable} ${coverage.unavailable === 1 ? "metric is" : "metrics are"} excluded, so verify the change with live readings.`
        : "";

      return {
        title: overallState.state === "critical" ? `Fix ${definition.label}` : `Check ${definition.label}`,
        headline: `${definition.label} is the main reason this score is low.`,
        description: `${definition.action}${missingNote}`,
        focusValue: definition.label,
        focusNote: primaryResult.deviationText,
        urgency,
        confidence
      };
    }

    function buildSiteHeroDecision(siteSnapshots, overallState, coverage, manualOverride) {
      const weakestSnapshot = getWeakestSiteSnapshot(siteSnapshots);
      const confidence = getConfidenceModel(coverage, manualOverride, "site");
      const nonOptimalZones = siteSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
      const urgency = getUrgencyModel(overallState.state, overallState.indexScore, nonOptimalZones);

      if (!weakestSnapshot || overallState.state === "optimal") {
        return {
          title: "Location looks healthy",
          headline: "All blocks in this location are in range.",
          description: "No location-wide change is needed right now. Open a block only if you want a closer reading check.",
          focusValue: "No weak block",
          focusNote: `${siteSnapshots.length} blocks are aligned.`,
          urgency,
          confidence
        };
      }

      const primaryZoneResult = getPrimaryNonOptimalResult(
        weakestSnapshot.results.filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal")
      );
      const driverNote = primaryZoneResult
        ? `${weakestSnapshot.profile.metrics[primaryZoneResult.key].label} is furthest from target in this block.`
        : `${weakestSnapshot.overall.indexScore}% block score.`;
      const description = primaryZoneResult
        ? weakestSnapshot.profile.metrics[primaryZoneResult.key].action
        : "Open this block first before tuning the rest of the location.";

      return {
        title: `Start in ${weakestSnapshot.zone.name}`,
        headline: `${weakestSnapshot.zone.name} is lowering the location score most.`,
        description,
        focusValue: weakestSnapshot.zone.name,
        focusNote: driverNote,
        urgency,
        confidence
      };
    }

    function buildHeroDecision(options) {
      const {
        isSiteView,
        profile,
        zone,
        siteSnapshots,
        nonOptimalResults,
        displayedOverallState,
        results,
        manualOverride
      } = options;

      const coverage = isSiteView
        ? getCoverageStatsFromSiteSnapshots(siteSnapshots)
        : getCoverageStatsFromResults(results);

      return isSiteView
        ? buildSiteHeroDecision(siteSnapshots, displayedOverallState, coverage, manualOverride)
        : buildZoneHeroDecision(profile, zone, nonOptimalResults, displayedOverallState, coverage, manualOverride);
    }

    function renderActionDeckCards(cards) {
      const slotConfig = [
        { key: "now", label: "Now", note: "Work the highest-leverage move first." },
        { key: "next", label: "Next", note: "Validate trust, hardware, or coverage." },
        { key: "later", label: "Later", note: "Widen the context after the first correction." }
      ];

      return cards.map((card, index) => `
        <button
          type="button"
          class="action-deck-card"
          data-state="${card.state}"
          data-slot="${slotConfig[index]?.key || "later"}"
          data-action-index="${index}"
        >
          <div class="action-deck-top">
            <div class="action-deck-slot-wrap">
              <span class="action-deck-slot">${slotConfig[index]?.label || "Later"}</span>
              <span class="action-deck-slot-note">${escapeHtml(card.slotNote || slotConfig[index]?.note || "Keep the queue moving.")}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="action-deck-icon">
                <i class="fa-solid ${escapeAttribute(card.icon)}" aria-hidden="true"></i>
              </span>
              <span class="action-deck-hotkey">${index + 1}</span>
            </div>
          </div>
          <div>
            <div class="action-deck-kicker">${escapeHtml(card.kicker)}</div>
            <div class="action-deck-title">${escapeHtml(card.title)}</div>
          </div>
          <div class="action-deck-note">${escapeHtml(card.note)}</div>
          <div class="action-deck-chip-row">
            ${(card.chips || []).map((chip) => `<span class="action-deck-chip">${escapeHtml(chip)}</span>`).join("")}
          </div>
          <div class="action-deck-outcome">${escapeHtml(card.outcome || "Keep the queue moving without losing scope.")}</div>
          <div class="action-deck-footer">
            ${escapeHtml(card.cta)}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </div>
        </button>
      `).join("");
    }

    function getDecisionVerb(result, definition) {
      if (!result || !definition || result.state === "optimal") return "Monitor";
      if (result.value < definition.optimal[0]) return "Increase";
      if (result.value > definition.optimal[1]) return "Reduce";
      return "Check";
    }

    function getDecisionImpactText(metricKey, label) {
      const lowerLabel = (label || "this metric").toLowerCase();
      const impactMap = {
        humidity: "Expected effect: VPD moves closer to target and plant water stress risk decreases.",
        vpd: "Expected effect: transpiration pressure moves closer to the crop profile target.",
        co2: "Expected effect: photosynthesis conditions become more stable.",
        airTemp: "Expected effect: climate stress decreases and VPD interpretation becomes more reliable.",
        soilTemp: "Expected effect: root-zone activity becomes more stable.",
        waterTemp: "Expected effect: root-zone temperature moves closer to the recommended band."
      };
      return impactMap[metricKey] || `Expected effect: ${lowerLabel} moves closer to the crop profile target.`;
    }

    function renderTodayPriority(actions, issues, context = {}) {
      const action = actions[0] || null;
      const followUpActions = actions.slice(1, 3);
      currentTodayPriorityAction = action;
      currentTodayPriorityActions = actions;
      const priorityMetric = context.metric;
      const priorityDefinition = context.definition;
      const priorityResult = context.result;
      const priorityTrend = context.trend;
      const priorityDuration = context.duration;
      const metricDetails = priorityMetric && priorityDefinition && priorityResult ? `
        <div class="today-priority-facts">
          <div class="today-priority-fact">
            <span>Current</span>
            <strong>${escapeHtml(formatValue(priorityResult.value, priorityDefinition))}</strong>
          </div>
          <div class="today-priority-fact">
            <span>Target</span>
            <strong>${escapeHtml(formatRange(priorityDefinition.optimal, priorityDefinition))}</strong>
          </div>
          <div class="today-priority-fact">
            <span>Trend</span>
            <strong data-state="${priorityResult.state}">${escapeHtml(priorityTrend)}</strong>
          </div>
          <div class="today-priority-fact">
            <span>${priorityResult.state === "optimal" ? "Scope" : "Out of range"}</span>
            <strong>${escapeHtml(priorityResult.state === "optimal" ? context.scopeLabel : priorityDuration)}</strong>
          </div>
        </div>
      ` : "";
      const whyPanel = priorityMetric && priorityDefinition && priorityResult ? `
        <div id="todayPriorityWhyPanel" class="today-priority-why-panel" hidden>
          <strong>Why this recommendation?</strong>
          <ul>
            <li>${escapeHtml(priorityMetric)} is ${escapeHtml(formatValue(priorityResult.value, priorityDefinition))}; target is ${escapeHtml(formatRange(priorityDefinition.optimal, priorityDefinition))}.</li>
            <li>${escapeHtml(priorityResult.deviationText)}${priorityDuration ? ` and this has been visible for ${escapeHtml(priorityDuration)}.` : "."}</li>
            <li>${escapeHtml(getDecisionImpactText(priorityResult.key, priorityMetric))}</li>
          </ul>
        </div>
      ` : "";

      if (!action) {
        elements.todayPriorityMain.innerHTML = `
          <div class="today-priority-kicker">Today</div>
          <h2 class="today-priority-title">No priority action right now</h2>
          <p class="today-priority-copy">Current readings are steady. Keep monitoring this section and return here when the next reading arrives.</p>
          ${metricDetails}
        `;
      } else {
        elements.todayPriorityMain.innerHTML = `
          <div class="today-priority-kicker">Today’s priority</div>
          <div class="today-priority-context"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(context.siteName || "Selected area")}<span>›</span>${escapeHtml(context.zoneName || "Selected section")}</div>
          <h2 class="today-priority-title">${escapeHtml(action.title)}</h2>
          <p class="today-priority-copy">${escapeHtml(action.note)}</p>
          ${metricDetails}
          ${whyPanel}
          <div class="today-priority-footer">
            <button type="button" class="today-priority-action" data-today-priority-action>
              ${escapeHtml(action.cta)}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            ${whyPanel ? `<button type="button" class="today-priority-why-button" data-today-priority-why aria-expanded="false" aria-controls="todayPriorityWhyPanel">Why? <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>` : ""}
            ${followUpActions.length ? `<div class="today-priority-followups"><span>Next</span>${followUpActions.map((item, index) => `<button type="button" data-today-followup-index="${index + 1}">${escapeHtml(item.title)}</button>`).join("")}</div>` : ""}
          </div>
        `;
      }

      const otherIssues = issues.filter((item) => item.site.id !== context.siteId || item.zone.id !== context.zoneId);
      elements.todayPriorityPanel.dataset.hasSecondaryAlerts = "false";
      elements.todayPriorityAlerts.hidden = true;
      elements.todayPriorityAlerts.innerHTML = "";
      if (otherIssues.length) {
        elements.todayPriorityMain.insertAdjacentHTML("beforeend", `
          <div class="today-priority-system-note">
            <span><strong>${otherIssues.length}</strong> other active ${otherIssues.length === 1 ? "alert" : "alerts"} elsewhere in the system.</span>
            <button type="button" data-today-alerts-page>Review alerts <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
          </div>
        `);
      }
    }

    function ensureAdvancedToolsOpenForTarget(targetId) {
      if (!elements.advancedToolsPanel) return;
      if (!["scenarioLabPanel", "impactBoardPanel", "decisionBriefPanel"].includes(targetId)) return;
      if (!elements.advancedToolsPanel.open) {
        elements.advancedToolsPanel.open = true;
      }
    }

    function scrollToSection(targetId, options = {}) {
      if (!targetId) return;
      const behavior = options.behavior === "auto" ? "auto" : "smooth";
      const shouldHighlight = options.highlight !== false;

      ensureDetailedExperienceForTarget(targetId);
      ensureWorkspaceFocusForTarget(targetId);
      ensureAdvancedToolsOpenForTarget(targetId);

      if (targetId === "globalSystemCard" && globalSystemCollapsed) {
        globalSystemCollapsed = false;
        elements.globalSystemCard.dataset.collapsed = "false";
        elements.globalSystemExpanded.hidden = false;
      }

      const target = document.getElementById(targetId);
      if (!target) return;

      target.scrollIntoView({ behavior, block: "start" });

      if (!shouldHighlight) return;

      if (highlightedJumpTarget && highlightedJumpTarget !== target) {
        highlightedJumpTarget.classList.remove("is-highlighted");
      }

      target.classList.remove("is-highlighted");
      void target.offsetWidth;
      target.classList.add("is-highlighted");
      highlightedJumpTarget = target;

      window.setTimeout(() => {
        if (highlightedJumpTarget === target) {
          target.classList.remove("is-highlighted");
        }
      }, 1200);
    }

    function applyScenarioPreset(scenarioKey) {
      if (!scenarioConfig[scenarioKey]) return;
      if (activeScenarioKey === scenarioKey && !manualOverride) return;

      activeScenarioKey = scenarioKey;
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
    }

    function resetManualTest() {
      if (!manualOverride) return;

      resetCurrentReadingsFromActiveZone();
      renderDashboard();
    }

    function openZoneDetail(siteId, zoneId, scrollOptions = {}) {
      activePrimaryPage = "overview";
      sidebarActionOverride = null;
      activeSiteId = siteId;
      activeZoneId = zoneId;
      activeViewScope = "zone";
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      closeContextMenus();
      renderDashboard();
      syncTopLevelRoute("/");
      scrollToSection("heroStatusPanel", scrollOptions);
    }

    function openSiteView(siteId, detailView = activeSiteDetailView || "averages") {
      activePrimaryPage = "overview";
      sidebarActionOverride = null;
      const previousSiteId = activeSiteId;
      const previousZoneId = activeZoneId;
      activeSiteId = siteId;
      activeViewScope = "site";
      activeSiteDetailView = detailView;
      renderZoneOptions();
      const nextZone = getActiveZone();
      if (siteId !== previousSiteId || (nextZone && nextZone.id !== previousZoneId)) {
        resetCurrentReadingsFromActiveZone();
      }
      closeContextMenus();
      renderDashboard();
      syncTopLevelRoute("/");
      scrollToSection("heroStatusPanel");
    }

    function updateSidebarActionState() {
      let activeAction = "overview";

      if (activePrimaryPage === "locations") {
        activeAction = "sites";
      } else if (activePrimaryPage === "blocks") {
        activeAction = "zones";
      } else if (activePrimaryPage === "nodes") {
        activeAction = "nodes";
      } else if (activePrimaryPage === "readings") {
        activeAction = "readings";
      } else if (activePrimaryPage === "history") {
        activeAction = "history";
      } else if (activePrimaryPage === "alerts") {
        activeAction = "alerts";
      } else if (activePrimaryPage === "settings") {
        activeAction = "settings";
      } else if (sidebarActionOverride) {
        activeAction = sidebarActionOverride;
      }

      sidebarActionButtons.forEach((button) => {
        const isActive = button.dataset.sidebarAction === activeAction;
        button.dataset.active = String(isActive);
        if (isActive) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });
    }

    function runDashboardAction(action) {
      const site = getActiveSite();
      const zone = getActiveZone(site);

      switch (action) {
        case "overview":
          activePrimaryPage = "overview";
          setExperienceMode("simple", { render: false });
          if (site && zone) {
            openZoneDetail(site.id, zone.id, { behavior: "auto", highlight: false });
          } else {
            sidebarActionOverride = null;
            updateSidebarActionState();
            syncTopLevelRoute("/");
            scrollToSection("heroStatusPanel", { behavior: "auto", highlight: false });
          }
          return;
        case "sites":
          activePrimaryPage = "locations";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/areas");
          scrollToSection("locationsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "zones":
          activePrimaryPage = "blocks";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/sections");
          scrollToSection("blocksManagementSection", { behavior: "auto", highlight: false });
          return;
        case "nodes":
          activePrimaryPage = "nodes";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/nodes");
          scrollToSection("nodesManagementSection", { behavior: "auto", highlight: false });
          return;
        case "readings":
          activePrimaryPage = "readings";
          sidebarActionOverride = null;
          activeWorkspaceFocus = "all";
          activeWorkbenchLensKey = "all";
          setExperienceMode("detailed", { render: false });
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/readings");
          scrollToSection("metricsSection", { behavior: "auto", highlight: false });
          return;
        case "history":
          activePrimaryPage = "history";
          sidebarActionOverride = null;
          activeWorkspaceFocus = "all";
          setExperienceMode("detailed");
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/history");
          scrollToSection("historySection", { behavior: "auto", highlight: false });
          return;
        case "settings":
          activePrimaryPage = "settings";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/settings");
          scrollToSection("settingsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "alerts":
          activePrimaryPage = "alerts";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/alerts");
          scrollToSection("alertsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "analytics":
          runDashboardAction("history");
          return;
        default:
          return;
      }
    }

    function buildCommandPaletteItems() {
      const activeSite = getActiveSite();
      const activeZone = getActiveZone(activeSite);
      const systemAlertSnapshots = dashboardData.sites.flatMap((site) =>
        site.zones.map((zone) => evaluateZoneSnapshot(site, zone))
      ).filter((snapshot) => snapshot.overall.state !== "optimal");
      const criticalAlertCount = systemAlertSnapshots.filter((snapshot) => snapshot.overall.state === "critical").length;
      const currentSiteAlertCount = activeSite
        ? systemAlertSnapshots.filter((snapshot) => snapshot.site.id === activeSite.id).length
        : 0;
      const items = [];

      if (activeZone && activeSite) {
        items.push({
          pinned: true,
          kind: "Block",
          icon: "fa-location-crosshairs",
          label: `Current block: ${activeZone.name}`,
          meta: `${activeSite.name} • jump back to the active block overview`,
          keywords: `current zone ${activeZone.name} ${activeSite.name} overview`,
          run: () => openZoneDetail(activeSite.id, activeZone.id)
        });
      }

      if (activeSite) {
        items.push(
          {
            pinned: true,
            kind: "Location",
            icon: "fa-location-dot",
            label: `Location averages: ${activeSite.name}`,
            meta: `${activeSite.zones.length} blocks • open the location metrics lens`,
            keywords: `site averages ${activeSite.name}`,
            run: () => openSiteView(activeSite.id, "averages")
          },
          {
            pinned: true,
            kind: "Hotspots",
            icon: "fa-border-all",
            label: `Block hotspots: ${activeSite.name}`,
            meta: "Rank blocks by the drag they put on the location score",
            keywords: `zone hotspots site ${activeSite.name}`,
            run: () => openSiteView(activeSite.id, "zones")
          }
        );
      }

      items.push(
        {
          pinned: true,
          kind: "Action",
          icon: "fa-house",
          label: "Overview",
          meta: "Return to the main growth decision panel",
          keywords: "overview home dashboard",
          run: () => runDashboardAction("overview")
        },
        {
          pinned: true,
          kind: "Page",
          icon: "fa-location-dot",
          label: "Locations",
          meta: "Create and manage the larger greenhouse-level areas",
          keywords: "locations sites structure create manage greenhouse",
          run: () => runDashboardAction("sites")
        },
        {
          pinned: true,
          kind: "Page",
          icon: "fa-border-all",
          label: "Blocks",
          meta: "Create and manage the smaller monitored growing areas",
          keywords: "blocks zones structure create manage sections",
          run: () => runDashboardAction("zones")
        },
        {
          pinned: true,
          kind: "Page",
          icon: "fa-chart-line",
          label: "Trends",
          meta: "Inspect 24-hour plant trends, target bands, and changes over time",
          keywords: "trends history charts sensor data time series graph",
          run: () => runDashboardAction("history")
        },
        {
          pinned: false,
          kind: "Workflow",
          icon: "fa-layer-group",
          label: "Ops dock",
          meta: "Open the sticky cockpit strip with the live workflow context",
          keywords: "ops dock cockpit summary sticky workflow filters",
          run: () => scrollToSection("opsDockSection")
        },
        {
          pinned: false,
          kind: "Workflow",
          icon: "fa-wave-square",
          label: "Impact board",
          meta: "Compare the current scope against the live baseline",
          keywords: "impact board compare baseline before after delta drift",
          run: () => scrollToSection("impactBoardPanel")
        },
        {
          pinned: false,
          kind: "Workflow",
          icon: "fa-file-lines",
          label: "Decision brief",
          meta: "Open the share-ready operating summary",
          keywords: "decision brief handoff summary share copy",
          run: () => scrollToSection("decisionBriefPanel")
        },
        {
          pinned: false,
          kind: "Workflow",
          icon: "fa-list-check",
          label: "Execution queue",
          meta: "Open the Now / Next / Later action plan",
          keywords: "execution queue now next later action deck workflow",
          run: () => scrollToSection("heroStatusPanel")
        },
        {
          pinned: false,
          kind: "Focus",
          icon: "fa-table-cells-large",
          label: "Full canvas",
          meta: "Show the full dashboard again",
          keywords: "focus mode full dashboard canvas reset",
          run: () => setWorkspaceFocus("all", { scroll: false })
        },
        {
          pinned: false,
          kind: "Focus",
          icon: "fa-house",
          label: "Focus overview",
          meta: "Isolate the hero, scenario lab, impact board, and execution queue",
          keywords: "focus overview hero scenario impact queue",
          run: () => setWorkspaceFocus("overview")
        },
        {
          pinned: false,
          kind: "Focus",
          icon: "fa-triangle-exclamation",
          label: "Focus alerts",
          meta: "Isolate the alert rail and system queue",
          keywords: "focus alerts system queue incidents",
          run: () => setWorkspaceFocus("alerts")
        },
        {
          pinned: false,
          kind: "Focus",
          icon: "fa-chart-line",
          label: "Focus metrics",
          meta: "Isolate the analytics and metrics workbench",
          keywords: "focus metrics analytics workbench",
          run: () => setWorkspaceFocus("metrics")
        },
        {
          pinned: false,
          kind: "Focus",
          icon: "fa-battery-half",
          label: "Focus power triage",
          meta: "Isolate the node and battery trust board",
          keywords: "focus power battery nodes triage",
          run: () => setWorkspaceFocus("power")
        },
        {
          pinned: false,
          kind: "Focus",
          icon: "fa-route",
          label: "Focus inspection route",
          meta: "Isolate the walkthrough and route planner",
          keywords: "focus route inspection walkthrough",
          run: () => setWorkspaceFocus("route")
        },
        {
          pinned: true,
          kind: "Alert",
          icon: "fa-triangle-exclamation",
          label: "System alerts",
          meta: "Open system-wide status and active warnings",
          keywords: "alerts warning critical system",
          run: () => runDashboardAction("alerts")
        },
        {
          pinned: true,
          kind: "Analytics",
          icon: "fa-chart-line",
          label: "Metrics workbench",
          meta: "Jump to the metrics and analytics section",
          keywords: "analytics metrics charts workbench",
          run: () => runDashboardAction("analytics")
        },
        {
          pinned: false,
          kind: "Workflow",
          icon: "fa-route",
          label: "Inspection route",
          meta: "Jump to the prioritized walkthrough for the current scope",
          keywords: "inspection route walkthrough checklist flow triage",
          run: () => {
            if (activeViewScope === "site" && activeSite && activeSiteDetailView === "zones") {
              openSiteView(activeSite.id, "averages");
            }
            scrollToSection("zoneImpactSection");
          }
        },
        {
          pinned: false,
          kind: "Hardware",
          icon: "fa-battery-half",
          label: "Power triage",
          meta: "Jump to the battery and node power triage board",
          keywords: "battery power triage sensor health nodes",
          run: () => scrollToSection("sensorHealthSection")
        },
        {
          pinned: true,
          kind: "Page",
          icon: "fa-microchip",
          label: "Open nodes",
          meta: "Register and manage the sensor nodes",
          keywords: "nodes slaves sensors page",
          run: () => runDashboardAction("nodes")
        }
      );

      if (currentDecisionBriefPayload.shortText) {
        items.push(
          {
            pinned: false,
            kind: "Action",
            icon: "fa-copy",
            label: "Copy short brief",
            meta: "Copy the one-line operating summary",
            keywords: "copy short brief summary handoff",
            run: () => { copyDecisionBrief("short"); }
          },
          {
            pinned: false,
            kind: "Action",
            icon: "fa-file-lines",
            label: "Copy decision brief",
            meta: "Copy the full operating handoff note",
            keywords: "copy decision brief full handoff summary",
            run: () => { copyDecisionBrief("detailed"); }
          }
        );
      }

      if (criticalAlertCount > 0) {
        items.push({
          pinned: false,
          kind: "Alert",
          icon: "fa-triangle-exclamation",
          label: `Critical incidents (${criticalAlertCount})`,
          meta: "Open the alert rail filtered to critical blocks",
          keywords: "critical alerts incidents urgent system queue",
          run: () => {
            activeAlertRailFilterKey = "critical";
            runDashboardAction("alerts");
          }
        });
      }

      if (activeSite && currentSiteAlertCount > 0) {
        items.push({
          pinned: false,
          kind: "Alert",
          icon: "fa-location-dot",
          label: `Incidents in ${activeSite.name}`,
          meta: `${currentSiteAlertCount} active blocks in the current location alert rail`,
          keywords: `current site alerts ${activeSite.name} incidents`,
          run: () => {
            activeAlertRailFilterKey = "site";
            runDashboardAction("alerts");
          }
        });
      }

      items.push({
        pinned: false,
        kind: "Scenario",
        icon: "fa-wave-square",
        label: "Open scenario lab",
        meta: "Jump back to the what-if presets and manual test controls",
        keywords: "scenario lab what if simulation presets manual test",
        run: () => scrollToSection("scenarioLabPanel")
      });

      Object.entries(scenarioConfig).forEach(([scenarioKey, scenario]) => {
        items.push({
          pinned: false,
          kind: "Scenario",
          icon: scenario.icon,
          label: scenario.label,
          meta: scenario.commandMeta,
          keywords: `scenario ${scenario.shortLabel} ${scenario.label} preset simulation drill`,
          run: () => applyScenarioPreset(scenarioKey)
        });
      });

      if (manualOverride) {
        items.push({
          pinned: false,
          kind: "Scenario",
          icon: "fa-arrow-rotate-left",
          label: "Reset manual test",
          meta: "Snap the active block back to the selected preset",
          keywords: "reset manual test scenario preset zone",
          run: () => resetManualTest()
        });
      }

      dashboardData.sites.forEach((site) => {
        items.push({
          pinned: false,
          kind: "Location",
          icon: "fa-location-dot",
          label: site.name,
          meta: `${site.zones.length} blocks • open location averages`,
          keywords: `site ${site.name} ${site.zones.map((zone) => zone.name).join(" ")}`,
          run: () => openSiteView(site.id, "averages")
        });

        site.zones.forEach((zone) => {
          const profile = cropProfiles[zone.profile];
          items.push({
            pinned: false,
            kind: "Block",
            icon: "fa-border-all",
            label: zone.name,
            meta: `${site.name} • ${profile ? profile.name : zone.profile}`,
            keywords: `zone ${zone.name} ${site.name} ${profile ? profile.name : zone.profile}`,
            run: () => openZoneDetail(site.id, zone.id)
          });
        });
      });

      return items;
    }

    function getCommandPaletteResults(query) {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        return commandPaletteItems.filter((item) => item.pinned).slice(0, 9);
      }

      return commandPaletteItems
        .map((item) => {
          const label = item.label.toLowerCase();
          const meta = item.meta.toLowerCase();
          const keywords = item.keywords.toLowerCase();

          let score = Number.POSITIVE_INFINITY;
          if (label.startsWith(normalized)) score = 0;
          else if (label.includes(normalized)) score = 1;
          else if (keywords.startsWith(normalized)) score = 2;
          else if (keywords.includes(normalized)) score = 3;
          else if (meta.includes(normalized)) score = 4;

          return { item, score };
        })
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => {
          if (left.score !== right.score) return left.score - right.score;
          if (left.item.pinned !== right.item.pinned) return left.item.pinned ? -1 : 1;
          return left.item.label.localeCompare(right.item.label);
        })
        .slice(0, 12)
        .map((entry) => entry.item);
    }

    function renderCommandPalette(resetActiveIndex = false) {
      const query = elements.commandPaletteInput.value;
      filteredCommandPaletteItems = getCommandPaletteResults(query);

      if (resetActiveIndex) {
        activeCommandPaletteIndex = 0;
      }

      if (filteredCommandPaletteItems.length === 0) {
        activeCommandPaletteIndex = 0;
        elements.commandPaletteResults.innerHTML = `
          <div class="command-palette-empty">
            No results for <strong>${escapeHtml(query.trim())}</strong>. Try a location, block, scenario, alerts, or analytics.
          </div>
        `;
        return;
      }

      activeCommandPaletteIndex = clamp(activeCommandPaletteIndex, 0, filteredCommandPaletteItems.length - 1);
      elements.commandPaletteResults.innerHTML = filteredCommandPaletteItems.map((item, index) => `
        <button
          type="button"
          class="command-palette-item"
          data-command-result-index="${index}"
          data-active="${index === activeCommandPaletteIndex}"
        >
          <span class="command-palette-item-icon">
            <i class="fa-solid ${escapeAttribute(item.icon)}" aria-hidden="true"></i>
          </span>
          <span class="min-w-0">
            <span class="command-palette-item-label">${escapeHtml(item.label)}</span>
            <span class="command-palette-item-meta">${escapeHtml(item.meta)}</span>
          </span>
          <span class="command-palette-item-kind">${escapeHtml(item.kind)}</span>
        </button>
      `).join("");
    }

    function openCommandPalette() {
      if (isCommandPaletteOpen) return;

      commandPaletteReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      isCommandPaletteOpen = true;
      commandPaletteItems = buildCommandPaletteItems();
      activeCommandPaletteIndex = 0;
      elements.commandPaletteOverlay.hidden = false;
      elements.commandPaletteInput.value = "";
      closeContextMenus();
      setHeaderBatteryDropdownOpen(false);
      renderCommandPalette(true);

      window.requestAnimationFrame(() => {
        elements.commandPaletteInput.focus();
      });
    }

    function closeCommandPalette(options = {}) {
      const { restoreFocus = true } = options;
      if (!isCommandPaletteOpen) return;

      isCommandPaletteOpen = false;
      elements.commandPaletteOverlay.hidden = true;
      elements.commandPaletteInput.value = "";
      elements.commandPaletteResults.innerHTML = "";
      filteredCommandPaletteItems = [];
      activeCommandPaletteIndex = 0;

      if (restoreFocus && commandPaletteReturnFocus && commandPaletteReturnFocus.isConnected) {
        commandPaletteReturnFocus.focus();
      }
    }

    function executeCommandPaletteItem(item) {
      if (!item) return;
      closeCommandPalette({ restoreFocus: false });
      item.run();
    }

    function executeActionDeckAction(action) {
      if (!action) return;

      if (activeViewScope === "site" && action.siteDetailView && activeSiteDetailView !== action.siteDetailView) {
        sidebarActionOverride = null;
        activeSiteDetailView = action.siteDetailView;
        renderDashboard();
      }

      scrollToSection(action.targetId);
    }

    function executeTodayPriorityAction(action) {
      if (!action) return;
      if (!action.siteId || !action.zoneId) {
        executeActionDeckAction(action);
        return;
      }

      activePrimaryPage = "overview";
      sidebarActionOverride = null;
      activeSiteId = action.siteId;
      activeZoneId = action.zoneId;
      activeProfileKey = action.profileKey || getActiveZone()?.profile || activeProfileKey;
      activeViewScope = "zone";
      if (action.metricKey) {
        activeTrendMetricKey = action.metricKey;
        activeTrendMetricKeys = [action.metricKey];
      }
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
      syncTopLevelRoute("/");
      scrollToSection(action.targetId || "metricsSection");
    }

    function buildActionDeck(options) {
      const {
        isSiteView,
        site,
        zone,
        profile,
        results,
        nonOptimalResults,
        siteSnapshots,
        displayedOverallState,
        batteryDefinition,
        batteryResult,
        globalState,
        globalCritical,
        globalWarning,
        siteDetailView
      } = options;

      const coverage = isSiteView
        ? getCoverageStatsFromSiteSnapshots(siteSnapshots)
        : getCoverageStatsFromResults(results);

      if (isSiteView) {
        const weakestSnapshot = getWeakestSiteSnapshot(siteSnapshots);
        const weakestZoneResults = weakestSnapshot
          ? weakestSnapshot.results.filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal")
          : [];
        const primaryZoneResult = getPrimaryNonOptimalResult(weakestZoneResults);
        const siteLowBatteryNodes = batteryDefinition ? getSiteLowBatteryNodes(site, batteryDefinition) : [];
        const lowestBatteryNode = [...siteLowBatteryNodes].sort((left, right) => left.level - right.level)[0] || null;

        const cards = [
          weakestSnapshot && weakestSnapshot.overall.state !== "optimal"
            ? {
                state: primaryZoneResult?.state || weakestSnapshot.overall.state,
                kicker: "Tune first",
                title: `Tune ${primaryZoneResult ? weakestSnapshot.profile.metrics[primaryZoneResult.key].label : weakestSnapshot.zone.name}`,
                note: primaryZoneResult
                  ? `Location averages are being pulled down by ${weakestSnapshot.zone.name}. Start with ${weakestSnapshot.profile.metrics[primaryZoneResult.key].label} before rechecking the rest.`
                  : `${weakestSnapshot.zone.name} is the weakest block in this location. Start from the location-level metrics before diving into the block stack.`,
                targetId: "metricsSection",
                siteDetailView: "averages",
                cta: "Open location metrics",
                icon: "fa-sliders",
                slotNote: "Reduce the main location drag before anything else.",
                chips: [weakestSnapshot.zone.name, primaryZoneResult ? weakestSnapshot.profile.metrics[primaryZoneResult.key].label : "Weakest block", "Metrics"],
                outcome: "Lower the primary location drag before you branch into anything else."
              }
            : {
                state: "optimal",
                kicker: "Tune first",
                title: "Location averages are steady",
                note: `All ${siteSnapshots.length} blocks are inside the target band. Use the location metrics to pressure-test stability before conditions drift.`,
                targetId: "metricsSection",
                siteDetailView: "averages",
                cta: "Open location metrics",
                icon: "fa-chart-line",
                slotNote: "Keep the clean signal under control first.",
                chips: [`${siteSnapshots.length} blocks`, "Metrics", "Stable"],
                outcome: "Use the location metrics to protect the current margin before drift appears."
              },
          siteLowBatteryNodes.length > 0
            ? {
                state: siteLowBatteryNodes.some((node) => node.level < criticalBatteryThreshold) ? "critical" : "warning",
                kicker: "Check hardware",
                title: `${siteLowBatteryNodes.length} low-battery ${siteLowBatteryNodes.length === 1 ? "node" : "nodes"}`,
                note: lowestBatteryNode
                  ? `Lowest node ${lowestBatteryNode.id} is at ${lowestBatteryNode.level}% in ${lowestBatteryNode.zoneName}. Stabilize power before trusting longer trends.`
                  : "Battery health needs attention across this location.",
                targetId: "sensorHealthSection",
                cta: "Check sensor batteries",
                icon: "fa-battery-half",
                slotNote: "Validate trust in the data before you widen the fix.",
                chips: [`${siteLowBatteryNodes.length} nodes`, lowestBatteryNode ? lowestBatteryNode.zoneName : "Power", "Hardware"],
                outcome: "Raise confidence in the next readings before you commit to a broader location move."
              }
            : coverage.unavailable > 0
              ? {
                  state: "warning",
                  kicker: "Check coverage",
                  title: `${coverage.unavailable} metric gaps across location`,
                  note: "Some location averages are built from partial sensor coverage, so use a little more caution before changing strategy for the whole location.",
                  targetId: "metricsSection",
                  cta: "Review missing data",
                  icon: "fa-wave-square",
                  slotNote: "Check observability before trusting the average too much.",
                  chips: [`${coverage.unavailable} gaps`, "Coverage", "Confidence"],
                  outcome: "Tighten location confidence before you scale the first correction."
                }
              : {
                  state: "optimal",
                  kicker: "Check hardware",
                  title: "Sensors look healthy",
                  note: "Battery health and signal coverage are clean across the selected location.",
                  targetId: "sensorHealthSection",
                  cta: "Check sensor batteries",
                  icon: "fa-battery-full",
                  slotNote: "Keep trust high while the location is still calm.",
                  chips: ["Power", "Coverage", "Healthy"],
                  outcome: "Maintain clean telemetry while you continue through the queue."
                },
          weakestSnapshot && weakestSnapshot.overall.state !== "optimal"
            ? {
                state: weakestSnapshot.overall.state,
                kicker: "Drill down",
                title: `Inspect ${weakestSnapshot.zone.name}`,
                note: primaryZoneResult
                  ? `${weakestSnapshot.profile.metrics[primaryZoneResult.key].label} is the strongest drag in that block. Use the block stack below to guide the walkthrough.`
                  : "This block is the weakest performer in the selected location. Open the block stack and validate it before tuning the rest.",
                targetId: siteDetailView === "zones" ? "metricsSection" : "zoneImpactSection",
                siteDetailView: siteDetailView === "zones" ? "zones" : null,
                cta: siteDetailView === "zones" ? "Open hotspots" : "Open block stack",
                icon: "fa-compass",
                slotNote: "Only widen the loop after the first leverage move is clear.",
                chips: [weakestSnapshot.zone.name, siteDetailView === "zones" ? "Hotspots" : "Inspection route", "Drill-down"],
                outcome: "Validate the fix inside the exact block that is dragging the location most."
              }
            : globalState !== "optimal"
              ? {
                  state: globalState,
                  kicker: "Check the bigger picture",
                  title: "See other affected areas",
                  note: `${globalCritical} critical and ${globalWarning} warning blocks are active across the customer system. Compare this location before making a broad change.`,
                  targetId: "globalSystemCard",
                  cta: "Open other areas",
                  icon: "fa-globe",
                  slotNote: "Close the loop by checking whether the move should stay local.",
                  chips: [`${globalCritical} critical`, `${globalWarning} warning`, "Portfolio"],
                  outcome: "Check whether this location-level correction should remain local or become broader guidance."
                }
              : {
                state: "optimal",
                kicker: "Drill down",
                title: "Review block consistency",
                note: `All ${siteSnapshots.length} blocks are steady. Use the block stack to confirm there are no soft spots hiding under the location average.`,
                targetId: siteDetailView === "zones" ? "metricsSection" : "zoneImpactSection",
                siteDetailView: siteDetailView === "zones" ? "zones" : null,
                cta: siteDetailView === "zones" ? "Open hotspots" : "Open block stack",
                icon: "fa-compass",
                slotNote: "Finish by validating that no weak block is hiding underneath.",
                chips: [`${siteSnapshots.length} blocks`, "Inspection route", "Validation"],
                outcome: "Confirm the stable location average is backed by equally stable blocks."
              }
        ];

        return {
          summary: weakestSnapshot && weakestSnapshot.overall.state !== "optimal"
            ? "Start with the strongest location issue, check data trust next, and only then look at the exact block or the wider system."
            : "This location is stable. The queue keeps validation, trust, and deeper context one click away as conditions evolve.",
          cards
        };
      }

      const primaryResult = getPrimaryNonOptimalResult(nonOptimalResults);
      const lowBatteryNodes = batteryDefinition && batteryResult && batteryResult.available !== false
        ? getLowBatteryNodes(zone, batteryDefinition)
        : [];
      const lowestBatteryNode = [...lowBatteryNodes].sort((left, right) => left.level - right.level)[0] || null;
      const driverLabels = [...nonOptimalResults]
        .sort((left, right) => right.severity - left.severity)
        .slice(0, 2)
        .map((item) => profile.metrics[item.key].label);

      const cards = [
        primaryResult
          ? {
              state: primaryResult.state,
              kicker: "Tune first",
              title: `Tune ${profile.metrics[primaryResult.key].label}`,
              note: `${primaryResult.deviationText}. Open the live metric cards and correct this driver first.`,
              targetId: "metricsSection",
              cta: "Open metrics",
              icon: "fa-sliders",
              slotNote: "Correct the strongest metric drag before anything else.",
              chips: [profile.metrics[primaryResult.key].label, "Metrics", stateConfig[primaryResult.state].shortLabel],
              outcome: "Reduce the primary block drag before you validate the rest of the stack."
            }
          : {
              state: "optimal",
              kicker: "Tune first",
              title: "Keep metrics in band",
              note: "The selected block is aligned with its crop profile. Use the live cards to stress-test the margin before conditions drift.",
              targetId: "metricsSection",
              cta: "Open metrics",
              icon: "fa-chart-line",
              slotNote: "Protect the cleanest signal first.",
              chips: [profile.name, "Metrics", "Stable"],
              outcome: "Keep the live metric margin healthy before you move deeper into the stack."
            },
        batteryResult && batteryResult.available === false
          ? {
              state: "warning",
              kicker: "Check hardware",
              title: "Battery telemetry missing",
              note: "This block score ignores battery health until telemetry is installed. Validate node power before treating this block as fully observable.",
              targetId: "sensorHealthSection",
              cta: "Check sensor batteries",
              icon: "fa-battery-quarter",
              slotNote: "Fix observability before trusting the next move.",
              chips: ["Battery telemetry", "Missing", "Confidence"],
              outcome: "Raise trust in the block before you commit to any follow-up correction."
            }
          : lowBatteryNodes.length > 0
            ? {
                state: lowBatteryNodes.some((node) => node.level < criticalBatteryThreshold) ? "critical" : "warning",
                kicker: "Check hardware",
                title: `${lowBatteryNodes.length} low-battery ${lowBatteryNodes.length === 1 ? "node" : "nodes"}`,
                note: lowestBatteryNode
                  ? `Lowest node ${lowestBatteryNode.id} is at ${lowestBatteryNode.level}%. Fix power first so the next growth reading stays trustworthy.`
                  : "Battery health needs attention in this block.",
                targetId: "sensorHealthSection",
                cta: "Check sensor batteries",
                icon: "fa-battery-half",
                slotNote: "Keep the sensor trust layer healthy before widening the correction.",
                chips: [`${lowBatteryNodes.length} nodes`, lowestBatteryNode ? lowestBatteryNode.id : "Power", "Hardware"],
                outcome: "Make the next reading cycle trustworthy before you continue through the queue."
              }
            : coverage.unavailable > 0
              ? {
                  state: "warning",
                  kicker: "Check coverage",
                  title: `${coverage.unavailable} ${coverage.unavailable === 1 ? "metric gap" : "metric gaps"}`,
                  note: "Part of this block is being judged without those signals, so confidence is lower until coverage is complete.",
                  targetId: "metricsSection",
                  cta: "Review missing data",
                  icon: "fa-wave-square",
                  slotNote: "Tighten observability before trusting the broader conclusion.",
                  chips: [`${coverage.unavailable} gaps`, "Coverage", "Confidence"],
                  outcome: "Increase block confidence before you generalize the first fix."
                }
              : {
                  state: "optimal",
                  kicker: "Check hardware",
                  title: "Sensors look healthy",
                  note: "Battery health and signal coverage are clean for this block.",
                  targetId: "sensorHealthSection",
                  cta: "Check sensor batteries",
                  icon: "fa-battery-full",
                  slotNote: "Use the clean trust layer to keep momentum.",
                  chips: ["Power", "Coverage", "Healthy"],
                  outcome: "Keep telemetry trust high while you finish the block workflow."
                },
        nonOptimalResults.length > 1
          ? {
              state: displayedOverallState.state,
              kicker: "Work the stack",
              title: `${nonOptimalResults.length} corrective moves queued`,
              note: `${joinLabels(driverLabels)} ${driverLabels.length === 1 ? "is" : "are"} the main driver${driverLabels.length === 1 ? "" : "s"}. Use the intervention stack to work through them in order.`,
              targetId: "zoneImpactSection",
              cta: "Open action stack",
              icon: "fa-layer-group",
              slotNote: "Finish by clearing the rest of the block queue in order.",
              chips: [`${nonOptimalResults.length} moves`, "Inspection route", "Block stack"],
              outcome: "Work the remaining block corrections in order after the primary driver is stabilized."
            }
          : globalState !== "optimal"
            ? {
                state: globalState,
                kicker: "Check the bigger picture",
                title: "See other affected areas",
                note: `${globalCritical} critical and ${globalWarning} warning blocks are active across the customer system. Compare this block before you generalize the fix.`,
                targetId: "globalSystemCard",
                cta: "Open other areas",
                icon: "fa-globe",
                slotNote: "Close by checking whether the move should stay local or scale wider.",
                chips: [`${globalCritical} critical`, `${globalWarning} warning`, "Portfolio"],
                outcome: "Validate whether this block fix should remain local or become a broader operating signal."
              }
            : {
                state: "optimal",
                kicker: "Check the bigger picture",
                title: "Broader system is steady",
                note: "The selected block is not drifting away from the rest of the system right now.",
                targetId: "globalSystemCard",
                cta: "Open other areas",
                icon: "fa-globe",
                slotNote: "Finish with a wider sanity check before you move on.",
                chips: ["Portfolio", "Stable", "Validation"],
                outcome: "Confirm the block conclusion still fits the wider customer system."
              }
      ];

      return {
        summary: primaryResult
          ? "Start with the strongest reading, check batteries or missing data next, and only then look wider if the issue might not be local."
          : "Everything is currently in range. The queue keeps the validation path tight before you move on.",
        cards
      };
    }

    function buildSiteIndicatorSummary(siteSnapshots, topZoneLabels) {
      const nonOptimalCount = siteSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;

      if (nonOptimalCount === 0) {
        return `All ${siteSnapshots.length} blocks in this location are inside the target range.`;
      }

      return `${joinLabels(topZoneLabels)} ${topZoneLabels.length === 1 ? "is" : "are"} pulling the location score down. ${nonOptimalCount} of ${siteSnapshots.length} blocks need attention.`;
    }

    function getScopeBadgeLabel(stateKey, scope) {
      if (scope === "site") {
        if (stateKey === "optimal") return "Green area";
        if (stateKey === "warning") return "Amber area";
        return "Red area";
      }

      return stateConfig[stateKey].badge;
    }

    function getSiteProfileSummary(siteSnapshots) {
      const names = [...new Set(siteSnapshots.map((snapshot) => snapshot.profile.name))];
      return {
        value: names.length === 1 ? names[0] : "Mixed profiles",
        meta: `${siteSnapshots.length} sections included`
      };
    }

    function getSiteLowBatteryNodes(site, definition) {
      return site.zones.flatMap((zone) =>
        getLowBatteryNodes(zone, definition).map((node) => ({
          ...node,
          zoneName: zone.name
        }))
      ).sort((left, right) => left.level - right.level);
    }

    function renderSiteSensorHealthList(lowNodes, threshold) {
      if (lowNodes.length === 0) {
        return `<div class="battery-node-empty">No slave nodes are below ${threshold}% in this location.</div>`;
      }

      return lowNodes
        .map((node) => `<span class="battery-node-chip"><strong>${escapeHtml(node.id)}</strong> ${escapeHtml(node.level)}% &middot; ${escapeHtml(node.zoneName)}</span>`)
        .join("");
    }

    function renderSensorHealthFilters(filters, activeKey) {
      return filters.map((filter) => `
        <button
          type="button"
          class="power-filter-chip"
          data-sensor-health-filter="${escapeAttribute(filter.key)}"
          data-active="${String(filter.key === activeKey)}"
          data-tone="${escapeAttribute(filter.tone || "neutral")}"
          aria-pressed="${String(filter.key === activeKey)}"
        >
          <span class="power-filter-chip-label">${escapeHtml(filter.label)}</span>
          <span class="power-filter-chip-count">${filter.count}</span>
        </button>
      `).join("");
    }

    function filterSensorHealthNodes(nodes, filterKey, threshold) {
      switch (filterKey) {
        case "critical":
          return nodes.filter((node) => node.state === "critical");
        case "warning":
          return nodes.filter((node) => node.state === "warning");
        case "healthy":
          return nodes.filter((node) => node.level >= threshold);
        case "focus":
          return nodes.filter((node) => node.level < threshold);
        case "all":
        default:
          return nodes;
      }
    }

    function renderSensorHealthNodeCards(nodes, definition, options = {}) {
      const { isSiteView = false, emptyTitle, emptyNote } = options;
      const threshold = getBatteryAlertThreshold(definition);

      if (nodes.length === 0) {
        return `
          <div class="workbench-empty-card">
            <div class="workbench-empty-title">${escapeHtml(emptyTitle || "No nodes match this filter.")}</div>
            <p class="workbench-empty-note">${escapeHtml(emptyNote || "Switch filters to inspect another slice of the power triage board.")}</p>
            <button type="button" class="workbench-empty-button" data-sensor-health-switch="all">
              <i class="fa-solid fa-battery-half" aria-hidden="true"></i>
              Show all nodes
            </button>
          </div>
        `;
      }

      return nodes.map((node) => `
        <article class="power-node-card" data-state="${node.state}">
          <div class="power-node-top">
            <div class="min-w-0">
              <div class="power-node-kicker">${isSiteView ? `${escapeHtml(node.siteName)} &middot; ${escapeHtml(node.zoneName)}` : "Current block node"}</div>
              <div class="power-node-id">${escapeHtml(node.id)}</div>
              <div class="power-node-context">${isSiteView ? escapeHtml(node.zoneName) : "Selected block power telemetry"}</div>
            </div>
            <span class="power-node-badge" data-state="${node.state}">${stateConfig[node.state].label}</span>
          </div>
          <div class="power-node-value">${node.level}%</div>
          <div class="power-node-note">${escapeHtml(getBatteryNodeNote(node.level, definition))}</div>
          <div class="power-node-track">
            <div class="power-node-fill" style="width:${clamp(node.level, 0, 100)}%"></div>
          </div>
          <div class="power-node-scale">
            <span>${criticalBatteryThreshold}% critical</span>
            <span>${threshold}% watch</span>
            <span>100% full</span>
          </div>
        </article>
      `).join("");
    }

    function renderInspectionRouteFilters(filters, activeKey) {
      return filters.map((filter) => `
        <button
          type="button"
          class="inspection-filter-chip"
          data-inspection-route-filter="${escapeAttribute(filter.key)}"
          data-active="${String(filter.key === activeKey)}"
          data-tone="${escapeAttribute(filter.tone || "neutral")}"
          aria-pressed="${String(filter.key === activeKey)}"
        >
          <span class="inspection-filter-chip-label">${escapeHtml(filter.label)}</span>
          <span class="inspection-filter-chip-count">${filter.count}</span>
        </button>
      `).join("");
    }

    function filterInspectionRouteItems(items, filterKey) {
      if (filterKey === "focus") {
        return items.slice(0, 3);
      }
      if (filterKey === "all") {
        return items;
      }
      if (filterKey === "critical") {
        return items.filter((item) => item.state === "critical");
      }
      if (filterKey === "warning") {
        return items.filter((item) => item.state === "warning");
      }
      if (filterKey.startsWith("group-")) {
        const groupKey = filterKey.slice("group-".length);
        return items.filter((item) => item.groupKey === groupKey);
      }
      return items;
    }

    function renderInspectionRouteCards(items, options = {}) {
      const { emptyTitle, emptyNote } = options;
      if (items.length === 0) {
        return `
          <div class="workbench-empty-card">
            <div class="workbench-empty-title">${escapeHtml(emptyTitle || "No route items match this filter.")}</div>
            <p class="workbench-empty-note">${escapeHtml(emptyNote || "Switch route filters to inspect another slice of the current walkthrough.")}</p>
            <button type="button" class="workbench-empty-button" data-inspection-route-switch="all">
              <i class="fa-solid fa-route" aria-hidden="true"></i>
              Show full route
            </button>
          </div>
        `;
      }

      return items.map((item) => `
        <button
          type="button"
          class="inspection-route-card"
          data-state="${item.state}"
          ${item.siteId ? `data-zone-drill-site-id="${escapeAttribute(item.siteId)}"` : ""}
          ${item.zoneId ? `data-zone-drill-id="${escapeAttribute(item.zoneId)}"` : ""}
          ${item.routeLensKey ? `data-route-lens="${escapeAttribute(item.routeLensKey)}"` : ""}
          ${item.routeTargetId ? `data-route-target="${escapeAttribute(item.routeTargetId)}"` : ""}
        >
          <div class="inspection-route-step">${item.step}</div>
          <div class="min-w-0">
            <div class="inspection-route-kicker">${escapeHtml(item.kicker)}</div>
            <div class="inspection-route-title">${escapeHtml(item.title)}</div>
            <div class="inspection-route-summary">${escapeHtml(item.summary)}</div>
            <div class="inspection-route-meta-line">
              ${item.metaChips.map((chip) => `<span class="inspection-route-meta-chip">${escapeHtml(chip)}</span>`).join("")}
            </div>
          </div>
          <div class="inspection-route-side">
            <span class="state-chip shrink-0" data-state="${item.state}">${stateConfig[item.state].label}</span>
            <div class="inspection-route-score-label">${escapeHtml(item.scoreLabel)}</div>
            <div class="inspection-route-score-value">${escapeHtml(item.scoreValue)}</div>
            <div class="inspection-route-link">
              ${escapeHtml(item.actionLabel)}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </div>
          </div>
        </button>
      `).join("");
    }

    function renderOpsDockCards(cards) {
      return cards.map((card) => `
        <button
          type="button"
          class="ops-dock-card"
          data-ops-action="${escapeAttribute(card.action)}"
          data-tone="${escapeAttribute(card.tone || "neutral")}"
        >
          <div class="ops-dock-card-kicker">${escapeHtml(card.kicker)}</div>
          <div class="ops-dock-card-value">${escapeHtml(card.value)}</div>
          <div class="ops-dock-card-note">${escapeHtml(card.note)}</div>
          <div class="ops-dock-card-footer">
            ${escapeHtml(card.cta)}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </div>
        </button>
      `).join("");
    }

    function getWorkspaceFocusSummary(key, context = {}) {
      const {
        siteName = "this location",
        zoneName = "this block",
        workbenchLabel = "Focus",
        routeLabel = "Focus",
        alertLabel = "All active",
        powerLabel = "Focus"
      } = context;

      switch (key) {
        case "overview":
          return `Overview focus keeps the hero, scenario lab, impact board, and execution queue visible while the rest of the dashboard steps aside.`;
        case "alerts":
          return `Alerts focus isolates the system queue for ${siteName}. Use it when you want to work incidents without the rest of the canvas competing for attention.`;
        case "metrics":
          return `Metrics focus isolates the analytics canvas with the ${workbenchLabel.toLowerCase()} lens active, so you can tune without side noise.`;
        case "power":
          return `Power focus isolates node trust and battery triage for ${zoneName} with the ${powerLabel.toLowerCase()} filter active.`;
        case "route":
          return `Route focus isolates the inspection path using the ${routeLabel.toLowerCase()} slice, so the walkthrough becomes the entire working surface.`;
        case "all":
        default:
          return `Full dashboard is visible. Overview, alerts, metrics, power, and route remain available in one canvas, and Ops dock stays available below the core dashboard. Active alert slice: ${alertLabel.toLowerCase()}.`;
      }
    }

    function prepareWorkspaceFocus(nextFocus) {
      if (nextFocus === "route" && activeViewScope === "site" && activeSiteDetailView === "zones") {
        activeSiteDetailView = "averages";
      }
    }

    function getWorkspaceFocusForTarget(targetId) {
      switch (targetId) {
        case "heroStatusPanel":
        case "scenarioLabPanel":
        case "impactBoardPanel":
        case "decisionBriefPanel":
          return "overview";
        case "globalSystemCard":
          return "alerts";
        case "metricsSection":
        case "historySection":
          return "metrics";
        case "sensorHealthSection":
          return "power";
        case "zoneImpactSection":
          return "route";
        default:
          return null;
      }
    }

    function ensureWorkspaceFocusForTarget(targetId) {
      if (activeWorkspaceFocus === "all") return;

      const nextFocus = getWorkspaceFocusForTarget(targetId);
      if (!nextFocus || nextFocus === activeWorkspaceFocus) return;

      prepareWorkspaceFocus(nextFocus);
      activeWorkspaceFocus = nextFocus;
      renderDashboard();
    }

    function setWorkspaceFocus(nextFocus, options = {}) {
      const { scroll = true, force = false } = options;
      if (!["all", "overview", "alerts", "metrics", "power", "route"].includes(nextFocus)) return;

      if (nextFocus === activeWorkspaceFocus && !force) {
        if (scroll && nextFocus !== "all") {
          const focusTarget = getWorkspaceFocusForTargetByKey(nextFocus);
          if (focusTarget) scrollToSection(focusTarget);
        }
        return;
      }

      prepareWorkspaceFocus(nextFocus);
      activeWorkspaceFocus = nextFocus;
      renderDashboard();

      if (scroll && nextFocus !== "all") {
        const focusTarget = getWorkspaceFocusForTargetByKey(nextFocus);
        if (focusTarget) scrollToSection(focusTarget);
      }
    }

    function getWorkspaceFocusForTargetByKey(key) {
      switch (key) {
        case "overview":
          return "heroStatusPanel";
        case "alerts":
          return "globalSystemCard";
        case "metrics":
          return "metricsSection";
        case "power":
          return "sensorHealthSection";
        case "route":
          return "zoneImpactSection";
        default:
          return null;
      }
    }

    function formatPointDelta(delta) {
      const rounded = Math.round(delta);
      const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
      return `${sign}${Math.abs(rounded)} pts`;
    }

    function getImpactToneFromDelta(delta, currentState = "optimal") {
      if (delta >= 2) return "optimal";
      if (delta <= -10 || currentState === "critical") return "critical";
      if (delta <= -2 || currentState === "warning") return "warning";
      return "neutral";
    }

    function renderImpactBoardCards(items, options = {}) {
      const { emptyTitle, emptyNote } = options;
      if (items.length === 0) {
        return `
          <div class="workbench-empty-card">
            <div class="workbench-empty-title">${escapeHtml(emptyTitle || "No impact movers are active.")}</div>
            <p class="workbench-empty-note">${escapeHtml(emptyNote || "The current scope is aligned with the live baseline.")}</p>
          </div>
        `;
      }

      return items.map((item, index) => `
        <button
          type="button"
          class="impact-board-card"
          data-tone="${escapeAttribute(item.tone || "neutral")}"
          data-impact-index="${index}"
        >
          <div class="impact-board-card-top">
            <div class="min-w-0">
              <div class="impact-board-card-kicker">${escapeHtml(item.kicker)}</div>
              <div class="impact-board-card-title">${escapeHtml(item.title)}</div>
            </div>
            <span class="impact-board-card-delta" data-tone="${escapeAttribute(item.deltaTone || item.tone || "neutral")}">${escapeHtml(item.deltaLabel)}</span>
          </div>
          <p class="impact-board-card-note">${escapeHtml(item.note)}</p>
          <div class="impact-board-chip-row">
            ${item.chips.map((chip) => `<span class="impact-board-chip">${escapeHtml(chip)}</span>`).join("")}
          </div>
          <div class="impact-board-card-footer">
            ${escapeHtml(item.cta)}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </div>
        </button>
      `).join("");
    }

    function buildImpactBoardState(options) {
      const {
        isSiteView,
        site,
        zone,
        profile,
        results,
        displayedOverallState,
        siteSnapshots,
        manualOverride,
        manualOverrideDiffs,
        scenarioDefinition
      } = options;

      if (isSiteView) {
        const liveSnapshots = site.zones.map((siteZone) =>
          evaluateZoneSnapshot(site, siteZone, getZoneReadings(cropProfiles[siteZone.profile], siteZone, "optimal"))
        );
        const liveOverall = deriveSiteOverallState(liveSnapshots);
        const baselineByZoneId = new Map(liveSnapshots.map((snapshot) => [snapshot.zone.id, snapshot]));
        const deltaPoints = displayedOverallState.indexScore - liveOverall.indexScore;
        const cards = siteSnapshots.map((snapshot) => {
          const baselineSnapshot = baselineByZoneId.get(snapshot.zone.id);
          const scoreDelta = baselineSnapshot
            ? snapshot.overall.indexScore - baselineSnapshot.overall.indexScore
            : 0;
          const primaryResult = getPrimaryNonOptimalResult(
            snapshot.results.filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal")
          );
          const tone = getImpactToneFromDelta(scoreDelta, snapshot.overall.state);

          return {
            kicker: scoreDelta < -2 ? "Regression" : scoreDelta > 2 ? "Recovery" : "Tracked shift",
            title: snapshot.zone.name,
            note: scoreDelta === 0
              ? "This block is aligned with the live baseline right now."
              : `${snapshot.overall.indexScore}% now vs ${baselineSnapshot.overall.indexScore}% live.${primaryResult ? ` ${snapshot.profile.metrics[primaryResult.key].label} is leading the current shift.` : ""}`,
            chips: [
              `${formatPointDelta(scoreDelta)} vs live`,
              `${baselineSnapshot.overall.indexScore}% live`,
              `${snapshot.overall.indexScore}% now`
            ],
            deltaLabel: scoreDelta === 0 ? "Flat" : formatPointDelta(scoreDelta),
            deltaTone: tone,
            tone,
            cta: "Open block",
            magnitude: Math.abs(scoreDelta),
            action: { type: "open-zone", siteId: site.id, zoneId: snapshot.zone.id }
          };
        }).filter((item) => item.magnitude > 0 || manualOverride || activeScenarioKey !== "optimal")
          .sort((left, right) => right.magnitude - left.magnitude)
          .slice(0, 4);

        const summaryBase = `${site.name} moved from ${liveOverall.indexScore}% live to ${displayedOverallState.indexScore}% now.`;
        let title = `${site.name} matches the live baseline`;
        let summary = `${site.name} is still sitting on the same score as the live baseline.`;
        if (deltaPoints < 0) {
          title = manualOverride ? `Branch test is dragging ${site.name}` : `${scenarioDefinition.shortLabel} is dragging ${site.name}`;
          summary = `${summaryBase} ${formatPointDelta(deltaPoints)} against live conditions.`;
        } else if (deltaPoints > 0) {
          title = manualOverride ? `Branch test is improving ${site.name}` : `${scenarioDefinition.shortLabel} is improving ${site.name}`;
          summary = `${summaryBase} ${formatPointDelta(deltaPoints)} against live conditions.`;
        }

        const meta = manualOverride
          ? `Manual block changes are layered on top of the ${scenarioDefinition.shortLabel.toLowerCase()} preset and compared here against the live baseline.`
          : activeScenarioKey === "optimal"
            ? "This board compares the active location score against the live baseline so you can see whether the current location context is actually moving."
            : `This board compares the ${scenarioDefinition.shortLabel.toLowerCase()} drill against the live baseline across every block in ${site.name}.`;

        const topCard = cards[0] || null;
        const action = manualOverride
          ? { type: "reset-test", label: "Reset manual test" }
          : activeScenarioKey !== "optimal"
            ? { type: "restore-live", label: "Return to live baseline" }
            : topCard
              ? { ...topCard.action, label: "Open top mover" }
              : { type: "open-analytics", label: "Open analytics" };

        return {
          state: getImpactToneFromDelta(deltaPoints, displayedOverallState.state),
          title,
          summary,
          meta,
          baselineScore: `${liveOverall.indexScore}%`,
          currentScore: `${displayedOverallState.indexScore}%`,
          deltaChip: deltaPoints === 0 ? "No shift" : formatPointDelta(deltaPoints),
          cards,
          action
        };
      }

      const liveSnapshot = evaluateZoneSnapshot(site, zone, getZoneReadings(profile, zone, "optimal"));
      const baselineByKey = new Map(liveSnapshot.results.map((result) => [result.key, result]));
      const deltaPoints = displayedOverallState.indexScore - liveSnapshot.overall.indexScore;
      const cards = results
        .filter((result) => result.available !== false && isGrowthMetricKey(result.key))
        .map((result) => {
          const baselineResult = baselineByKey.get(result.key);
          const definition = profile.metrics[result.key];
          const severityDelta = result.severity - baselineResult.severity;
          const valueDelta = roundValue(result.value - baselineResult.value, definition.decimals);
          const magnitude = Math.abs(severityDelta);
          const tone = severityDelta > 0.03
            ? result.state === "critical" ? "critical" : "warning"
            : severityDelta < -0.03
              ? "optimal"
              : result.state === "optimal"
                ? "neutral"
                : result.state;
          const group = getMetricWorkbenchGroup(result.key);

          return {
            kicker: severityDelta > 0.03 ? "Regression" : severityDelta < -0.03 ? "Recovery" : "Tracked shift",
            title: definition.label,
            note: `${formatSignedValue(valueDelta, definition)} vs live baseline. ${baselineResult.state === result.state ? `Still ${stateConfig[result.state].shortLabel}.` : `${stateConfig[baselineResult.state].shortLabel} -> ${stateConfig[result.state].shortLabel}.`}`,
            chips: [
              `${formatValue(baselineResult.value, definition)} live`,
              `${formatValue(result.value, definition)} now`,
              group.label
            ],
            deltaLabel: severityDelta > 0.03 ? "Worse" : severityDelta < -0.03 ? "Better" : "Shifted",
            deltaTone: tone,
            tone,
            cta: `Open ${group.label}`,
            magnitude,
            action: { type: "open-lens", lensKey: group.key === "other" ? "all" : `group-${group.key}`, targetId: "metricsSection" }
          };
        })
        .filter((item) => item.magnitude > 0.01 || manualOverride || activeScenarioKey !== "optimal")
        .sort((left, right) => right.magnitude - left.magnitude)
        .slice(0, 4);

      const summaryBase = `${zone.name} moved from ${liveSnapshot.overall.indexScore}% live to ${displayedOverallState.indexScore}% now.`;
      let title = `${zone.name} matches the live baseline`;
      let summary = `${zone.name} is still sitting on the same score as the live baseline.`;
      if (deltaPoints < 0) {
        title = manualOverride ? `Branch test is dragging ${zone.name}` : `${scenarioDefinition.shortLabel} is dragging ${zone.name}`;
        summary = `${summaryBase} ${formatPointDelta(deltaPoints)} against live conditions.`;
      } else if (deltaPoints > 0) {
        title = manualOverride ? `Branch test is improving ${zone.name}` : `${scenarioDefinition.shortLabel} is improving ${zone.name}`;
        summary = `${summaryBase} ${formatPointDelta(deltaPoints)} against live conditions.`;
      }

      const meta = manualOverride
        ? `Manual slider changes are layered on top of the ${scenarioDefinition.shortLabel.toLowerCase()} preset and compared here against the live baseline.`
        : activeScenarioKey === "optimal"
          ? "This board compares the active block score against the live baseline so you can see whether the current readings are truly moving."
          : `This board compares the ${scenarioDefinition.shortLabel.toLowerCase()} drill against the live baseline inside ${zone.name}.`;

      const topCard = cards[0] || null;
      const action = manualOverride
        ? { type: "reset-test", label: "Reset manual test" }
        : activeScenarioKey !== "optimal"
          ? { type: "restore-live", label: "Return to live baseline" }
          : topCard
            ? { ...topCard.action, label: "Open top mover" }
            : { type: "open-analytics", label: "Open analytics" };

      return {
        state: getImpactToneFromDelta(deltaPoints, displayedOverallState.state),
        title,
        summary,
        meta,
        baselineScore: `${liveSnapshot.overall.indexScore}%`,
        currentScore: `${displayedOverallState.indexScore}%`,
        deltaChip: deltaPoints === 0 ? "No shift" : formatPointDelta(deltaPoints),
        cards,
        action
      };
    }

    function executeImpactBoardAction(action) {
      if (!action) return;

      switch (action.type) {
        case "reset-test":
          resetManualTest();
          return;
        case "restore-live":
          applyScenarioPreset("optimal");
          return;
        case "open-zone":
          openZoneDetail(action.siteId, action.zoneId);
          return;
        case "open-lens":
          activeWorkbenchLensKey = action.lensKey || "all";
          renderDashboard();
          scrollToSection(action.targetId || "metricsSection");
          return;
        case "open-analytics":
          runDashboardAction("analytics");
          return;
        default:
          return;
      }
    }

    function renderDecisionBriefChips(chips) {
      return chips.map((chip) => `<span class="decision-brief-chip">${escapeHtml(chip)}</span>`).join("");
    }

    function fallbackCopyText(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }

      document.body.removeChild(textarea);
      return copied;
    }

    async function copyTextToClipboard(text) {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (error) {
        }
      }

      return fallbackCopyText(text);
    }

    function setDecisionBriefStatus(message, tone = "neutral") {
      if (decisionBriefStatusTimeoutId) {
        window.clearTimeout(decisionBriefStatusTimeoutId);
        decisionBriefStatusTimeoutId = null;
      }

      elements.decisionBriefStatus.textContent = message;
      elements.decisionBriefStatus.dataset.tone = tone;

      if (tone !== "neutral") {
        decisionBriefStatusTimeoutId = window.setTimeout(() => {
          elements.decisionBriefStatus.textContent = "Ready to share";
          elements.decisionBriefStatus.dataset.tone = "neutral";
          decisionBriefStatusTimeoutId = null;
        }, 2200);
      }
    }

    async function copyDecisionBrief(kind = "detailed") {
      const text = kind === "short"
        ? currentDecisionBriefPayload.shortText
        : currentDecisionBriefPayload.detailedText;
      if (!text) {
        setDecisionBriefStatus("Brief unavailable", "warning");
        return;
      }

      const copied = await copyTextToClipboard(text);
      setDecisionBriefStatus(
        copied
          ? kind === "short" ? "Short copied" : "Brief copied"
          : "Copy failed",
        copied ? "success" : "warning"
      );
    }

    function buildDecisionBrief(options) {
      const {
        isSiteView,
        site,
        zone,
        displayedOverallState,
        scenarioDefinition,
        manualOverride,
        impactBoardState,
        actionDeck,
        activeAlertRailFilter,
        filteredAlertRailItems,
        activeSensorHealthFilter,
        filteredSensorHealthNodes,
        activeInspectionRouteFilter,
        filteredInspectionRouteItems,
        heroDecision
      } = options;

      const scopeLabel = isSiteView
        ? `Site: ${site.name}`
        : `Zone: ${zone.name} (${site.name})`;
      const scenarioLabel = manualOverride
        ? `Manual branch on ${scenarioDefinition.shortLabel}`
        : scenarioDefinition.label;
      const queueCards = actionDeck.cards || [];
      const nowAction = queueCards[0]?.title || "Review current scope";
      const nextAction = queueCards[1]?.title || "Validate trust layer";
      const laterAction = queueCards[2]?.title || "Widen context";
      const routeLabel = activeInspectionRouteFilter?.label || "Focus";
      const powerLabel = activeSensorHealthFilter?.label || "Focus";
      const shortText = `${scopeLabel} | ${stateConfig[displayedOverallState.state].shortLabel} ${displayedOverallState.indexScore}% | Scenario: ${scenarioLabel} | Impact: ${impactBoardState.deltaChip} vs live | Now: ${nowAction} | Alerts: ${filteredAlertRailItems.length} ${activeAlertRailFilter.label.toLowerCase()} | Power: ${filteredSensorHealthNodes.length} ${powerLabel.toLowerCase()} nodes`;
      const detailedText = [
        `${scopeLabel}`,
        `Score: ${displayedOverallState.indexScore}% (${stateConfig[displayedOverallState.state].shortLabel})`,
        `Scenario: ${scenarioLabel}`,
        `Impact vs live: ${impactBoardState.deltaChip}`,
        `Primary focus: ${heroDecision.focusValue}`,
        `Queue now: ${nowAction}`,
        `Queue next: ${nextAction}`,
        `Queue later: ${laterAction}`,
        `Alerts: ${filteredAlertRailItems.length} visible in ${activeAlertRailFilter.label.toLowerCase()} lane`,
        `Route: ${filteredInspectionRouteItems.length} items in ${routeLabel.toLowerCase()} route`,
        `Power: ${filteredSensorHealthNodes.length} nodes in ${powerLabel.toLowerCase()} triage`
      ].join("\n");
      const preview = [
        scopeLabel,
        `Score ${displayedOverallState.indexScore}% (${stateConfig[displayedOverallState.state].shortLabel})`,
        `Scenario: ${scenarioLabel}`,
        `Impact: ${impactBoardState.deltaChip} vs live`,
        `Now: ${nowAction}`,
        `Next: ${nextAction}`,
        `Later: ${laterAction}`,
        `Alerts: ${filteredAlertRailItems.length} in ${activeAlertRailFilter.label.toLowerCase()}`,
        `Route: ${filteredInspectionRouteItems.length} in ${routeLabel.toLowerCase()}`,
        `Power: ${filteredSensorHealthNodes.length} nodes in ${powerLabel.toLowerCase()}`
      ].join("\n");
      const chips = [
        `${displayedOverallState.indexScore}% ${stateConfig[displayedOverallState.state].shortLabel}`,
        scenarioLabel,
        impactBoardState.deltaChip,
        `${filteredAlertRailItems.length} alerts`,
        `${filteredInspectionRouteItems.length} route`,
        `${filteredSensorHealthNodes.length} power`
      ];

      return {
        title: manualOverride
          ? "Manual branch brief is ready"
          : activeScenarioKey !== "optimal"
            ? `${scenarioDefinition.shortLabel} brief is ready`
            : "Live state brief is ready",
        summary: "Copy a short or detailed operating note with the current score, scenario, impact, queue, alerts, route, and power trust already filled in.",
        preview,
        shortText,
        detailedText,
        chips
      };
    }

    function getAdvancedToolsState(options) {
      const { scenarioDefinition, manualOverride, scenarioTone } = options;

      if (manualOverride) {
        return {
          state: scenarioTone,
          title: "Advanced tools are active",
          summary: "Manual testing is active. Open this area to compare impact, tune the scenario branch, or copy a handoff note.",
          chipLabel: "Manual active"
        };
      }

      if (activeScenarioKey !== "optimal") {
        return {
          state: scenarioTone,
          title: "Scenario drill is active",
          summary: `${scenarioDefinition.label} is active. Open this area to compare against live baseline or prepare a brief for the team.`,
          chipLabel: scenarioDefinition.shortLabel
        };
      }

      return {
        state: "optimal",
        title: "Scenario tests and handoff tools",
        summary: "Optional tools for simulations, impact comparison, and sharing. Safe to ignore if you only want the live growth score and the next action.",
        chipLabel: "Optional"
      };
    }

    function syncStickyOffsets() {
      const headerHeight = elements.appHeader?.offsetHeight || 78;
      document.documentElement.style.setProperty("--dashboard-header-height", `${headerHeight}px`);
    }

    function resetOpsDockView() {
      sidebarActionOverride = null;
      activeWorkbenchLensKey = "focus";
      activeInspectionRouteFilterKey = "focus";
      activeAlertRailFilterKey = "all";
      activeSensorHealthFilterKey = "focus";
      activeWorkspaceFocus = "all";
      if (activeViewScope === "site" && activeSiteDetailView === "zones") {
        activeSiteDetailView = "averages";
      }
      renderDashboard();
    }

    function runOpsDockAction(action) {
      const site = getActiveSite();

      switch (action) {
        case "scenario":
          scrollToSection("scenarioLabPanel");
          return;
        case "route":
          if (site && activeViewScope === "site" && activeSiteDetailView === "zones") {
            openSiteView(site.id, "averages");
          }
          scrollToSection("zoneImpactSection");
          return;
        case "workbench":
          runDashboardAction("analytics");
          return;
        case "alerts":
          runDashboardAction("alerts");
          return;
        case "power":
          scrollToSection("sensorHealthSection");
          return;
        case "reset-view":
          resetOpsDockView();
          return;
        case "reset-test":
          resetManualTest();
          return;
        default:
          return;
      }
    }

    function buildInspectionRouteState(options) {
      const { isSiteView, site, zone, profile, siteSnapshots, nonOptimalResults } = options;

      if (isSiteView) {
        const allItems = [...siteSnapshots]
          .sort((left, right) => left.overall.indexScore - right.overall.indexScore)
          .map((snapshot, index) => {
            const labels = snapshot.results
              .filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal")
              .map((item) => snapshot.profile.metrics[item.key].label);

            return {
              step: index + 1,
              state: snapshot.overall.state,
              kicker: snapshot.overall.state === "optimal" ? "Stability check" : "Walk stop",
              title: snapshot.zone.name,
              summary: snapshot.overall.state === "optimal"
                ? "This block is stable, so it can be inspected later in the route."
                : labels.length > 0
                  ? `Start here for ${joinLabels(labels.slice(0, 2).map((label) => label.toLowerCase()))}.`
                  : "This block is the next stop in the inspection route.",
              metaChips: [snapshot.profile.name, `${snapshot.zone.sensorCount} nodes`],
              scoreLabel: "Block score",
              scoreValue: `${snapshot.overall.indexScore}%`,
              actionLabel: "Open block",
              siteId: snapshot.site.id,
              zoneId: snapshot.zone.id,
              groupKey: snapshot.overall.state
            };
          });

        const criticalCount = allItems.filter((item) => item.state === "critical").length;
        const warningCount = allItems.filter((item) => item.state === "warning").length;
        const stableCount = allItems.filter((item) => item.state === "optimal").length;
        const filters = [
          {
            key: "focus",
            label: "Focus",
            count: Math.min(3, allItems.length),
            tone: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "optimal",
            description: allItems.length > 0
              ? `Start with the first ${Math.min(3, allItems.length)} stops to reduce uncertainty in ${site.name} fastest.`
              : `No route stops are visible for ${site.name}.`
          },
          {
            key: "critical",
            label: "Critical",
            count: criticalCount,
            tone: "critical",
            description: criticalCount > 0
              ? `${criticalCount} blocks need immediate attention before the rest of the walkthrough.`
              : "No critical route stops are active right now."
          },
          {
            key: "warning",
            label: "Warning",
            count: warningCount,
            tone: "warning",
            description: warningCount > 0
              ? `${warningCount} blocks are drifting and should be inspected after the red stops.`
              : "No warning route stops are active right now."
          },
          {
            key: "all",
            label: "Full route",
            count: allItems.length,
            tone: stableCount > 0 ? "optimal" : "neutral",
            description: `Showing the full ordered walkthrough across ${site.name}.`
          }
        ];

        return {
          items: allItems,
          filters,
          defaultKey: allItems.some((item) => item.state !== "optimal") ? "focus" : "all"
        };
      }

      const routeItems = nonOptimalResults
        .slice()
        .sort((left, right) => right.severity - left.severity)
        .map((item, index) => {
          const definition = profile.metrics[item.key];
          const group = getMetricWorkbenchGroup(item.key);

          return {
            step: index + 1,
            state: item.state,
            kicker: `${group.label} stop`,
            title: definition.zone,
            summary: definition.action,
            metaChips: [definition.label, formatValue(item.value, definition), item.deviationText],
            scoreLabel: group.label,
            scoreValue: stateConfig[item.state].shortLabel,
            actionLabel: `Open ${group.label}`,
            routeLensKey: group.key === "other" ? "all" : `group-${group.key}`,
            routeTargetId: "metricsSection",
            groupKey: group.key
          };
        });

      const criticalCount = routeItems.filter((item) => item.state === "critical").length;
      const warningCount = routeItems.filter((item) => item.state === "warning").length;
      const groupCounts = routeItems.reduce((acc, item) => {
        acc[item.groupKey] = (acc[item.groupKey] || 0) + 1;
        return acc;
      }, {});
      const filters = [
        {
          key: "focus",
          label: "Focus",
          count: Math.min(3, routeItems.length),
          tone: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "optimal",
          description: routeItems.length > 0
            ? `Start with the first ${Math.min(3, routeItems.length)} in-block checks to stabilize ${zone.name} fastest.`
            : `No in-block checks are currently required for ${zone.name}.`
        },
        {
          key: "critical",
          label: "Critical",
          count: criticalCount,
          tone: "critical",
            description: criticalCount > 0
              ? `${criticalCount} checks are urgent and should be walked first.`
            : "No critical in-block checks are active right now."
        },
        {
          key: "warning",
          label: "Warning",
          count: warningCount,
          tone: "warning",
            description: warningCount > 0
              ? `${warningCount} checks are drifting and should follow the critical stops.`
            : "No warning in-block checks are active right now."
        },
        {
          key: "all",
          label: "Full route",
          count: routeItems.length,
          tone: routeItems.length > 0 ? "warning" : "optimal",
          description: `Showing the full in-block walkthrough for ${zone.name}.`
        }
      ];

      ["climate", "root", "feed"].forEach((groupKey) => {
        const count = groupCounts[groupKey] || 0;
        if (count === 0) return;
        const group = getMetricWorkbenchGroup(groupKey === "climate" ? "airTemp" : groupKey === "root" ? "soilTemp" : "ec");
        filters.push({
          key: `group-${group.key}`,
          label: group.label,
          count,
          tone: "neutral",
          description: `Showing ${count} ${group.label.toLowerCase()} checks inside ${zone.name}.`
        });
      });

      return {
        items: routeItems,
        filters,
        defaultKey: routeItems.length > 0 ? "focus" : "all"
      };
    }

    function renderSiteZoneCards(siteSnapshots) {
      return [...siteSnapshots]
        .sort((left, right) => left.overall.indexScore - right.overall.indexScore)
        .map((snapshot, index) => {
          const labels = snapshot.results
            .filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal")
            .map((item) => snapshot.profile.metrics[item.key].label.toLowerCase());

          const summary = snapshot.overall.state === "optimal"
            ? "All key metrics are within target."
            : labels.length > 0
              ? `Watch ${joinLabels(labels.slice(0, 2))}.`
              : "This block needs attention.";

          return `
            <button
              type="button"
              class="site-zone-driver-card"
              data-state="${snapshot.overall.state}"
              data-zone-drill-site-id="${escapeAttribute(snapshot.site.id)}"
              data-zone-drill-id="${escapeAttribute(snapshot.zone.id)}"
            >
              <div class="site-zone-driver-rank">${index + 1}</div>
              <div class="site-zone-driver-main">
                <div class="site-zone-driver-head">
                  <div class="min-w-0">
                    <h4 class="site-zone-driver-title">${escapeHtml(snapshot.zone.name)}</h4>
                    <p class="site-zone-driver-profile">${escapeHtml(snapshot.profile.name)}</p>
                  </div>
                  <span class="state-chip metric-state-chip shrink-0" data-state="${snapshot.overall.state}">${stateConfig[snapshot.overall.state].label}</span>
                </div>
                <p class="site-zone-driver-summary">${escapeHtml(summary)}</p>
              </div>
              <div class="site-zone-driver-score">
                <div class="site-zone-driver-score-label">Block score</div>
                <div class="site-zone-driver-score-value">${snapshot.overall.indexScore}%</div>
                <div class="site-zone-driver-link">
                  Open block
                  <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </div>
              </div>
            </button>
          `;
        })
        .join("");
    }

    function summarizeSiteMetric(siteSnapshots, key) {
      const samples = siteSnapshots.flatMap((snapshot) => {
        const result = snapshot.results.find((item) => item.key === key);
        if (!result || result.available === false) return [];

        return [{
          result,
          definition: snapshot.profile.metrics[key]
        }];
      });

      if (samples.length === 0) return null;

      const definition = samples[0].definition;
      const averageValue = roundValue(
        samples.reduce((sum, sample) => sum + sample.result.value, 0) / samples.length,
        definition.decimals
      );
      const averageSeverity = samples.reduce((sum, sample) => sum + sample.result.severity, 0) / samples.length;
      const averageIndex = Math.max(0, 100 - Math.round(averageSeverity * 100));
      const averageOptimal = [
        roundValue(samples.reduce((sum, sample) => sum + sample.definition.optimal[0], 0) / samples.length, definition.decimals),
        roundValue(samples.reduce((sum, sample) => sum + sample.definition.optimal[1], 0) / samples.length, definition.decimals)
      ];
      const criticalCount = samples.filter((sample) => sample.result.state === "critical").length;
      const warningCount = samples.filter((sample) => sample.result.state === "warning").length;

      return {
        key,
        definition,
        averageValue,
        averageOptimal,
        state: deriveStateFromIndexScore(averageIndex),
        averageIndex,
        coverage: samples.length,
        totalZones: siteSnapshots.length,
        criticalCount,
        warningCount
      };
    }

    function renderSiteAverageCards(siteSnapshots) {
      const metricKeys = [...new Set(siteSnapshots.flatMap((snapshot) =>
        Object.keys(snapshot.profile.metrics).filter((key) => isGrowthMetricKey(key))
      ))];

      return metricKeys
        .map((key) => summarizeSiteMetric(siteSnapshots, key))
        .filter(Boolean)
        .sort((left, right) => left.averageIndex - right.averageIndex)
        .map((summary) => {
          const category = getMetricCategory(summary.key);
          const siteStateText = summary.criticalCount > 0
            ? `${summary.criticalCount} critical block${summary.criticalCount === 1 ? "" : "s"}`
            : summary.warningCount > 0
              ? `${summary.warningCount} warning block${summary.warningCount === 1 ? "" : "s"}`
              : `Stable across ${summary.coverage}/${summary.totalZones} blocks`;

          return `
            <article class="metric-card p-4" data-state="${summary.state}">
              <div class="metric-card-head flex items-start justify-between gap-3">
                <div>
                  <div class="metric-category-badge"><i class="fa-solid ${category.icon}"></i>${category.label}</div>
                  <p class="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/42">${formatRange(summary.averageOptimal, summary.definition)}</p>
                </div>
                <div class="flex flex-col items-end gap-2 text-right">
                  <span class="state-chip metric-state-chip" data-state="${summary.state}">${stateConfig[summary.state].label}</span>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Location avg · ${summary.coverage}/${summary.totalZones} blocks</p>
                </div>
              </div>
              <div class="metric-value-row mt-2" data-has-deviation="true">
                <div class="metric-deviation font-semibold text-ink/54">${siteStateText}</div>
                <div class="metric-value-shell">
                  <div class="metric-current-value font-extrabold text-ink">${formatValue(summary.averageValue, summary.definition)}</div>
                </div>
              </div>
              ${renderMetricHistoryButton(summary.key)}
            </article>
          `;
        })
        .join("");
    }

    function buildSiteAverageSummaries(siteSnapshots) {
      const metricKeys = [...new Set(siteSnapshots.flatMap((snapshot) =>
        Object.keys(snapshot.profile.metrics).filter((key) => isGrowthMetricKey(key))
      ))];

      return metricKeys
        .map((key) => summarizeSiteMetric(siteSnapshots, key))
        .filter(Boolean)
        .sort((left, right) => left.averageIndex - right.averageIndex);
    }

    function renderSiteAverageSummaryCards(summaries) {
      return summaries
        .map((summary) => {
          const category = getMetricCategory(summary.key);
          const siteStateText = summary.criticalCount > 0
            ? `${summary.criticalCount} critical block${summary.criticalCount === 1 ? "" : "s"}`
            : summary.warningCount > 0
              ? `${summary.warningCount} warning block${summary.warningCount === 1 ? "" : "s"}`
              : `Stable across ${summary.coverage}/${summary.totalZones} blocks`;

          return `
            <article class="metric-card p-4" data-state="${summary.state}">
              <div class="metric-card-head flex items-start justify-between gap-3">
                <div>
                  <div class="metric-category-badge"><i class="fa-solid ${category.icon}"></i>${category.label}</div>
                  <p class="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/42">${formatRange(summary.averageOptimal, summary.definition)}</p>
                </div>
                <div class="flex flex-col items-end gap-2 text-right">
                  <span class="state-chip metric-state-chip" data-state="${summary.state}">${stateConfig[summary.state].label}</span>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Location avg &middot; ${summary.coverage}/${summary.totalZones} blocks</p>
                </div>
              </div>
              <div class="metric-value-row mt-2" data-has-deviation="true">
                <div class="metric-deviation font-semibold text-ink/54">${siteStateText}</div>
                <div class="metric-value-shell">
                  <div class="metric-current-value font-extrabold text-ink">${formatValue(summary.averageValue, summary.definition)}</div>
                </div>
              </div>
            </article>
          `;
        })
        .join("");
    }

    function buildWorkbenchLenses(options) {
      const {
        isSiteView,
        isSiteHotspotsView,
        site,
        zone,
        growthResults,
        availableResults,
        unavailableResults,
        siteSnapshots,
        siteAverageSummaries
      } = options;
      const lenses = [];

      if (isSiteHotspotsView) {
        const focusCount = siteSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
        const criticalCount = siteSnapshots.filter((snapshot) => snapshot.overall.state === "critical").length;
        const warningCount = siteSnapshots.filter((snapshot) => snapshot.overall.state === "warning").length;
        const stableCount = siteSnapshots.filter((snapshot) => snapshot.overall.state === "optimal").length;

        lenses.push(
          {
            key: "focus",
            label: "Focus",
            icon: "fa-crosshairs",
            tone: focusCount > 0 ? "warning" : "optimal",
            count: focusCount,
            description: focusCount > 0
              ? `${focusCount} blocks are currently pulling ${site.name} down.`
              : `No blocks are dragging ${site.name} down right now.`
          },
          {
            key: "all",
            label: "All blocks",
            icon: "fa-layer-group",
            tone: "neutral",
            count: siteSnapshots.length,
            description: `Showing every block ranked by the drag it puts on ${site.name}.`
          }
        );

        if (criticalCount > 0) {
          lenses.push({
            key: "state-critical",
            kind: "state",
            stateKey: "critical",
            label: "Critical",
            icon: "fa-triangle-exclamation",
            tone: "critical",
            count: criticalCount,
            description: `${criticalCount} blocks need an immediate walk-through.`
          });
        }

        if (warningCount > 0) {
          lenses.push({
            key: "state-warning",
            kind: "state",
            stateKey: "warning",
            label: "Warning",
            icon: "fa-bell",
            tone: "warning",
            count: warningCount,
            description: `${warningCount} blocks are showing drift before they tip red.`
          });
        }

        if (stableCount > 0) {
          lenses.push({
            key: "state-optimal",
            kind: "state",
            stateKey: "optimal",
            label: "Stable",
            icon: "fa-check",
            tone: "optimal",
            count: stableCount,
            description: `${stableCount} blocks remain stable under the active model.`
          });
        }

        return {
          lenses,
          defaultKey: focusCount > 0 ? "focus" : "all"
        };
      }

      const groupKeys = ["climate", "root", "feed"];

      if (isSiteView) {
        const focusCount = siteAverageSummaries.filter((summary) => summary.state !== "optimal" || summary.coverage < summary.totalZones).length;
        const coverageCount = siteAverageSummaries.filter((summary) => summary.coverage < summary.totalZones).length;

        lenses.push(
          {
            key: "focus",
            label: "Focus",
            icon: "fa-crosshairs",
            tone: focusCount > 0 ? "warning" : "optimal",
            count: focusCount,
            description: focusCount > 0
              ? `${focusCount} averages need attention or are built from partial coverage.`
              : `All location averages are stable and fully covered right now.`
          },
          {
            key: "all",
            label: "All averages",
            icon: "fa-layer-group",
            tone: "neutral",
            count: siteAverageSummaries.length,
            description: `Showing every location-level average for ${site.name}.`
          }
        );

        if (coverageCount > 0) {
          lenses.push({
            key: "coverage",
            label: "Coverage gaps",
            icon: "fa-wave-square",
            tone: "warning",
            count: coverageCount,
            description: `${coverageCount} location averages are being computed from partial block coverage.`
          });
        }

        groupKeys.forEach((groupKey) => {
          const group = getMetricWorkbenchGroup(groupKey === "climate" ? "airTemp" : groupKey === "root" ? "soilTemp" : "ec");
          const count = siteAverageSummaries.filter((summary) => getMetricWorkbenchGroup(summary.key).key === groupKey).length;
          if (count === 0) return;

          lenses.push({
            key: `group-${group.key}`,
            kind: "group",
            groupKey: group.key,
            label: group.label,
            icon: group.icon,
            tone: "neutral",
            count,
            description: `Showing ${count} ${group.label.toLowerCase()} averages across ${site.name}.`
          });
        });

        return {
          lenses,
          defaultKey: focusCount > 0 ? "focus" : "all"
        };
      }

      const focusCount = availableResults.filter((item) => item.state !== "optimal").length;
      const coverageCount = unavailableResults.length;

      lenses.push(
        {
          key: "focus",
          label: "Focus",
          icon: "fa-crosshairs",
          tone: focusCount > 0 ? "warning" : "optimal",
          count: focusCount,
          description: focusCount > 0
            ? `${focusCount} live metrics are actively pushing ${zone.name} off target.`
            : `${zone.name} has no live growth metrics outside the target band right now.`
        },
        {
          key: "all",
          label: "All metrics",
          icon: "fa-layer-group",
          tone: "neutral",
          count: availableResults.length,
          description: `Showing all live growth metrics for ${zone.name}.`
        }
      );

      if (coverageCount > 0) {
        lenses.push({
          key: "coverage",
          label: "Coverage gaps",
          icon: "fa-wave-square",
          tone: "warning",
          count: coverageCount,
          description: `${coverageCount} growth metrics are missing sensors in ${zone.name}.`
        });
      }

      groupKeys.forEach((groupKey) => {
        const group = getMetricWorkbenchGroup(groupKey === "climate" ? "airTemp" : groupKey === "root" ? "soilTemp" : "ec");
        const count = growthResults.filter((item) => getMetricWorkbenchGroup(item.key).key === groupKey).length;
        if (count === 0) return;

        lenses.push({
          key: `group-${group.key}`,
          kind: "group",
          groupKey: group.key,
          label: group.label,
          icon: group.icon,
          tone: "neutral",
          count,
          description: `Showing ${count} ${group.label.toLowerCase()} metrics for ${zone.name}.`
        });
      });

      return {
        lenses,
        defaultKey: focusCount > 0 ? "focus" : "all"
      };
    }

    function filterSiteHotspotsByWorkbenchLens(siteSnapshots, lens) {
      if (!lens || lens.key === "all") return siteSnapshots;
      if (lens.key === "focus") return siteSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal");
      if (lens.kind === "state") return siteSnapshots.filter((snapshot) => snapshot.overall.state === lens.stateKey);
      return siteSnapshots;
    }

    function filterSiteAverageSummariesByWorkbenchLens(summaries, lens) {
      if (!lens || lens.key === "all") return summaries;
      if (lens.key === "focus") {
        return summaries.filter((summary) => summary.state !== "optimal" || summary.coverage < summary.totalZones);
      }
      if (lens.key === "coverage") {
        return summaries.filter((summary) => summary.coverage < summary.totalZones);
      }
      if (lens.kind === "group") {
        return summaries.filter((summary) => getMetricWorkbenchGroup(summary.key).key === lens.groupKey);
      }
      return summaries;
    }

    function filterZoneGrowthResultsByWorkbenchLens(results, lens) {
      if (!lens || lens.key === "all") return results;
      if (lens.key === "focus") {
        return results.filter((result) => result.available !== false && result.state !== "optimal");
      }
      if (lens.key === "coverage") {
        return results.filter((result) => result.available === false);
      }
      if (lens.kind === "group") {
        return results.filter((result) => getMetricWorkbenchGroup(result.key).key === lens.groupKey);
      }
      return results;
    }

    function getActiveSite() {
      return dashboardData.sites.find((site) => site.id === activeSiteId) || dashboardData.sites[0] || null;
    }

    function getActiveZone(site = getActiveSite()) {
      if (!site || !Array.isArray(site.zones) || site.zones.length === 0) return null;

      return site.zones.find((zone) => zone.id === activeZoneId) || site.zones[0];
    }

    function resetCurrentReadingsFromActiveZone() {
      syncProfileFromZone();
      const zone = getActiveZone();
      expandedLiveMetricKey = "";
      if (zone && isApiDataMode()) {
        const cachedResponse = latestReadingsBySectionId[zone.id];
        currentReadings = cachedResponse ? readingsFromApiObservations(cachedResponse) : {};
        fetchLatestReadingsForZone(zone.id);
      } else {
        currentReadings = zone
          ? { ...getZoneReadings(cropProfiles[activeProfileKey], zone, activeScenarioKey) }
          : {};
      }
      manualOverride = false;
      return zone;
    }

    function syncProfileFromZone() {
      const zone = getActiveZone();
      if (!zone) return;
      activeProfileKey = zone.profile;
    }

    function refreshDashboardDataFromStore() {
      if (!window.NeuroCropStore) return;

      dashboardData = window.NeuroCropStore.getDashboardData();
      if (!dashboardData.sites.length) return;
      const activeSite = getActiveSite();
      const activeZone = getActiveZone(activeSite);
      if (!activeSite || !activeZone) return;

      renderSiteOptions();
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
    }

    function setMenuState(cardTrigger, menu, isOpen) {
      cardTrigger.setAttribute("aria-expanded", String(isOpen));
      menu.hidden = !isOpen;
      const card = cardTrigger.closest(".context-card");
      if (card) card.dataset.open = isOpen ? "true" : "false";
    }

    function closeContextMenus() {
      setMenuState(elements.siteTrigger, elements.siteMenu, false);
      setMenuState(elements.zoneTrigger, elements.zoneMenu, false);
      setMenuState(elements.historyLocationTrigger, elements.historyLocationMenu, false);
      setMenuState(elements.historyBlockTrigger, elements.historyBlockMenu, false);
    }

    function scheduleDashboardRender() {
      if (dashboardRenderTimeoutId) {
        window.clearTimeout(dashboardRenderTimeoutId);
      }
      window.requestAnimationFrame(() => {
        dashboardRenderTimeoutId = window.setTimeout(() => {
          dashboardRenderTimeoutId = null;
          renderDashboard();
        }, 0);
      });
    }

    function getContextScoreSummary(overall) {
      if (!overall || !Number.isFinite(overall.indexScore)) {
        return {
          score: "--",
          state: "neutral",
          label: interfaceLanguage === "lt" ? "Nėra duomenų" : "No data",
          text: interfaceLanguage === "lt" ? "Auginimo sąlygų įvertis --" : "Growing conditions score --"
        };
      }

      const label = translateInterfaceText(getHealthStateLabel(overall.state));
      return {
        score: String(overall.indexScore),
        state: overall.state,
        label,
        text: interfaceLanguage === "lt"
          ? `Auginimo sąlygų įvertis ${overall.indexScore} · ${label}`
          : `Growing conditions score ${overall.indexScore} · ${label}`
      };
    }

    function getContextMenuSnapshots() {
      return dashboardData.sites.flatMap((site) =>
        site.zones.map((zone) => evaluateZoneSnapshot(site, zone))
      );
    }

    let enhancedSelectId = 0;

    function getEnhancedSelectOptionScore(select, value, snapshots) {
      if (!value || value === "all") return null;

      const areaSelectNames = new Set([
        "blockSiteId",
        "nodeSiteId",
        "nodeFilterSiteId",
        "modalLocationMoveTarget",
        "modalBlockSiteId"
      ]);
      const sectionSelectNames = new Set([
        "nodeZoneId",
        "nodeFilterZoneId"
      ]);
      const isAreaSelect = areaSelectNames.has(select.name) || select.hasAttribute("data-block-filter-select");

      if (isAreaSelect) {
        const site = dashboardData.sites.find((item) => item.id === value);
        if (!site) return null;
        const siteSnapshots = snapshots.filter((snapshot) => snapshot.site.id === site.id);
        return getContextScoreSummary(
          siteSnapshots.length > 0 ? deriveSiteOverallState(siteSnapshots) : null
        );
      }

      let zoneId = value;
      let siteId = "";
      if (select.name === "modalNodeAssignment") {
        [siteId, zoneId] = value.split("|");
      } else if (!sectionSelectNames.has(select.name)) {
        return null;
      }

      const snapshot = snapshots.find((item) =>
        item.zone.id === zoneId && (!siteId || item.site.id === siteId)
      );
      return getContextScoreSummary(snapshot?.overall || null);
    }

    function renderEnhancedSelectScore(score) {
      if (!score) return "";
      return `
        <span class="context-menu-score" data-state="${escapeAttribute(score.state)}">
          <span class="context-score-dot" aria-hidden="true"></span>
          <strong>${escapeHtml(score.score)}</strong>
        </span>
      `;
    }

    function closeEnhancedSelectMenus(except = null) {
      document.querySelectorAll(".nc-select[data-open='true']").forEach((wrapper) => {
        if (wrapper === except) return;
        wrapper.dataset.open = "false";
        const trigger = wrapper.querySelector("[data-nc-select-trigger]");
        const menu = wrapper.querySelector("[data-nc-select-menu]");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
        if (menu) menu.hidden = true;
      });
    }

    function syncEnhancedSelect(select, snapshots = null) {
      const wrapper = select?.closest(".nc-select");
      if (!wrapper) return;

      const selectedOption = select.options[select.selectedIndex];
      const selectedValue = selectedOption?.value || "";
      const contextSnapshots = snapshots || getContextMenuSnapshots();
      const selectedScore = getEnhancedSelectOptionScore(select, selectedValue, contextSnapshots);
      const triggerLabel = wrapper.querySelector("[data-nc-select-label]");
      const triggerScore = wrapper.querySelector("[data-nc-select-trigger-score]");

      if (triggerLabel) triggerLabel.textContent = selectedOption?.textContent?.trim() || "";
      if (triggerScore) triggerScore.innerHTML = renderEnhancedSelectScore(selectedScore);

      wrapper.querySelectorAll("[data-nc-select-option]").forEach((optionButton) => {
        const isActive = optionButton.dataset.value === selectedValue;
        optionButton.dataset.active = String(isActive);
        optionButton.setAttribute("aria-selected", String(isActive));
      });

      const trigger = wrapper.querySelector("[data-nc-select-trigger]");
      if (trigger) trigger.disabled = select.disabled;
      wrapper.dataset.disabled = String(select.disabled);
    }

    function enhanceDashboardSelects(root = document) {
      const snapshots = getContextMenuSnapshots();
      root.querySelectorAll("select:not([data-nc-select-enhanced])").forEach((select) => {
        if (!(select instanceof HTMLSelectElement)) return;

        enhancedSelectId += 1;
        const selectId = `nc-select-${enhancedSelectId}`;
        const wrapper = document.createElement("span");
        wrapper.className = "nc-select";
        wrapper.dataset.open = "false";
        if (select.classList.contains("mt-1") || select.classList.contains("mt-1.5")) {
          wrapper.classList.add("nc-select-spaced");
        }

        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        select.dataset.ncSelectEnhanced = selectId;
        select.classList.add("nc-select-native");

        const selectedOption = select.options[select.selectedIndex];
        const selectedScore = getEnhancedSelectOptionScore(select, selectedOption?.value || "", snapshots);
        const menuOptions = Array.from(select.options).map((option) => {
          const score = getEnhancedSelectOptionScore(select, option.value, snapshots);
          const groupLabel = option.parentElement instanceof HTMLOptGroupElement
            ? option.parentElement.label
            : "";
          const optionLabel = option.textContent?.trim() || "";
          return `
            <button
              type="button"
              class="context-menu-option"
              role="option"
              data-nc-select-option
              data-select-id="${escapeAttribute(selectId)}"
              data-value="${escapeAttribute(option.value)}"
              data-active="${String(option.selected)}"
              aria-selected="${String(option.selected)}"
              ${option.disabled ? "disabled" : ""}
            >
              <span class="context-menu-option-copy">
                <span class="context-menu-label">${escapeHtml(optionLabel)}</span>
                ${groupLabel ? `<span class="context-menu-meta">${escapeHtml(groupLabel)}</span>` : ""}
              </span>
              ${renderEnhancedSelectScore(score)}
            </button>
          `;
        }).join("");

        wrapper.insertAdjacentHTML("beforeend", `
          <button
            type="button"
            class="nc-select-trigger"
            data-nc-select-trigger
            data-select-id="${escapeAttribute(selectId)}"
            aria-haspopup="listbox"
            aria-expanded="false"
            ${select.disabled ? "disabled" : ""}
          >
            <span class="nc-select-trigger-label" data-nc-select-label>${escapeHtml(selectedOption?.textContent?.trim() || "")}</span>
            <span class="nc-select-trigger-end">
              <span data-nc-select-trigger-score>${renderEnhancedSelectScore(selectedScore)}</span>
              <i class="fa-solid fa-chevron-down nc-select-chevron" aria-hidden="true"></i>
            </span>
          </button>
          <span class="context-menu nc-select-menu" data-nc-select-menu role="listbox" hidden>
            ${menuOptions}
          </span>
        `);
      });

      root.querySelectorAll("select[data-nc-select-enhanced]").forEach((select) => {
        if (select instanceof HTMLSelectElement) syncEnhancedSelect(select, snapshots);
      });
    }

    function renderSiteOptions(snapshots = null) {
      getActiveSite();
      const contextSnapshots = snapshots || getContextMenuSnapshots();

      elements.siteMenu.innerHTML = dashboardData.sites.map((site) => {
        const siteSnapshots = contextSnapshots.filter((snapshot) => snapshot.site.id === site.id);
        const score = getContextScoreSummary(
          siteSnapshots.length > 0 ? deriveSiteOverallState(siteSnapshots) : null
        );
        return `
          <button type="button" class="context-menu-option" data-site-option data-site-id="${escapeAttribute(site.id)}" data-active="${site.id === activeSiteId}">
            <div class="context-menu-option-copy">
              <div class="context-menu-label">${escapeHtml(site.name)}</div>
            </div>
            <div class="context-menu-score" data-state="${escapeAttribute(score.state)}">
              <span class="context-score-dot" aria-hidden="true"></span>
              <strong>${escapeHtml(score.score)}</strong>
            </div>
          </button>
        `;
      }).join("");
    }

    function renderZoneOptions(snapshots = null) {
      const site = getActiveSite();
      if (!site || !Array.isArray(site.zones) || site.zones.length === 0) {
        activeZoneId = "";
        elements.zoneMenu.innerHTML = "";
        return;
      }

      if (!site.zones.some((zone) => zone.id === activeZoneId)) {
        activeZoneId = site.zones[0].id;
      }

      const contextSnapshots = snapshots || getContextMenuSnapshots();
      elements.zoneMenu.innerHTML = site.zones.map((zone) => {
        const snapshot = contextSnapshots.find((item) =>
          item.site.id === site.id && item.zone.id === zone.id
        );
        const score = getContextScoreSummary(snapshot?.overall || null);
        return `
          <button type="button" class="context-menu-option" data-zone-option data-zone-id="${escapeAttribute(zone.id)}" data-active="${zone.id === activeZoneId}">
            <div class="context-menu-option-copy">
              <div class="context-menu-label">${escapeHtml(zone.name)}</div>
            </div>
            <div class="context-menu-score" data-state="${escapeAttribute(score.state)}">
              <span class="context-score-dot" aria-hidden="true"></span>
              <strong>${escapeHtml(score.score)}</strong>
            </div>
          </button>
        `;
      }).join("");
    }

    function renderHistoryScoreOption(options) {
      const {
        id,
        name,
        score,
        isActive,
        type
      } = options;
      return `
        <button
          type="button"
          class="context-menu-option"
          role="option"
          data-history-${escapeAttribute(type)}-option
          data-history-option-id="${escapeAttribute(id)}"
          data-active="${String(isActive)}"
          aria-selected="${String(isActive)}"
        >
          <div class="context-menu-option-copy">
            <div class="context-menu-label">${escapeHtml(name)}</div>
          </div>
          <div class="context-menu-score" data-state="${escapeAttribute(score.state)}">
            <span class="context-score-dot" aria-hidden="true"></span>
            <strong>${escapeHtml(score.score)}</strong>
          </div>
        </button>
      `;
    }

    function applyHistorySelectedScore(element, score) {
      element.dataset.state = score.state;
      const value = element.querySelector("strong");
      if (value) value.textContent = score.score;
    }

    function renderManagementNotice(page) {
      if (managementNotice.page !== page || !managementNotice.text) return "";

      const toneClass = managementNotice.tone === "warning"
        ? "bg-[#f8e7d2] text-amber"
        : "bg-[#eef4ec] text-moss";

      return `
        <div class="mt-4 rounded-[22px] px-4 py-3 text-sm font-semibold ${toneClass}">
          ${escapeHtml(managementNotice.text)}
        </div>
      `;
    }

    function renderLocationsManagementPage(globalSnapshots) {
      const locations = dashboardData.sites.filter((site) => !isUnassignedLocation(site));
      const totalLocations = locations.length;
      const totalBlocks = dashboardData.sites.reduce((sum, site) => sum + (site.zones || []).length, 0);
      const totalNodes = dashboardData.sites.reduce((sum, site) => sum + getSiteNodeCount(site), 0);
      const activeAlertCount = globalSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
      const locationRows = locations.map((site) => {
        const siteSnapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === site.id);
        const siteState = siteSnapshots.length > 0 ? deriveSiteOverallState(siteSnapshots) : null;
        const stateKey = siteState?.state || "optimal";
        const rowStateKey = (site.zones || []).length === 0 ? "warning" : stateKey;
        const blockCount = (site.zones || []).length;
        const nodeCount = getSiteNodeCount(site);
        const lowBatteryCount = (site.zones || []).reduce((sum, zone) => {
          const definition = cropProfiles[zone.profile]?.metrics?.batteryLevel;
          return definition ? sum + getLowBatteryNodes(zone, definition).length : sum;
        }, 0);
        const profiles = getSiteProfileNames(site);
        const activeSiteIssueCount = siteSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
        const summary = blockCount === 0
          ? "No sections exist yet. Create the first monitored section here before opening live monitoring."
          : activeAlertCount > 0 && activeSiteIssueCount > 0
            ? `${activeSiteIssueCount} block${activeSiteIssueCount === 1 ? " currently needs attention." : "s currently need attention."}`
            : "All current blocks are stable and ready for monitoring.";
        const metaLine = blockCount === 0
          ? "No sections are connected yet"
          : `${siteState ? `${siteState.indexScore}% location score` : "--"} · ${blockCount} block${blockCount === 1 ? "" : "s"} · ${nodeCount} node${nodeCount === 1 ? "" : "s"}`;
        const noteLine = profiles.length > 0
          ? `${profiles.join(" · ")}${lowBatteryCount > 0 ? ` · ${lowBatteryCount} low-battery node${lowBatteryCount === 1 ? "" : "s"}` : ""}`
          : summary;

        return `
          <div class="management-list-row" data-state="${rowStateKey}">
            <div class="management-list-main">
              <div class="management-list-title">${escapeHtml(site.name)}</div>
              <div class="management-list-meta">${escapeHtml(metaLine)}</div>
              <div class="management-list-note">${escapeHtml(blockCount > 0 ? `${noteLine}. ${summary}` : summary)}</div>
            </div>

            <div class="management-list-actions">
              <span class="management-chip" data-tone="${blockCount > 0 ? stateKey : "warning"}">
                ${escapeHtml(blockCount > 0 ? stateConfig[stateKey].label : "Setup needed")}
              </span>
              ${blockCount > 0
                ? `
                  <button type="button" class="inline-action actionable" data-tone="primary" data-location-open-live="${escapeAttribute(site.id)}">
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    Open
                  </button>
                `
                : `
                  <button type="button" class="inline-action actionable" data-tone="primary" data-location-create-block="${escapeAttribute(site.id)}">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                    First block
                  </button>
                `}
              <button type="button" class="inline-action actionable" data-location-manage-blocks="${escapeAttribute(site.id)}">
                <i class="fa-solid fa-border-all" aria-hidden="true"></i>
                Blocks
              </button>
              <button type="button" class="inline-action actionable" data-location-edit="${escapeAttribute(site.id)}">
                <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                Edit
              </button>
            </div>
          </div>
        `;
      }).join("");

      const locationList = totalLocations > 0
        ? `
            <article class="management-list-shell mt-5">
              ${locationRows}
            </article>
          `
        : `
            <div class="panel rounded-[30px] p-6 mt-5">
              <h3 class="font-display text-2xl font-bold text-ink">No locations exist yet.</h3>
              <p class="mt-3 max-w-2xl text-sm leading-7 text-ink/66">Create the first larger greenhouse-level area from the registration form above.</p>
            </div>
          `;

      const locationFormButtonLabel = locationFormState.mode === "edit" ? "Save area" : "Create area";
      const locationFormTitle = locationFormState.mode === "edit" ? "Edit area" : "Create area";
      const locationFormSummary = locationFormState.mode === "edit"
        ? "Rename the larger operating area without touching the blocks already inside it."
        : "Use one location for one greenhouse, room, tunnel, or other larger operating area.";

      elements.locationsManagementShell.innerHTML = `
        <div class="space-y-6">
          <div class="surface rounded-[30px] p-5 md:p-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="max-w-3xl">
                <p class="text-[11px] uppercase tracking-[0.28em] text-pine/56">Register area</p>
                <h2 class="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">${locationFormTitle}</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/66">${locationFormSummary}</p>
              </div>

              <div class="flex flex-wrap gap-2.5 xl:max-w-[500px] xl:justify-end">
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Areas</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${totalLocations}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Sections</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${totalBlocks}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Nodes</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${totalNodes}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Active alerts</div>
                  <div class="mt-0.5 text-xl font-extrabold ${activeAlertCount > 0 ? "text-amber" : "text-moss"}">${activeAlertCount}</div>
                </div>
              </div>
            </div>

            ${renderManagementNotice("locations")}

            <form class="mt-4" data-management-form="location">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label class="block">
                  <span class="text-sm font-semibold text-ink/72">Area name</span>
                  <input
                    type="text"
                    name="locationName"
                    value="${escapeAttribute(locationFormState.name)}"
                    placeholder="Greenhouse No. 3"
                    class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"
                  >
                </label>

                <div class="flex flex-wrap gap-3 pt-1 lg:justify-end">
                  <button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">
                    ${locationFormButtonLabel}
                  </button>
                  ${locationFormState.mode === "edit"
                    ? `
                      <button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-location-form-cancel>
                        Cancel
                      </button>
                    `
                    : ""}
                </div>
              </div>
            </form>

            <div class="mt-3 rounded-[20px] bg-[#f8f3ea] px-4 py-2.5 text-sm leading-6 text-ink/66">
              Sections are always created inside a saved area, so the next step after this card is the Sections page.
            </div>
          </div>

          <div class="surface rounded-[34px] p-6 md:p-7">
            <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.24em] text-pine/56">Current areas</p>
                <h3 class="mt-2 font-display text-2xl font-bold text-ink">${totalLocations} area${totalLocations === 1 ? "" : "s"} connected</h3>
              </div>
              <div class="text-sm leading-6 text-ink/58">${totalBlocks} blocks · ${totalNodes} nodes in structure</div>
            </div>
            ${locationList}
          </div>
        </div>
      `;
    }

    function renderBlocksManagementPage(globalSnapshots) {
      const locationOptions = dashboardData.sites.filter((site) => !isUnassignedLocation(site));
      const unassignedSite = dashboardData.sites.find((site) => isUnassignedLocation(site)) || null;
      const blockSites = unassignedSite ? [...locationOptions, unassignedSite] : locationOptions;
      const filteredSites = activeBlockFilterSiteId === "all"
        ? blockSites
        : blockSites.filter((site) => site.id === activeBlockFilterSiteId);
      const blockEntries = filteredSites.flatMap((site) =>
        (site.zones || []).map((zone) => {
          const profile = cropProfiles[zone.profile];
          const snapshot = globalSnapshots.find((item) => item.site.id === site.id && item.zone.id === zone.id) || null;
          const batteryDefinition = profile?.metrics?.batteryLevel || null;
          const lowBatteryCount = batteryDefinition ? getLowBatteryNodes(zone, batteryDefinition).length : 0;
          const installedGrowthCount = (zone.availableMetrics || []).filter((key) => isGrowthMetricKey(key)).length;
          const totalGrowthCount = profile
            ? Object.keys(profile.metrics).filter((key) => isGrowthMetricKey(key)).length
            : 0;

          return {
            site,
            zone,
            profile,
            snapshot,
            isUnassigned: isUnassignedLocation(site),
            lowBatteryCount,
            installedGrowthCount,
            totalGrowthCount
          };
        })
      ).sort((left, right) => (left.snapshot?.overall.indexScore || 100) - (right.snapshot?.overall.indexScore || 100));

      const filteredBlockCount = blockEntries.length;
      const filteredNodeCount = blockEntries.reduce((sum, row) => sum + ((row.zone.batteryNodes || []).length || row.zone.sensorCount || 0), 0);
      const filteredAlertCount = blockEntries.filter((row) => row.snapshot?.overall.state !== "optimal").length;
      const filteredLowBatteryCount = blockEntries.reduce((sum, row) => sum + row.lowBatteryCount, 0);
      const blockFormTitle = blockFormState.mode === "edit" ? "Edit section" : "Create section";
      const blockFormSummary = blockFormState.mode === "edit"
        ? "Rename, move, or reprofile the monitored block without changing the live structure around it."
        : "Use one section for one monitored crop area inside an area.";
      const blockFormButtonLabel = blockFormState.mode === "edit" ? "Save section" : "Create section";
      const emptyState = activeBlockFilterSiteId !== "all" && filteredSites.length > 0
        ? `No sections exist in ${filteredSites[0].name} yet.`
        : "No sections exist yet.";
      const activeFilterLabel = activeBlockFilterSiteId === "all"
        ? "All areas"
        : (locationOptions.find((site) => site.id === activeBlockFilterSiteId)?.name || "Filtered area");

      const blockList = filteredBlockCount > 0
        ? blockEntries.map((row) => {
            const score = row.snapshot ? `${row.snapshot.overall.indexScore}%` : "--";
            const stateKey = row.isUnassigned ? "warning" : (row.snapshot?.overall.state || "optimal");
            const summary = row.lowBatteryCount > 0
              ? `${row.lowBatteryCount} node${row.lowBatteryCount === 1 ? " is" : "s are"} below the battery watch threshold.`
              : row.installedGrowthCount < row.totalGrowthCount
                ? `${row.installedGrowthCount}/${row.totalGrowthCount} live readings are installed in this block.`
                : (row.zone.batteryNodes || []).length === 0
                  ? "Structure is ready, but no nodes are attached yet."
                  : "Ready for live monitoring.";
            const coverageLabel = row.totalGrowthCount > 0
              ? `${row.installedGrowthCount}/${row.totalGrowthCount} live`
              : "No live metrics";
            const locationLabel = row.isUnassigned ? "Unassigned" : row.site.name;
            const metaLine = `${locationLabel} · ${row.profile?.name || row.zone.profile} · ${((row.zone.batteryNodes || []).length || row.zone.sensorCount || 0)} node${((row.zone.batteryNodes || []).length || row.zone.sensorCount || 0) === 1 ? "" : "s"} · ${coverageLabel}`;

            return `
              <div class="management-list-row" data-state="${stateKey}">
                <div class="management-list-main">
                  <div class="management-list-title">${escapeHtml(row.zone.name)}</div>
                  <div class="management-list-meta">${escapeHtml(metaLine)}</div>
                  <div class="management-list-note">${escapeHtml(summary)}</div>
                </div>

                <div class="management-list-actions">
                  <span class="management-chip" data-tone="${stateKey}">
                    ${escapeHtml(row.isUnassigned ? "Unassigned" : stateConfig[stateKey].label)}
                  </span>
                  <span class="management-chip" data-tone="${stateKey}">
                    ${escapeHtml(score)}
                  </span>
                  <button type="button" class="inline-action actionable" data-tone="primary" data-block-open-live-site-id="${escapeAttribute(row.site.id)}" data-block-open-live-zone-id="${escapeAttribute(row.zone.id)}">
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    Live
                  </button>
                  <button type="button" class="inline-action actionable" data-block-edit-site-id="${escapeAttribute(row.site.id)}" data-block-edit-zone-id="${escapeAttribute(row.zone.id)}">
                    <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                    Edit
                  </button>
                </div>
              </div>
            `;
          }).join("")
        : `
            <div class="panel rounded-[30px] p-6">
              <h3 class="font-display text-2xl font-bold text-ink">${escapeHtml(emptyState)}</h3>
              <p class="mt-3 max-w-2xl text-sm leading-7 text-ink/66">Create the first block from the registration form above. Real node assignment can stay on the Nodes page later.</p>
            </div>
          `;
      const blockListMarkup = filteredBlockCount > 0
        ? `
            <article class="management-list-shell mt-5">
              ${blockList}
            </article>
          `
        : `
            <div class="mt-5">${blockList}</div>
          `;

      elements.blocksManagementShell.innerHTML = `
        <div class="space-y-6">
          <div class="surface rounded-[30px] p-5 md:p-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="max-w-3xl">
                <p class="text-[11px] uppercase tracking-[0.28em] text-pine/56">Register section</p>
                <h2 class="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">${blockFormTitle}</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/66">${blockFormSummary}</p>
              </div>

              <div class="flex flex-wrap gap-2.5 xl:max-w-[540px] xl:justify-end">
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Shown sections</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${filteredBlockCount}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Areas</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${filteredSites.length}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Nodes</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${filteredNodeCount}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Low battery</div>
                  <div class="mt-0.5 text-xl font-extrabold ${filteredLowBatteryCount > 0 ? "text-amber" : "text-moss"}">${filteredLowBatteryCount}</div>
                </div>
              </div>
            </div>

            ${renderManagementNotice("blocks")}

            ${locationOptions.length === 0
              ? `
                <div class="mt-4 rounded-[20px] bg-[#f8f3ea] px-4 py-2.5 text-sm leading-6 text-ink/66">
                  Create an area first. After that, this becomes the main card for registering new monitored sections.
                </div>
              `
              : `
                <form class="mt-4 space-y-3" data-management-form="block">
                  <div class="grid gap-3 xl:grid-cols-4">
                    <label class="block xl:col-span-2">
                      <span class="text-sm font-semibold text-ink/72">Section name</span>
                      <input
                        type="text"
                        name="blockName"
                        value="${escapeAttribute(blockFormState.name)}"
                        placeholder="Tomato Block B, North"
                        class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"
                      >
                    </label>

                    <label class="block">
                      <span class="text-sm font-semibold text-ink/72">Area</span>
                      <select
                        name="blockSiteId"
                        class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"
                      >
                        ${locationOptions.map((site) => `
                          <option value="${escapeAttribute(site.id)}" ${blockFormState.siteId === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>
                        `).join("")}
                      </select>
                    </label>

                    <label class="block">
                      <span class="text-sm font-semibold text-ink/72">Crop profile</span>
                      <select
                        name="blockProfile"
                        class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12"
                      >
                        ${Object.entries(cropProfiles).map(([profileKey, profile]) => `
                          <option value="${escapeAttribute(profileKey)}" ${blockFormState.profile === profileKey ? "selected" : ""}>${escapeHtml(profile.name)}</option>
                        `).join("")}
                      </select>
                    </label>
                  </div>

                  <div class="flex flex-wrap gap-3 pt-1 lg:justify-end">
                      <button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">
                        ${blockFormButtonLabel}
                      </button>
                      ${blockFormState.mode === "edit"
                        ? `
                          <button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-block-form-cancel>
                            Cancel
                          </button>
                        `
                        : ""}
                  </div>
                </form>
              `}

            ${locationOptions.length > 0
              ? `
                <div class="mt-4 border-t border-black/8 pt-4">
                  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Filter current list</p>
                      <p class="mt-1 text-sm leading-6 text-ink/58">Choose an area to focus the current section list.</p>
                    </div>
                    <label class="block lg:w-[280px]">
                      <span class="sr-only">Filter sections by area</span>
                      <select data-block-filter-select class="w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                        <option value="all" ${activeBlockFilterSiteId === "all" ? "selected" : ""}>All areas</option>
                        ${locationOptions.map((site) => `<option value="${escapeAttribute(site.id)}" ${activeBlockFilterSiteId === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("")}
                        ${unassignedSite ? `<option value="${escapeAttribute(unassignedSite.id)}" ${activeBlockFilterSiteId === unassignedSite.id ? "selected" : ""}>Unassigned sections</option>` : ""}
                      </select>
                    </label>
                  </div>
                </div>
              `
              : ""}

            <div class="mt-3 rounded-[20px] bg-[#f8f3ea] px-4 py-2.5 text-sm leading-6 text-ink/66">
              This step defines structure only. Sensor assignment can stay on Nodes and be managed separately.
            </div>
          </div>

          <div class="surface rounded-[34px] p-6 md:p-7">
            <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.24em] text-pine/56">Current sections</p>
                <h3 class="mt-2 font-display text-2xl font-bold text-ink">${filteredBlockCount} section${filteredBlockCount === 1 ? "" : "s"} in this view</h3>
              </div>
              <div class="text-sm leading-6 text-ink/58">
                ${filteredAlertCount > 0 ? `${filteredAlertCount} need attention` : "No active alerts"} · ${filteredLowBatteryCount} low-battery node${filteredLowBatteryCount === 1 ? "" : "s"}
              </div>
            </div>
            ${blockListMarkup}
          </div>
        </div>
      `;
    }

    function renderNodesManagementPage() {
      const locations = dashboardData.sites.filter((site) => (site.zones || []).length > 0);
      const selectedLocation = locations.find((site) => site.id === nodeFormState.siteId) || locations[0] || null;
      const selectedBlocks = selectedLocation?.zones || [];
      const selectedBlock = selectedBlocks.find((zone) => zone.id === nodeFormState.zoneId) || selectedBlocks[0] || null;

      if (selectedLocation && nodeFormState.siteId !== selectedLocation.id) {
        nodeFormState.siteId = selectedLocation.id;
      }
      if (selectedBlock && nodeFormState.zoneId !== selectedBlock.id) {
        nodeFormState.zoneId = selectedBlock.id;
      }

      const nodes = dashboardData.sites
        .flatMap((site) => (site.zones || []).flatMap((zone) =>
          (zone.batteryNodes || []).map((node) => ({ node, site, zone }))
        ))
        .sort((left, right) => left.node.id.localeCompare(right.node.id));
      const freshnessByNodeId = new Map(nodes.map(({ node, zone }) => [
        node.id,
        getNodeFreshness(node, zone)
      ]));
      const filterLocations = dashboardData.sites.filter((site) => (site.zones || []).length > 0);
      if (activeNodeFilterSiteId !== "all" && !filterLocations.some((site) => site.id === activeNodeFilterSiteId)) {
        activeNodeFilterSiteId = "all";
        activeNodeFilterZoneId = "all";
      }
      const filterZones = filterLocations
        .filter((site) => activeNodeFilterSiteId === "all" || site.id === activeNodeFilterSiteId)
        .flatMap((site) => (site.zones || []).map((zone) => ({ site, zone })));
      if (activeNodeFilterZoneId !== "all" && !filterZones.some(({ zone }) => zone.id === activeNodeFilterZoneId)) {
        activeNodeFilterZoneId = "all";
      }
      const filteredNodes = nodes.filter(({ site, zone }) =>
        (activeNodeFilterSiteId === "all" || site.id === activeNodeFilterSiteId)
        && (activeNodeFilterZoneId === "all" || zone.id === activeNodeFilterZoneId)
      );
      const lowBatteryNodes = getSystemLowBatteryNodes();
      const activeNodes = nodes.filter(({ node }) => node.active !== false).length;
      const reportingNodes = nodes.filter(({ node }) =>
        freshnessByNodeId.get(node.id)?.transportStatus === "live"
      ).length;
      const filteredLowBatteryCount = filteredNodes.filter(({ node, zone }) => {
        const definition = cropProfiles[zone.profile]?.metrics?.batteryLevel;
        return definition && getBatteryNodeState(node.level, definition) !== "optimal";
      }).length;
      const nodeRows = filteredNodes.length > 0
        ? filteredNodes.map(({ node, site, zone }) => {
            const definition = cropProfiles[zone.profile]?.metrics?.batteryLevel;
            const state = definition ? getBatteryNodeState(node.level, definition) : "neutral";
            const stateLabel = state === "neutral" ? "Unknown" : stateConfig[state].label;
            const nodeName = node.name && node.name !== node.id ? node.name : node.id;
            const devEuiNote = node.devEui ? `DevEUI ${node.devEui}` : "DevEUI not assigned";
            const freshness = freshnessByNodeId.get(node.id) || { transportStatus: "offline", ageSec: null };
            const freshnessLabel = getFreshnessLabel(freshness.transportStatus);
            const freshnessAge = formatFreshnessAge(freshness.ageSec);

            return `
              <div class="management-list-row" data-state="${state === "neutral" ? "optimal" : state}" data-freshness="${escapeAttribute(freshness.transportStatus)}">
                <div class="management-list-main">
                  <div class="management-list-title">${escapeHtml(nodeName)}</div>
                  <div class="management-list-meta">${escapeHtml(node.id)} · ${escapeHtml(site.name)} · ${escapeHtml(zone.name)}</div>
                  <div class="management-list-note">${escapeHtml(devEuiNote)} · ${escapeHtml(freshnessLabel)} · ${escapeHtml(freshnessAge)}</div>
                </div>

                <div class="management-list-actions">
                  <span class="management-chip node-freshness-chip" data-freshness="${escapeAttribute(freshness.transportStatus)}">
                    <i class="fa-solid ${freshness.transportStatus === "live" ? "fa-signal" : freshness.transportStatus === "offline" ? "fa-link-slash" : "fa-clock"}" aria-hidden="true"></i>
                    ${escapeHtml(freshnessLabel)}
                  </span>
                  <span class="management-chip" data-tone="${state === "neutral" ? "neutral" : state}">
                    ${escapeHtml(stateLabel)}
                  </span>
                  <span class="management-chip" data-tone="${state === "critical" ? "critical" : state === "warning" ? "warning" : "optimal"}">
                    <i class="fa-solid fa-battery-half" aria-hidden="true"></i>
                    ${freshness.transportStatus === "offline" ? `Last ${escapeHtml(node.level)}%` : `${escapeHtml(node.level)}%`}
                  </span>
                  <button type="button" class="inline-action actionable" data-tone="primary" data-node-open-block-site-id="${escapeAttribute(site.id)}" data-node-open-block-zone-id="${escapeAttribute(zone.id)}">
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    Open section
                  </button>
                  <button type="button" class="inline-action actionable" data-node-edit-site-id="${escapeAttribute(site.id)}" data-node-edit-zone-id="${escapeAttribute(zone.id)}" data-node-edit-id="${escapeAttribute(node.id)}">
                    <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                    Edit
                  </button>
                </div>
              </div>
            `;
          }).join("")
        : `
            <div class="panel rounded-[30px] p-6">
              <h3 class="font-display text-2xl font-bold text-ink">${nodes.length > 0 ? "No nodes match these filters." : "No nodes registered yet."}</h3>
              <p class="mt-3 max-w-2xl text-sm leading-7 text-ink/66">${nodes.length > 0 ? "Choose another Area or Section to see its nodes." : "Choose a section above, enter the sensor identifier, and register the first sensor node."}</p>
            </div>
          `;

      elements.nodesManagementShell.innerHTML = `
        <div class="space-y-6">
          <div class="surface rounded-[30px] p-5 md:p-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="max-w-3xl">
                <p class="text-[11px] uppercase tracking-[0.28em] text-pine/56">Register node</p>
                <h2 class="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">Connect a sensor to a section</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/66">Assign the node to its physical growing section. The generated node ID stays internal; the sensor identifier connects this record to incoming readings.</p>
              </div>

              <div class="flex flex-wrap gap-2.5 xl:max-w-[540px] xl:justify-end">
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Locations</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${dashboardData.sites.length}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Blocks</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${dashboardData.sites.reduce((sum, site) => sum + (site.zones || []).length, 0)}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Reporting now</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${reportingNodes}<span class="text-sm text-ink/42">/${activeNodes}</span></div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Low battery</div>
                  <div class="mt-0.5 text-xl font-extrabold ${lowBatteryNodes.length > 0 ? "text-amber" : "text-moss"}">${lowBatteryNodes.length}</div>
                </div>
              </div>
            </div>

            ${renderManagementNotice("nodes")}

            ${locations.length > 0
              ? `
                <form class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] xl:items-end" data-management-form="node">
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">Area</span>
                    <select name="nodeSiteId" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                      ${locations.map((site) => `<option value="${escapeAttribute(site.id)}" ${nodeFormState.siteId === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("")}
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">Section</span>
                    <select name="nodeZoneId" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                      ${selectedBlocks.map((zone) => `<option value="${escapeAttribute(zone.id)}" ${nodeFormState.zoneId === zone.id ? "selected" : ""}>${escapeHtml(zone.name)}</option>`).join("")}
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">DevEUI</span>
                    <input name="nodeDevEui" value="${escapeAttribute(nodeFormState.devEui)}" placeholder="70B3D57ED006ABCD" maxlength="16" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 font-mono text-sm uppercase text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                  </label>
                  <button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Register node</button>
                </form>
              `
              : `
                <div class="mt-4 rounded-[20px] bg-[#f8f3ea] px-4 py-2.5 text-sm leading-6 text-ink/66">Create an area and its first section before registering a node.</div>
              `}
          </div>

          <div class="surface rounded-[34px] p-6 md:p-7">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.24em] text-pine/56">Current nodes</p>
                <h3 class="mt-2 font-display text-2xl font-bold text-ink">${filteredNodes.length}${filteredNodes.length !== nodes.length ? ` of ${nodes.length}` : ""} node${filteredNodes.length === 1 ? "" : "s"}</h3>
                <div class="mt-1 text-sm leading-6 text-ink/58">${filteredLowBatteryCount > 0 ? `${filteredLowBatteryCount} need battery attention in this view` : "No low-battery nodes in this view"}</div>
              </div>
              <div class="node-list-filters grid gap-2 sm:grid-cols-2">
                <label class="block">
                  <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Filter by Area</span>
                  <select name="nodeFilterSiteId" class="mt-1 w-full rounded-[16px] border border-black/10 bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                    <option value="all" ${activeNodeFilterSiteId === "all" ? "selected" : ""}>All Areas</option>
                    ${filterLocations.map((site) => `<option value="${escapeAttribute(site.id)}" ${activeNodeFilterSiteId === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("")}
                  </select>
                </label>
                <label class="block">
                  <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Filter by Section</span>
                  <select name="nodeFilterZoneId" class="mt-1 w-full rounded-[16px] border border-black/10 bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                    <option value="all" ${activeNodeFilterZoneId === "all" ? "selected" : ""}>All Sections</option>
                    ${filterZones.map(({ site, zone }) => `<option value="${escapeAttribute(zone.id)}" ${activeNodeFilterZoneId === zone.id ? "selected" : ""}>${escapeHtml(activeNodeFilterSiteId === "all" ? `${site.name} — ${zone.name}` : zone.name)}</option>`).join("")}
                  </select>
                </label>
              </div>
            </div>
            ${filteredNodes.length > 0 ? `<article class="management-list-shell mt-5">${nodeRows}</article>` : `<div class="mt-5">${nodeRows}</div>`}
          </div>
        </div>
      `;
    }

    function syncNodeFormField(target) {
      if (!(target instanceof HTMLElement)) return;

      if (target instanceof HTMLInputElement && target.name === "nodeDevEui") {
        nodeFormState.devEui = target.value.toUpperCase().replace(/[^0-9A-F]/g, "");
        target.value = nodeFormState.devEui;
        return;
      }

      if (target instanceof HTMLSelectElement && target.name === "nodeSiteId") {
        const site = dashboardData.sites.find((item) => item.id === target.value);
        nodeFormState.siteId = site?.id || "";
        nodeFormState.zoneId = site?.zones?.[0]?.id || "";
        return;
      }

      if (target instanceof HTMLSelectElement && target.name === "nodeZoneId") {
        nodeFormState.zoneId = target.value;
      }
    }

    async function submitNodeForm() {
      const site = dashboardData.sites.find((item) => item.id === nodeFormState.siteId);
      const zone = (site?.zones || []).find((item) => item.id === nodeFormState.zoneId);
      if (!site || !zone) {
        setManagementNotice("nodes", "Choose the area and section where this node is installed.", "warning");
        renderDashboard();
        return;
      }

      if (!isApiDataMode() && !window.NeuroCropStore?.registerNode) {
        setManagementNotice("nodes", "Node registration is unavailable until the data store is connected.", "warning");
        renderDashboard();
        return;
      }

      try {
        if (isApiDataMode()) {
          if (!window.NeuroCropApi?.registerNode) {
            throw new Error("Node registration API is not available yet.");
          }
          await window.NeuroCropApi.registerNode({
            devEui: nodeFormState.devEui,
            sectionId: zone.id,
            name: nodeFormState.devEui
          });
          await hydrateDashboardFromApi();
        } else {
          window.NeuroCropStore.registerNode({
            siteId: site.id,
            zoneId: zone.id,
            batteryLevel: 100,
            devEui: nodeFormState.devEui
          });
          dashboardData = window.NeuroCropStore.getDashboardData();
        }
        activeSiteId = site.id;
        activeZoneId = zone.id;
        resetCurrentReadingsFromActiveZone();
        resetNodeForm({ siteId: site.id, zoneId: zone.id });
        setManagementNotice("nodes", `Node registered in ${zone.name}. It will appear here when sensor readings begin arriving.`);
        renderDashboard();
      } catch (error) {
        setManagementNotice("nodes", error instanceof Error ? error.message : "The node could not be registered.", "warning");
        renderDashboard();
      }
    }

    function getProfileUsageCounts() {
      return dashboardData.sites.reduce((usage, site) => {
        (site.zones || []).forEach((zone) => {
          usage[zone.profile] = (usage[zone.profile] || 0) + 1;
        });
        return usage;
      }, {});
    }

    function getSettingsMetricRows(profile) {
      return ["airTemp", "humidity", "co2", "vpd", "ec", "ph", "soilMoisture", "batteryLevel"]
        .filter((metricKey) => profile.metrics[metricKey])
        .map((metricKey) => {
          const metric = profile.metrics[metricKey];
          const alertMeta = metricKey === "batteryLevel"
            ? `Alert below ${getBatteryAlertThreshold(metric)}%`
            : `${formatRange(metric.warning, metric)} warning`;

          return `
            <div class="border-b border-black/6 px-1 py-3.5 last:border-b-0">
              <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div class="min-w-0">
                  <div class="font-bold text-ink">${escapeHtml(metric.label)}</div>
                  <div class="mt-1 text-sm text-ink/52">${escapeHtml(metric.aggregation || "Block avg")}</div>
                </div>

                <div class="flex flex-wrap gap-2 xl:justify-end">
                  <span class="rounded-full bg-[#eef4ec] px-3 py-1.5 text-xs font-bold text-moss">
                    Target ${escapeHtml(formatRange(metric.optimal, metric))}
                  </span>
                  <span class="rounded-full bg-[#f8ead5] px-3 py-1.5 text-xs font-bold text-amber">
                    ${escapeHtml(alertMeta)}
                  </span>
                </div>
              </div>

              <div class="mt-2 text-sm leading-6 text-ink/58">${escapeHtml(metric.action || "Used in growth score.")}</div>
            </div>
          `;
        }).join("");
    }

    function loadSettingsState() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(settingsStorageKey) || "null");
        if (!saved) return cloneDashboardValue(defaultSettingsState);
        return {
          ...cloneDashboardValue(defaultSettingsState),
          ...saved,
          organization: { ...defaultSettingsState.organization, ...(saved.organization || {}) },
          alerts: { ...defaultSettingsState.alerts, ...(saved.alerts || {}) },
          notifications: { ...defaultSettingsState.notifications, ...(saved.notifications || {}) },
          preferences: { ...defaultSettingsState.preferences, ...(saved.preferences || {}) },
          integrations: { ...defaultSettingsState.integrations, ...(saved.integrations || {}) },
          retention: { ...defaultSettingsState.retention, ...(saved.retention || {}) },
          team: Array.isArray(saved.team) ? saved.team : cloneDashboardValue(defaultSettingsState.team)
        };
      } catch (error) {
        return cloneDashboardValue(defaultSettingsState);
      }
    }

    function persistSettingsState(message) {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(settingsState));
      if (message) setManagementNotice("settings", message);
    }

    function settingsInput(label, field, value, options = {}) {
      const { type = "text", placeholder = "", min = "", max = "" } = options;
      return `
        <label class="block">
          <span class="text-sm font-semibold text-ink/72">${escapeHtml(label)}</span>
          <input type="${escapeAttribute(type)}" data-settings-field="${escapeAttribute(field)}" value="${escapeAttribute(value)}" placeholder="${escapeAttribute(placeholder)}" ${min !== "" ? `min="${escapeAttribute(min)}"` : ""} ${max !== "" ? `max="${escapeAttribute(max)}"` : ""} class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
        </label>
      `;
    }

    function renderCropProfileEditor(profileKey, profile) {
      const metricRows = Object.entries(profile.metrics)
        .filter(([metricKey]) => isGrowthMetricKey(metricKey))
        .map(([metricKey, metric]) => `
          <div class="rounded-[20px] border border-black/8 bg-white p-4" data-profile-metric-row="${escapeAttribute(metricKey)}">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <strong class="text-sm text-ink">${escapeHtml(metric.label)}</strong>
              <span class="text-xs font-semibold text-ink/52">${escapeHtml(formatUnit(metric.unit))}</span>
            </div>
            <div class="mt-3 grid gap-3 xl:grid-cols-3">
              ${[
                ["Optimal", "optimal", "bg-[#eef4ec] text-moss"],
                ["Warning", "warning", "bg-[#f8ead5] text-amber"],
                ["Critical", "critical", "bg-[#f8dfda] text-ember"]
              ].map(([label, rangeKey, toneClass]) => `
                <div class="rounded-[15px] ${toneClass} p-3">
                  <div class="text-[10px] font-bold uppercase tracking-[0.13em]">${label}</div>
                  <div class="mt-2 grid grid-cols-2 gap-2">
                    <input type="number" step="${metric.decimals === 0 ? "1" : "0.01"}" value="${escapeAttribute(metric[rangeKey][0])}" data-profile-range data-metric-key="${escapeAttribute(metricKey)}" data-range-key="${rangeKey}" data-bound="0" aria-label="${escapeAttribute(`${metric.label} ${label} minimum`)}" class="w-full rounded-xl border border-black/10 bg-white px-2.5 py-2 text-sm font-bold text-ink outline-none focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                    <input type="number" step="${metric.decimals === 0 ? "1" : "0.01"}" value="${escapeAttribute(metric[rangeKey][1])}" data-profile-range data-metric-key="${escapeAttribute(metricKey)}" data-range-key="${rangeKey}" data-bound="1" aria-label="${escapeAttribute(`${metric.label} ${label} maximum`)}" class="w-full rounded-xl border border-black/10 bg-white px-2.5 py-2 text-sm font-bold text-ink outline-none focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("");

      return `
        <details class="mt-5 rounded-[24px] border border-black/8 bg-[#f8f3ea] p-4">
          <summary class="flex cursor-pointer items-center justify-between gap-4 text-sm font-bold text-ink">
            <span>Edit profile and target ranges</span>
            <span class="text-xs font-semibold text-ink/52">${Object.keys(profile.metrics).filter(isGrowthMetricKey).length} growth metrics</span>
          </summary>
          <form class="mt-5" data-settings-form="crop-profile-editor" data-profile-key="${escapeAttribute(profileKey)}">
            <label class="block max-w-md"><span class="text-sm font-semibold text-ink/72">Editing profile</span><select data-profile-editor-select class="mt-1.5 w-full rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink outline-none focus:border-pine/35 focus:ring-2 focus:ring-pine/12">${Object.entries(cropProfiles).map(([key, item]) => `<option value="${escapeAttribute(key)}" ${key === profileKey ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
            <div class="grid gap-3 md:grid-cols-3">
              <label class="block"><span class="text-sm font-semibold text-ink/72">Profile name</span><input name="profileEditorName" value="${escapeAttribute(profile.name)}" class="mt-1.5 w-full rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-pine/35 focus:ring-2 focus:ring-pine/12"></label>
              <label class="block"><span class="text-sm font-semibold text-ink/72">Crop</span><input name="profileEditorHeroName" value="${escapeAttribute(profile.heroName)}" class="mt-1.5 w-full rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-pine/35 focus:ring-2 focus:ring-pine/12"></label>
              <label class="block"><span class="text-sm font-semibold text-ink/72">Growth stage</span><input name="profileEditorStage" value="${escapeAttribute(profile.stage || "")}" placeholder="Vegetative" class="mt-1.5 w-full rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-pine/35 focus:ring-2 focus:ring-pine/12"></label>
            </div>
            <p class="mt-4 text-xs leading-5 text-ink/54">Each pair is minimum / maximum. Warning must sit outside optimal, and critical must sit outside warning.</p>
            <div class="mt-4 grid gap-3">${metricRows}</div>
            <div class="mt-5 flex flex-wrap items-center gap-3"><button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save profile targets</button><span class="text-xs text-ink/54">Changes update scores, alerts, and history target bands.</span></div>
          </form>
        </details>
      `;
    }

    function settingsSelect(label, field, value, options) {
      return `
        <label class="block">
          <span class="text-sm font-semibold text-ink/72">${escapeHtml(label)}</span>
          <select data-settings-field="${escapeAttribute(field)}" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
            ${options.map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
      `;
    }

    function settingsToggle(label, field, checked, note = "") {
      return `
        <label class="flex cursor-pointer items-start justify-between gap-4 rounded-[18px] border border-black/7 bg-white/70 p-3.5">
          <span><span class="block text-sm font-bold text-ink">${escapeHtml(label)}</span>${note ? `<span class="mt-1 block text-xs leading-5 text-ink/54">${escapeHtml(note)}</span>` : ""}</span>
          <input type="checkbox" data-settings-field="${escapeAttribute(field)}" ${checked ? "checked" : ""} class="mt-1 h-4 w-4 accent-[#356b53]">
        </label>
      `;
    }

    function updateSettingsField(target) {
      if (!(target instanceof HTMLElement)) return;
      const field = target.dataset.settingsField;
      if (!field) return;
      const [group, key] = field.split(".");
      if (!settingsState[group] || !key) return;
      const value = target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.value;
      settingsState[group][key] = value;
    }

    function renderSettingsManagementPageLegacy(globalSnapshots) {
      const profileEntries = Object.entries(cropProfiles);
      if (!cropProfiles[activeSettingsProfileKey]) {
        activeSettingsProfileKey = profileEntries[0]?.[0] || activeProfileKey;
      }

      const activeSettingsProfile = cropProfiles[activeSettingsProfileKey] || cropProfiles[activeProfileKey];
      const profileUsageCounts = getProfileUsageCounts();
      const totalBlocks = dashboardData.sites.reduce((sum, site) => sum + (site.zones || []).length, 0);
      const activeAlertCount = globalSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
      const metricCount = activeSettingsProfile ? Object.keys(activeSettingsProfile.metrics || {}).length : 0;
      const sourceProfileOptions = profileEntries.map(([profileKey, profile]) => `
        <option value="${escapeAttribute(profileKey)}" ${settingsProfileFormState.sourceProfile === profileKey ? "selected" : ""}>${escapeHtml(profile.name)}</option>
      `).join("");

      elements.settingsManagementShell.innerHTML = `
        <div class="space-y-6">
          <div class="surface rounded-[30px] p-5 md:p-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="max-w-3xl">
                <p class="text-[11px] uppercase tracking-[0.28em] text-pine/56">System settings</p>
                <h2 class="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">Growth logic and account setup</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/66">Settings define crop targets, alert thresholds, team access, notifications, and workspace preferences used by the dashboard.</p>
              </div>

              <div class="flex flex-wrap gap-2.5 xl:max-w-[540px] xl:justify-end">
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Profiles</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${profileEntries.length}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Blocks</div>
                  <div class="mt-0.5 text-xl font-extrabold text-ink">${totalBlocks}</div>
                </div>
                <div class="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Alerts</div>
                  <div class="mt-0.5 text-xl font-extrabold ${activeAlertCount > 0 ? "text-amber" : "text-moss"}">${activeAlertCount}</div>
                </div>
              </div>
            </div>

            ${renderManagementNotice("settings")}
          </div>

          <div class="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div class="surface rounded-[30px] p-5">
              <p class="text-[11px] uppercase tracking-[0.24em] text-pine/56">Crop profiles</p>
              <h3 class="mt-1.5 font-display text-xl font-bold text-ink">Profiles used by sections</h3>

              <div class="mt-4 space-y-2.5">
                ${profileEntries.map(([profileKey, profile]) => `
                  <button type="button" class="actionable w-full rounded-[18px] border px-4 py-3 text-left ${activeSettingsProfileKey === profileKey ? "border-pine/30 bg-pine text-white" : "border-black/8 bg-white text-ink"}" data-settings-profile-key="${escapeAttribute(profileKey)}">
                    <div class="flex items-center justify-between gap-3">
                      <span class="font-bold">${escapeHtml(profile.name)}</span>
                      <span class="rounded-full ${activeSettingsProfileKey === profileKey ? "bg-white/14 text-white" : "bg-[#f4ead9] text-ink/60"} px-2.5 py-1 text-xs font-semibold">${profileUsageCounts[profileKey] || 0} sections</span>
                    </div>
                    <div class="mt-1 text-sm ${activeSettingsProfileKey === profileKey ? "text-white/76" : "text-ink/54"}">${escapeHtml(profile.hint || `${Object.keys(profile.metrics || {}).length} metric targets`)}</div>
                  </button>
                `).join("")}
              </div>

              <form class="mt-5 rounded-[22px] bg-[#f8f3ea] p-4" data-management-form="settings-profile">
                <p class="text-[11px] uppercase tracking-[0.20em] text-pine/56">Create profile</p>
                <div class="mt-3 grid gap-3">
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">Profile name</span>
                    <input name="settingsProfileName" value="${escapeAttribute(settingsProfileFormState.name)}" placeholder="Cucumbers, fruiting" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">Short crop name</span>
                    <input name="settingsProfileHeroName" value="${escapeAttribute(settingsProfileFormState.heroName)}" placeholder="Cucumber" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">Growth stage</span>
                    <input name="settingsProfileStage" value="${escapeAttribute(settingsProfileFormState.stage)}" placeholder="Fruiting" autocomplete="off" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold text-ink/72">Copy targets from</span>
                    <select name="settingsProfileSource" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12">
                      ${sourceProfileOptions}
                    </select>
                  </label>
                  <button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Create crop profile</button>
                </div>
              </form>
            </div>

            <div class="space-y-6">
              <div class="surface rounded-[30px] p-5">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p class="text-[11px] uppercase tracking-[0.24em] text-pine/56">Active profile</p>
                    <h3 class="mt-1.5 font-display text-2xl font-bold text-ink">${escapeHtml(activeSettingsProfile?.name || "No profile selected")}</h3>
                    <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/62">${escapeHtml(activeSettingsProfile?.hint || "Create a crop profile to define target ranges.")}</p>
                    ${activeSettingsProfile?.stage ? `<span class="mt-3 inline-flex rounded-full bg-[#f4ead9] px-3 py-1.5 text-xs font-bold text-ink/64">Stage: ${escapeHtml(activeSettingsProfile.stage)}</span>` : ""}
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span class="management-chip" data-tone="neutral">${metricCount} metrics</span>
                    <span class="management-chip" data-tone="optimal">${profileUsageCounts[activeSettingsProfileKey] || 0} sections using it</span>
                    <button type="button" class="inline-action actionable" data-settings-profile-duplicate="${escapeAttribute(activeSettingsProfileKey)}">Duplicate</button>
                  </div>
                </div>

                <div class="mt-5 rounded-[24px] border border-black/8 bg-white/72 p-4">
                  ${activeSettingsProfile ? getSettingsMetricRows(activeSettingsProfile) : ""}
                </div>
                ${activeSettingsProfile ? renderCropProfileEditor(activeSettingsProfileKey, activeSettingsProfile) : ""}
              </div>

              <div class="grid gap-4 lg:grid-cols-2">
                <form class="surface rounded-[26px] p-5" data-settings-form="alerts">
                  <p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Alert rules</p>
                  <h3 class="mt-1.5 font-display text-xl font-bold text-ink">Escalation timing</h3>
                  <p class="mt-2 text-sm leading-6 text-ink/62">Metric bands are defined by crop profiles. Here you decide how long a deviation must persist before it becomes an alert.</p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    ${settingsInput("Warning after (min)", "alerts.warningAfterMinutes", settingsState.alerts.warningAfterMinutes, { type: "number", min: "1", max: "1440" })}
                    ${settingsInput("Critical after (min)", "alerts.criticalAfterMinutes", settingsState.alerts.criticalAfterMinutes, { type: "number", min: "1", max: "1440" })}
                  </div>
                  <div class="mt-3">${settingsInput("Alert recipients", "alerts.recipients", settingsState.alerts.recipients, { type: "text", placeholder: "grower@example.com, manager@example.com" })}</div>
                  <button type="submit" class="actionable mt-4 rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save alert rules</button>
                </form>

                <form class="surface rounded-[26px] p-5" data-settings-form="notifications">
                  <p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Notifications</p>
                  <h3 class="mt-1.5 font-display text-xl font-bold text-ink">Delivery and quiet hours</h3>
                  <div class="mt-4 space-y-2.5">
                    ${settingsToggle("Email alerts", "notifications.emailEnabled", settingsState.notifications.emailEnabled, "Send active alerts to the listed recipients.")}
                    ${settingsToggle("SMS alerts", "notifications.smsEnabled", settingsState.notifications.smsEnabled, "Prepared for a future SMS provider connection.")}
                    ${settingsToggle("Critical alerts bypass quiet hours", "notifications.criticalOverride", settingsState.notifications.criticalOverride, "Critical conditions are never silenced.")}
                  </div>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    ${settingsInput("Quiet hours start", "notifications.quietStart", settingsState.notifications.quietStart, { type: "time" })}
                    ${settingsInput("Quiet hours end", "notifications.quietEnd", settingsState.notifications.quietEnd, { type: "time" })}
                  </div>
                  <button type="submit" class="actionable mt-4 rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save notifications</button>
                </form>

                <form class="surface rounded-[26px] p-5" data-settings-form="organization">
                  <p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Organization</p>
                  <h3 class="mt-1.5 font-display text-xl font-bold text-ink">Account identity</h3>
                  <div class="mt-4 grid gap-3">
                    ${settingsInput("Farm or organization name", "organization.name", settingsState.organization.name)}
                    ${settingsInput("Primary contact email", "organization.contactEmail", settingsState.organization.contactEmail, { type: "email" })}
                  </div>
                  <button type="submit" class="actionable mt-4 rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save organization</button>
                </form>

                <form class="surface rounded-[26px] p-5" data-settings-form="preferences">
                  <p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Units & time</p>
                  <h3 class="mt-1.5 font-display text-xl font-bold text-ink">Display preferences</h3>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    ${settingsSelect("Temperature", "preferences.temperatureUnit", settingsState.preferences.temperatureUnit, [{ value: "C", label: "Celsius (°C)" }, { value: "F", label: "Fahrenheit (°F)" }])}
                    ${settingsSelect("Clock", "preferences.timeFormat", settingsState.preferences.timeFormat, [{ value: "24h", label: "24-hour" }, { value: "12h", label: "12-hour" }])}
                    ${settingsSelect("Time zone", "preferences.timezone", settingsState.preferences.timezone, [{ value: "Europe/Vilnius", label: "Europe/Vilnius" }, { value: "Europe/Riga", label: "Europe/Riga" }, { value: "Europe/Warsaw", label: "Europe/Warsaw" }])}
                    ${settingsSelect("Language / dates", "preferences.locale", settingsState.preferences.locale, [{ value: "lt-LT", label: "Lithuanian" }, { value: "en-GB", label: "English (UK)" }, { value: "en-US", label: "English (US)" }])}
                  </div>
                  <button type="submit" class="actionable mt-4 rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save preferences</button>
                </form>

                <form class="surface rounded-[26px] p-5" data-settings-form="retention">
                  <p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Data retention</p>
                  <h3 class="mt-1.5 font-display text-xl font-bold text-ink">Trend storage policy</h3>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    ${settingsInput("Raw readings (days)", "retention.rawDays", settingsState.retention.rawDays, { type: "number", min: "1", max: "3650" })}
                    ${settingsInput("Aggregated trends (months)", "retention.aggregateMonths", settingsState.retention.aggregateMonths, { type: "number", min: "1", max: "240" })}
                  </div>
                  <p class="mt-3 text-xs leading-5 text-ink/54">This is a policy setting for the future database job. It does not delete browser prototype data.</p>
                  <button type="submit" class="actionable mt-4 rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Save retention policy</button>
                </form>
              </div>

              <div class="surface rounded-[30px] p-5">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div><p class="text-[11px] uppercase tracking-[0.22em] text-pine/56">Team & access</p><h3 class="mt-1.5 font-display text-xl font-bold text-ink">People who can use this workspace</h3></div>
                  <span class="management-chip" data-tone="neutral">${settingsState.team.length} users</span>
                </div>
                <div class="mt-4 space-y-2.5">
                  ${settingsState.team.map((member) => `<div class="management-list-row"><div><div class="font-bold text-ink">${escapeHtml(member.name)}</div><div class="mt-1 text-sm text-ink/56">${escapeHtml(member.email)}</div></div><div class="management-list-actions"><span class="management-chip" data-tone="neutral">${escapeHtml(member.role)}</span><button type="button" class="inline-action" data-team-remove="${escapeAttribute(member.id)}" ${settingsState.team.length <= 1 ? "disabled" : ""}>Remove</button></div></div>`).join("")}
                </div>
                <form class="mt-4 grid gap-3 rounded-[22px] bg-[#f8f3ea] p-4 md:grid-cols-[1fr_1fr_170px_auto]" data-settings-form="team">
                  <input name="teamName" placeholder="Name" class="rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none">
                  <input name="teamEmail" type="email" placeholder="Email" class="rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none">
                  <select name="teamRole" class="rounded-[16px] border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none"><option>Grower</option><option>Technician</option><option>Admin</option><option>Viewer</option></select>
                  <button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Add user</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderSettingsManagementPage(globalSnapshots) {
      const profileEntries = Object.entries(cropProfiles);
      if (!cropProfiles[activeSettingsProfileKey]) {
        activeSettingsProfileKey = profileEntries[0]?.[0] || activeProfileKey;
      }

      const validPanels = new Set(["profiles", "alerts", "team", "workspace", "data"]);
      if (!validPanels.has(activeSettingsPanelKey)) activeSettingsPanelKey = "profiles";

      const activeSettingsProfile = cropProfiles[activeSettingsProfileKey] || cropProfiles[activeProfileKey];
      const profileUsageCounts = getProfileUsageCounts();
      const totalSections = dashboardData.sites.reduce((sum, site) => sum + (site.zones || []).length, 0);
      const activeAlertCount = globalSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
      const metricCount = activeSettingsProfile ? Object.keys(activeSettingsProfile.metrics || {}).length : 0;
      const sourceProfileOptions = profileEntries.map(([profileKey, profile]) => `
        <option value="${escapeAttribute(profileKey)}" ${settingsProfileFormState.sourceProfile === profileKey ? "selected" : ""}>${escapeHtml(profile.name)}</option>
      `).join("");
      const isTemplateCreateMode = settingsProfileFormState.mode !== "blank";
      const settingsPanels = [
        { key: "profiles", icon: "fa-seedling", label: "Crop profiles", note: "Targets and growth stages", count: profileEntries.length },
        { key: "alerts", icon: "fa-bell", label: "Alerts & notifications", note: "Escalation and delivery", count: activeAlertCount },
        { key: "team", icon: "fa-users", label: "Team & access", note: "Workspace permissions", count: settingsState.team.length },
        { key: "workspace", icon: "fa-building", label: "Workspace", note: "Identity, units and time", count: "" },
        { key: "data", icon: "fa-database", label: "Data policy", note: "Retention and aggregation", count: "" }
      ];

      const profilePanel = `
        <section class="settings-content-panel" aria-labelledby="settingsProfilesTitle">
          <header class="settings-panel-head">
            <div>
              <span class="settings-panel-kicker">Growth logic</span>
              <h2 id="settingsProfilesTitle">Crop profiles</h2>
              <p>Define what is optimal for each crop and growth stage. These ranges drive scores, alerts and chart targets.</p>
            </div>
            <span class="settings-summary-pill">${profileEntries.length} profiles · ${totalSections} sections</span>
          </header>

          <div class="settings-profile-tabs" role="tablist" aria-label="Crop profile source">
            <button type="button" role="tab" data-settings-profile-view="mine" data-active="${String(activeCropProfileView === "mine")}">
              <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
              <span><strong>My programs</strong><small>${profileEntries.length} in this workspace</small></span>
            </button>
            <button type="button" role="tab" data-settings-profile-view="library" data-active="${String(activeCropProfileView === "library")}">
              <i class="fa-solid fa-book-open" aria-hidden="true"></i>
              <span><strong>Template library</strong><small>NeuroCrop starting points</small></span>
            </button>
          </div>

          ${activeCropProfileView === "library" ? `
            <div class="settings-template-library">
              <div class="settings-template-intro">
                <div>
                  <strong>Choose a starting point</strong>
                  <p>Templates are copied into your workspace. Your changes never modify the original template.</p>
                </div>
                <span class="settings-summary-pill">Read-only library</span>
              </div>
              <div class="settings-template-grid">
                ${cropProfileTemplateLibrary.map((template) => `
                  <article class="settings-template-card" data-status="${escapeAttribute(template.status)}">
                    <div class="settings-template-card-icon"><i class="fa-solid fa-seedling" aria-hidden="true"></i></div>
                    <div class="settings-template-card-copy">
                      <span>${escapeHtml(template.crop)}</span>
                      <h3>${escapeHtml(template.stage || "Custom growth stages")}</h3>
                      <p>${escapeHtml(template.note)}</p>
                    </div>
                    <button type="button" class="${template.status === "available" ? "settings-primary-button" : "settings-secondary-button"}" data-settings-template-key="${escapeAttribute(template.key)}">
                      ${template.status === "available" ? "Use template" : "Set up manually"}
                    </button>
                  </article>
                `).join("")}
              </div>
            </div>
          ` : `
          <div class="settings-profile-workspace">
            <aside class="settings-profile-list" aria-label="Crop profiles">
              <div class="settings-profile-list-title">
                <span>Workspace programs</span>
                <small>Editable</small>
              </div>
              ${profileEntries.map(([profileKey, profile]) => `
                <button type="button" class="settings-profile-option" data-settings-profile-key="${escapeAttribute(profileKey)}" data-active="${String(activeSettingsProfileKey === profileKey)}">
                  <span class="settings-profile-option-copy">
                    <strong>${escapeHtml(profile.name)}</strong>
                    <small>${escapeHtml(profile.stage || profile.heroName || "Growth profile")}</small>
                  </span>
                  <span class="settings-profile-usage">${profileUsageCounts[profileKey] || 0}</span>
                </button>
              `).join("")}

              <details class="settings-create-profile" ${settingsProfileFormState.name ? "open" : ""}>
                <summary><i class="fa-solid fa-plus" aria-hidden="true"></i><span>Create program</span></summary>
                <form data-management-form="settings-profile">
                  <div class="settings-create-mode" role="group" aria-label="Program starting point">
                    <button type="button" data-settings-create-mode="template" data-active="${String(isTemplateCreateMode)}">Use template</button>
                    <button type="button" data-settings-create-mode="blank" data-active="${String(!isTemplateCreateMode)}">Start blank</button>
                  </div>
                  <label><span>Profile name</span><input name="settingsProfileName" value="${escapeAttribute(settingsProfileFormState.name)}" placeholder="Cucumbers, fruiting" autocomplete="off"></label>
                  <label><span>Crop name</span><input name="settingsProfileHeroName" value="${escapeAttribute(settingsProfileFormState.heroName)}" placeholder="Cucumber" autocomplete="off"></label>
                  <label><span>Growth stage</span><input name="settingsProfileStage" value="${escapeAttribute(settingsProfileFormState.stage)}" placeholder="Fruiting" autocomplete="off"></label>
                  ${isTemplateCreateMode ? `<label><span>Copy targets from</span><select name="settingsProfileSource">${sourceProfileOptions}</select></label>` : `
                    <div class="settings-manual-profile-note">
                      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                      <span>Creates an unassigned starter program. Review every target before assigning it to a Section.</span>
                    </div>
                  `}
                  <button type="submit" class="settings-primary-button">Create program</button>
                </form>
              </details>
            </aside>

            <article class="settings-active-profile">
              <div class="settings-active-profile-head">
                <div>
                  <span class="settings-panel-kicker">Selected profile</span>
                  <h3>${escapeHtml(activeSettingsProfile?.name || "No profile selected")}</h3>
                  <p>${escapeHtml(activeSettingsProfile?.hint || "Create a crop profile to define target ranges.")}</p>
                </div>
                <div class="settings-head-actions">
                  ${activeSettingsProfile?.requiresReview ? '<span class="settings-summary-pill" data-tone="warning">Targets need review</span>' : ""}
                  <span class="settings-summary-pill">${metricCount} metrics</span>
                  <span class="settings-summary-pill">${profileUsageCounts[activeSettingsProfileKey] || 0} sections</span>
                  <button type="button" class="settings-secondary-button" data-settings-profile-duplicate="${escapeAttribute(activeSettingsProfileKey)}">
                    <i class="fa-regular fa-copy" aria-hidden="true"></i> Duplicate
                  </button>
                </div>
              </div>
              <div class="settings-metric-summary">
                ${activeSettingsProfile ? getSettingsMetricRows(activeSettingsProfile) : ""}
              </div>
              ${activeSettingsProfile ? renderCropProfileEditor(activeSettingsProfileKey, activeSettingsProfile) : ""}
            </article>
          </div>
          `}
        </section>
      `;

      const alertsPanel = `
        <section class="settings-content-panel" aria-labelledby="settingsAlertsTitle">
          <header class="settings-panel-head">
            <div>
              <span class="settings-panel-kicker">Operational rules</span>
              <h2 id="settingsAlertsTitle">Alerts & notifications</h2>
              <p>Choose when a deviation becomes actionable and how the team should be contacted.</p>
            </div>
            <span class="settings-summary-pill" data-tone="${activeAlertCount > 0 ? "warning" : "optimal"}">${activeAlertCount} active alerts</span>
          </header>
          <div class="settings-two-column">
            <form class="settings-form-card" data-settings-form="alerts">
              <div class="settings-form-title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><h3>Escalation timing</h3><p>Alert only after a deviation persists.</p></div></div>
              <div class="settings-form-grid">
                ${settingsInput("Warning after (min)", "alerts.warningAfterMinutes", settingsState.alerts.warningAfterMinutes, { type: "number", min: "1", max: "1440" })}
                ${settingsInput("Critical after (min)", "alerts.criticalAfterMinutes", settingsState.alerts.criticalAfterMinutes, { type: "number", min: "1", max: "1440" })}
              </div>
              ${settingsInput("Alert recipients", "alerts.recipients", settingsState.alerts.recipients, { type: "text", placeholder: "grower@example.com, manager@example.com" })}
              <button type="submit" class="settings-primary-button">Save alert rules</button>
            </form>

            <form class="settings-form-card" data-settings-form="notifications">
              <div class="settings-form-title"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><div><h3>Delivery</h3><p>Channels and quiet-hour behavior.</p></div></div>
              <div class="settings-toggle-list">
                ${settingsToggle("Email alerts", "notifications.emailEnabled", settingsState.notifications.emailEnabled, "Send active alerts to the listed recipients.")}
                ${settingsToggle("SMS alerts", "notifications.smsEnabled", settingsState.notifications.smsEnabled, "Available when an SMS provider is connected.")}
                ${settingsToggle("Critical bypass", "notifications.criticalOverride", settingsState.notifications.criticalOverride, "Critical conditions ignore quiet hours.")}
              </div>
              <div class="settings-form-grid">
                ${settingsInput("Quiet hours start", "notifications.quietStart", settingsState.notifications.quietStart, { type: "time" })}
                ${settingsInput("Quiet hours end", "notifications.quietEnd", settingsState.notifications.quietEnd, { type: "time" })}
              </div>
              <button type="submit" class="settings-primary-button">Save notifications</button>
            </form>
          </div>
        </section>
      `;

      const teamPanel = `
        <section class="settings-content-panel" aria-labelledby="settingsTeamTitle">
          <header class="settings-panel-head">
            <div>
              <span class="settings-panel-kicker">Access control</span>
              <h2 id="settingsTeamTitle">Team & access</h2>
              <p>Manage who can view or change this farm workspace.</p>
            </div>
            <span class="settings-summary-pill">${settingsState.team.length} users</span>
          </header>
          <div class="settings-team-list">
            ${settingsState.team.map((member) => `
              <div class="settings-team-row">
                <span class="settings-member-avatar">${escapeHtml(member.name.slice(0, 2).toUpperCase())}</span>
                <span class="settings-member-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.email)}</small></span>
                <span class="settings-role-pill">${escapeHtml(member.role)}</span>
                <button type="button" class="settings-text-button" data-team-remove="${escapeAttribute(member.id)}" ${settingsState.team.length <= 1 ? "disabled" : ""}>Remove</button>
              </div>
            `).join("")}
          </div>
          <form class="settings-add-member" data-settings-form="team">
            <div class="settings-form-title"><i class="fa-solid fa-user-plus" aria-hidden="true"></i><div><h3>Add team member</h3><p>Invite a person and assign their workspace role.</p></div></div>
            <div class="settings-add-member-fields">
              <input name="teamName" placeholder="Name">
              <input name="teamEmail" type="email" placeholder="Email address">
              <select name="teamRole"><option>Grower</option><option>Technician</option><option>Admin</option><option>Viewer</option></select>
              <button type="submit" class="settings-primary-button">Add user</button>
            </div>
          </form>
        </section>
      `;

      const workspacePanel = `
        <section class="settings-content-panel" aria-labelledby="settingsWorkspaceTitle">
          <header class="settings-panel-head">
            <div>
              <span class="settings-panel-kicker">Workspace</span>
              <h2 id="settingsWorkspaceTitle">Identity & display</h2>
              <p>Set the customer-facing farm identity and the units used across the dashboard.</p>
            </div>
          </header>
          <div class="settings-two-column">
            <form class="settings-form-card" data-settings-form="organization">
              <div class="settings-form-title"><i class="fa-solid fa-building" aria-hidden="true"></i><div><h3>Organization</h3><p>Visible workspace identity.</p></div></div>
              ${settingsInput("Farm or organization name", "organization.name", settingsState.organization.name)}
              ${settingsInput("Primary contact email", "organization.contactEmail", settingsState.organization.contactEmail, { type: "email" })}
              <button type="submit" class="settings-primary-button">Save organization</button>
            </form>
            <form class="settings-form-card" data-settings-form="preferences">
              <div class="settings-form-title"><i class="fa-solid fa-sliders" aria-hidden="true"></i><div><h3>Units & time</h3><p>Formatting used throughout NeuroCrop.</p></div></div>
              <div class="settings-form-grid">
                ${settingsSelect("Temperature", "preferences.temperatureUnit", settingsState.preferences.temperatureUnit, [{ value: "C", label: "Celsius (°C)" }, { value: "F", label: "Fahrenheit (°F)" }])}
                ${settingsSelect("Clock", "preferences.timeFormat", settingsState.preferences.timeFormat, [{ value: "24h", label: "24-hour" }, { value: "12h", label: "12-hour" }])}
                ${settingsSelect("Time zone", "preferences.timezone", settingsState.preferences.timezone, [{ value: "Europe/Vilnius", label: "Europe/Vilnius" }, { value: "Europe/Riga", label: "Europe/Riga" }, { value: "Europe/Warsaw", label: "Europe/Warsaw" }])}
                ${settingsSelect("Language / dates", "preferences.locale", settingsState.preferences.locale, [{ value: "lt-LT", label: "Lithuanian" }, { value: "en-GB", label: "English (UK)" }, { value: "en-US", label: "English (US)" }])}
              </div>
              <button type="submit" class="settings-primary-button">Save preferences</button>
            </form>
          </div>
        </section>
      `;

      const dataPanel = `
        <section class="settings-content-panel" aria-labelledby="settingsDataTitle">
          <header class="settings-panel-head">
            <div>
              <span class="settings-panel-kicker">Data policy</span>
              <h2 id="settingsDataTitle">Retention & aggregation</h2>
              <p>Control how long detailed measurements and long-term trend summaries should be available.</p>
            </div>
          </header>
          <div class="settings-data-layout">
            <form class="settings-form-card" data-settings-form="retention">
              <div class="settings-form-title"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><div><h3>Storage windows</h3><p>Policy applied by the future backend retention job.</p></div></div>
              <div class="settings-form-grid">
                ${settingsInput("Raw readings (days)", "retention.rawDays", settingsState.retention.rawDays, { type: "number", min: "1", max: "3650" })}
                ${settingsInput("Aggregated trends (months)", "retention.aggregateMonths", settingsState.retention.aggregateMonths, { type: "number", min: "1", max: "240" })}
              </div>
              <button type="submit" class="settings-primary-button">Save data policy</button>
            </form>
            <aside class="settings-policy-note">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              <div><strong>Backend-owned policy</strong><p>This setting describes retention behavior. It does not delete local prototype data and must be enforced by the database aggregation job.</p></div>
            </aside>
          </div>
        </section>
      `;

      const activePanelMarkup = {
        profiles: profilePanel,
        alerts: alertsPanel,
        team: teamPanel,
        workspace: workspacePanel,
        data: dataPanel
      }[activeSettingsPanelKey];

      elements.settingsManagementShell.innerHTML = `
        <div class="settings-page-shell">
          <section class="settings-page-head">
            <div>
              <span class="settings-panel-kicker">Settings</span>
              <h1>Workspace configuration</h1>
              <p>Manage growth logic, operational alerts, people and account preferences.</p>
            </div>
            <div class="settings-head-summary">
              <span><strong>${profileEntries.length}</strong> profiles</span>
              <span><strong>${settingsState.team.length}</strong> users</span>
              <span><strong>${activeAlertCount}</strong> active alerts</span>
            </div>
          </section>
          ${renderManagementNotice("settings")}
          <div class="settings-page-layout">
            <nav class="settings-section-nav" aria-label="Settings categories">
              ${settingsPanels.map((panel) => `
                <button type="button" data-settings-panel-key="${escapeAttribute(panel.key)}" data-active="${String(panel.key === activeSettingsPanelKey)}">
                  <i class="fa-solid ${escapeAttribute(panel.icon)}" aria-hidden="true"></i>
                  <span><strong>${escapeHtml(panel.label)}</strong><small>${escapeHtml(panel.note)}</small></span>
                  ${panel.count !== "" ? `<b>${escapeHtml(panel.count)}</b>` : `<i class="fa-solid fa-chevron-right settings-nav-chevron" aria-hidden="true"></i>`}
                </button>
              `).join("")}
            </nav>
            <main class="settings-page-content">
              ${activePanelMarkup}
            </main>
          </div>
        </div>
      `;
    }

    function syncSettingsProfileFormField(target) {
      if (!(target instanceof HTMLElement)) return;

      if (target instanceof HTMLInputElement && target.name === "settingsProfileName") {
        settingsProfileFormState.name = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.name === "settingsProfileHeroName") {
        settingsProfileFormState.heroName = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.name === "settingsProfileStage") {
        settingsProfileFormState.stage = target.value;
        return;
      }

      if (target instanceof HTMLSelectElement && target.name === "settingsProfileSource") {
        settingsProfileFormState.sourceProfile = target.value;
      }
    }

    function submitSettingsProfileForm() {
      const nextName = settingsProfileFormState.name.trim();
      const isBlankProgram = settingsProfileFormState.mode === "blank";
      const sourceProfileKey = cropProfiles[settingsProfileFormState.sourceProfile]
        ? settingsProfileFormState.sourceProfile
        : activeSettingsProfileKey;

      if (!nextName) {
        setManagementNotice("settings", "Crop profile name is required before saving.", "warning");
        renderDashboard();
        return;
      }

      const nextProfileKey = createUniqueId(nextName, new Set(Object.keys(cropProfiles)), "crop-profile");
      const sourceProfile = cloneDashboardValue(cropProfiles[sourceProfileKey]);
      sourceProfile.name = nextName;
      sourceProfile.heroName = settingsProfileFormState.heroName.trim() || nextName.split(",")[0].trim() || nextName;
      sourceProfile.stage = settingsProfileFormState.stage.trim();
      sourceProfile.hint = isBlankProgram
        ? "Manual program. Review every target before assigning it to a Section."
        : `Workspace copy of ${cropProfiles[sourceProfileKey].name}.`;
      sourceProfile.requiresReview = isBlankProgram;
      cropProfiles[nextProfileKey] = sourceProfile;
      persistCustomCropProfiles();
      persistCropProfileOverrides();
      activeSettingsProfileKey = nextProfileKey;
      settingsProfileFormState = { name: "", heroName: "", stage: "", sourceProfile: nextProfileKey, mode: "template" };
      setManagementNotice(
        "settings",
        isBlankProgram
          ? `${nextName} created as a manual program. Review its targets before assigning it to a Section.`
          : `${nextName} created. It is now available in the Sections crop profile dropdown.`
      );
      renderDashboard();
    }

    function submitCropProfileEditor(form) {
      const profileKey = form.dataset.profileKey;
      const profile = cropProfiles[profileKey];
      if (!profile) return;

      const name = String(form.querySelector('[name="profileEditorName"]')?.value || "").trim();
      const heroName = String(form.querySelector('[name="profileEditorHeroName"]')?.value || "").trim();
      const stage = String(form.querySelector('[name="profileEditorStage"]')?.value || "").trim();
      if (!name || !heroName) {
        setManagementNotice("settings", "Profile and crop name are required before saving.", "warning");
        renderDashboard();
        return;
      }

      const nextMetrics = cloneDashboardValue(profile.metrics);
      const metricRows = [...form.querySelectorAll("[data-profile-metric-row]")];
      for (const row of metricRows) {
        const metricKey = row.dataset.profileMetricRow;
        const metric = nextMetrics[metricKey];
        if (!metric) continue;
        const nextRanges = { optimal: [], warning: [], critical: [] };
        const inputs = [...row.querySelectorAll("[data-profile-range]")];
        for (const input of inputs) {
          const rangeKey = input.dataset.rangeKey;
          const bound = Number(input.dataset.bound);
          const value = Number(input.value);
          if (!Number.isFinite(value)) {
            setManagementNotice("settings", `Enter a valid value for ${metric.label}.`, "warning");
            renderDashboard();
            return;
          }
          nextRanges[rangeKey][bound] = value;
        }
        const [optimalMin, optimalMax] = nextRanges.optimal;
        const [warningMin, warningMax] = nextRanges.warning;
        const [criticalMin, criticalMax] = nextRanges.critical;
        const isOrdered = criticalMin <= warningMin && warningMin <= optimalMin && optimalMin <= optimalMax && optimalMax <= warningMax && warningMax <= criticalMax;
        if (!isOrdered) {
          setManagementNotice("settings", `${metric.label}: set critical outside warning, and warning outside optimal.`, "warning");
          renderDashboard();
          return;
        }
        metric.optimal = nextRanges.optimal;
        metric.warning = nextRanges.warning;
        metric.critical = nextRanges.critical;
      }

      profile.name = name;
      profile.heroName = heroName;
      profile.stage = stage;
      profile.metrics = nextMetrics;
      persistCustomCropProfiles();
      persistCropProfileOverrides();
      setManagementNotice("settings", `${name} targets saved. Scores, alerts, and history now use these ranges.`);
      renderDashboard();
    }

    function submitLocationForm() {
      const nextName = locationFormState.name.trim();
      if (!nextName) {
        setManagementNotice("locations", "Location name is required before saving.", "warning");
        renderDashboard();
        return;
      }

      const nextData = cloneDashboardValue(dashboardData);

      if (locationFormState.mode === "edit") {
        const site = nextData.sites.find((item) => item.id === locationFormState.siteId);
        if (!site) {
          setManagementNotice("locations", "This location could not be found anymore.", "warning");
          renderDashboard();
          return;
        }

        site.name = nextName;
        persistDashboardData(nextData);
        resetLocationForm();
        setManagementNotice("locations", `${nextName} updated.`);
        renderDashboard();
        return;
      }

      const nextSiteId = createUniqueId(nextName, getAllSiteIds(nextData), "location");
      nextData.sites.push({
        id: nextSiteId,
        name: nextName,
        zones: []
      });

      persistDashboardData(nextData);
      activeBlockFilterSiteId = nextSiteId;
      resetLocationForm();
      resetBlockForm({ siteId: nextSiteId });
      setManagementNotice("locations", `${nextName} created. Next step: add the first section inside it.`);
      renderDashboard();
    }

    function submitBlockForm() {
      const nextName = blockFormState.name.trim();
      const nextSiteId = blockFormState.siteId;
      const nextProfile = blockFormState.profile;

      if (!nextName) {
        setManagementNotice("blocks", "Block name is required before saving.", "warning");
        renderDashboard();
        return;
      }

      if (!nextSiteId || !dashboardData.sites.some((site) => site.id === nextSiteId)) {
        setManagementNotice("blocks", "Choose the area that should contain this section.", "warning");
        renderDashboard();
        return;
      }

      if (!cropProfiles[nextProfile]) {
        setManagementNotice("blocks", "Choose a valid crop profile for this block.", "warning");
        renderDashboard();
        return;
      }

      const nextData = cloneDashboardValue(dashboardData);
      const targetSite = nextData.sites.find((site) => site.id === nextSiteId);
      const availableMetrics = Object.keys(cropProfiles[nextProfile].metrics);

      if (blockFormState.mode === "edit") {
        const sourceSite = nextData.sites.find((site) => (site.zones || []).some((zone) => zone.id === blockFormState.zoneId));
        const zone = sourceSite ? (sourceSite.zones || []).find((item) => item.id === blockFormState.zoneId) : null;
        if (!sourceSite || !zone || !targetSite) {
          setManagementNotice("blocks", "This block could not be found anymore.", "warning");
          renderDashboard();
          return;
        }

        const wasActiveBlock = activeZoneId === zone.id;
        zone.name = nextName;
        zone.profile = nextProfile;
        zone.availableMetrics = availableMetrics.slice();

        if (sourceSite.id !== targetSite.id) {
          sourceSite.zones = (sourceSite.zones || []).filter((item) => item.id !== zone.id);
          targetSite.zones = Array.isArray(targetSite.zones) ? targetSite.zones : [];
          targetSite.zones.push(zone);
        }

        persistDashboardData(nextData, wasActiveBlock ? { preferredSiteId: targetSite.id, preferredZoneId: zone.id } : {});
        activeBlockFilterSiteId = targetSite.id;
        resetBlockForm({ siteId: targetSite.id, profile: nextProfile });
        setManagementNotice("blocks", `${nextName} updated.`);
        renderDashboard();
        return;
      }

      if (!targetSite) {
        setManagementNotice("blocks", "This location could not be found anymore.", "warning");
        renderDashboard();
        return;
      }

      const nextZoneId = createUniqueId(nextName, getAllZoneIds(nextData), "block");
      const nextZone = {
        id: nextZoneId,
        name: nextName,
        profile: nextProfile,
        sensorCount: 0,
        batteryNodes: [],
        availableMetrics: availableMetrics.slice()
      };

      targetSite.zones = Array.isArray(targetSite.zones) ? targetSite.zones : [];
      targetSite.zones.push(nextZone);

      persistDashboardData(nextData);
      activeBlockFilterSiteId = targetSite.id;
      resetBlockForm({ siteId: targetSite.id, profile: nextProfile });
      setManagementNotice("blocks", `${nextName} created and added to ${targetSite.name}.`);
      renderDashboard();
    }

    function pickScenarioValue(definition, mode) {
      if (definition.behavior === "higherIsBetter") {
        switch (mode) {
          case "lowWarning":
            return roundValue(midpoint(definition.warning), definition.decimals);
          case "lowCritical":
            return roundValue(midpoint(definition.critical), definition.decimals);
          default:
            return roundValue(midpoint(definition.optimal), definition.decimals);
        }
      }

      switch (mode) {
        case "lowWarning":
          return roundValue(midpoint([definition.warning[0], definition.optimal[0]]), definition.decimals);
        case "highWarning":
          return roundValue(midpoint([definition.optimal[1], definition.warning[1]]), definition.decimals);
        case "lowCritical":
          return roundValue(midpoint([definition.critical[0], definition.warning[0]]), definition.decimals);
        case "highCritical":
          return roundValue(midpoint([definition.warning[1], definition.critical[1]]), definition.decimals);
        default:
          return roundValue(midpoint(definition.optimal), definition.decimals);
      }
    }

    function generateReadings(profile, scenarioKey) {
      const scenario = scenarioDirections[scenarioKey];
      return Object.fromEntries(
        Object.entries(profile.metrics).map(([key, definition]) => {
          const mode = scenario[key] || "optimal";
          return [key, pickScenarioValue(definition, mode)];
        })
      );
    }

    function evaluateMetric(definition, value) {
      if (definition.behavior === "higherIsBetter") {
        let state = "optimal";
        if (value < definition.optimal[0]) state = "warning";
        if (value < definition.warning[0]) state = "critical";

        let severity = 0;
        if (state === "optimal") {
          const span = Math.max(definition.optimal[1] - definition.optimal[0], 0.0001);
          severity = ((definition.optimal[1] - value) / span) * 0.15;
        } else if (state === "warning") {
          const span = Math.max(definition.optimal[0] - definition.warning[0], 0.0001);
          const progress = (definition.optimal[0] - value) / span;
          severity = 0.15 + progress * 0.53;
        } else {
          const span = Math.max(definition.warning[0] - definition.critical[0], 0.0001);
          const progress = (definition.warning[0] - value) / span;
          severity = 0.68 + progress * 0.32;
        }

        severity = clamp(severity, 0, 1);
        const scaleMin = (definition.displayRange || definition.critical)[0];
        const scaleMax = (definition.displayRange || definition.critical)[1];
        const scalePosition = clamp(
          ((value - scaleMin) / Math.max(scaleMax - scaleMin, 0.0001)) * 100,
          0,
          100
        );
        const delta = value >= definition.optimal[0] ? 0 : definition.optimal[0] - value;
        const deviationText = state === "optimal"
          ? "Within target range"
          : `Below target by ${formatValue(delta, definition)}`;
        const narrative = state === "optimal"
          ? `${definition.label} is healthy.`
          : `${definition.label} is below the preferred level and ${state === "warning" ? "should be scheduled soon." : "needs immediate attention."}`;

        return { value, state, severity, scalePosition, deviationText, narrative };
      }

      let state = "optimal";
      if (value < definition.optimal[0] || value > definition.optimal[1]) state = "warning";
      if (value < definition.warning[0] || value > definition.warning[1]) state = "critical";

      let direction = "optimal";
      if (value < definition.optimal[0]) direction = "low";
      if (value > definition.optimal[1]) direction = "high";

      let severity = 0;
      if (state === "optimal") {
        const radius = Math.max((definition.optimal[1] - definition.optimal[0]) / 2, 0.0001);
        severity = (Math.abs(value - midpoint(definition.optimal)) / radius) * 0.15;
      } else if (state === "warning") {
        if (direction === "low") {
          const span = Math.max(definition.optimal[0] - definition.warning[0], 0.0001);
          const progress = (definition.optimal[0] - value) / span;
          severity = 0.15 + progress * 0.53;
        } else {
          const span = Math.max(definition.warning[1] - definition.optimal[1], 0.0001);
          const progress = (value - definition.optimal[1]) / span;
          severity = 0.15 + progress * 0.53;
        }
      } else if (direction === "low") {
        const span = Math.max(definition.warning[0] - definition.critical[0], 0.0001);
        const progress = (definition.warning[0] - value) / span;
        severity = 0.68 + progress * 0.32;
      } else {
        const span = Math.max(definition.critical[1] - definition.warning[1], 0.0001);
        const progress = (value - definition.warning[1]) / span;
        severity = 0.68 + progress * 0.32;
      }

      severity = clamp(severity, 0, 1);

      const targetValue = direction === "low"
        ? definition.optimal[0]
        : direction === "high"
          ? definition.optimal[1]
          : midpoint(definition.optimal);

      const delta = Math.abs(targetValue - value);
      const scalePosition = clamp(
        ((value - definition.critical[0]) / Math.max(definition.critical[1] - definition.critical[0], 0.0001)) * 100,
        0,
        100
      );

      const deviationText = direction === "optimal"
        ? "Within target range"
        : `${direction === "low" ? "Below target" : "Above target"} by ${formatValue(delta, definition)}`;

      const narrative = direction === "optimal"
        ? `${definition.label} matches the configured profile.`
        : `${definition.label} is ${direction === "low" ? "below" : "above"} the optimal range and ${state === "warning" ? "is still within the warning zone." : "has reached the critical zone."}`;

      return { value, state, severity, scalePosition, deviationText, narrative };
    }

    function deriveOverallState(results) {
      const activeResults = results.filter((item) => item.available !== false && isGrowthMetricKey(item.key));
      const warningCount = activeResults.filter((item) => item.state === "warning").length;
      const criticalCount = activeResults.filter((item) => item.state === "critical").length;
      const averageSeverity = activeResults.reduce((sum, item) => sum + item.severity, 0) / Math.max(activeResults.length, 1);
      const worstSeverity = activeResults.length > 0 ? Math.max(...activeResults.map((item) => item.severity)) : 0;
      const riskScore = Math.round((averageSeverity * 0.65 + worstSeverity * 0.35) * 100);
      const riskIndex = Math.round(Math.max(riskScore, worstSeverity * 100));
      const indexScore = Math.max(0, 100 - riskIndex);

      const state = deriveStateFromIndexScore(indexScore);

      return {
        state,
        warningCount,
        criticalCount,
        stableCount: activeResults.length - warningCount - criticalCount,
        riskScore,
        indexScore
      };
    }

    function buildCopy(profile, nonOptimalResults, overallStateKey) {
      const labels = nonOptimalResults.map((item) => profile.metrics[item.key].label.toLowerCase());

      if (overallStateKey === "optimal") {
        return {
          headline: `${profile.heroName}: optimal`,
          description: "Core metrics match the selected profile.",
          indicatorSummary: "All key metrics are within the target range.",
          priorities: [
            "Keep the current setup.",
            "Monitor the overall trend."
          ]
        };
      }

      if (overallStateKey === "warning") {
        return {
          headline: `${profile.heroName}: attention needed`,
          description: `${joinLabels(labels)} moved away from target.`,
          indicatorSummary: `Main drivers of the index: ${joinLabels(labels)}.`,
          priorities: [
            `Check these parameters first: ${joinLabels(labels)}.`,
            "Watch whether the deviation repeats."
          ]
        };
      }

      return {
        headline: `${profile.heroName}: critical`,
        description: "At least one metric reached a critical threshold.",
        indicatorSummary: `Critical deviations: ${joinLabels(labels)}.`,
        priorities: [
          `Prioritize blocks related to: ${joinLabels(labels)}.`,
          "Check the sensor and uplink."
        ]
      };
    }

    function getMetricCategory(key) {
      const categories = {
        airTemp: { label: "Temperature", icon: "fa-temperature-half" },
        leafTemp: { label: "Temperature", icon: "fa-temperature-half" },
        soilTemp: { label: "Temperature", icon: "fa-temperature-half" },
        humidity: { label: "Humidity", icon: "fa-droplet" },
        co2: { label: "CO2", icon: "fa-cloud" },
        lux: { label: "Light", icon: "fa-sun" },
        vpd: { label: "VPD", icon: "fa-wind" },
        soilMoisture: { label: "Moisture", icon: "fa-seedling" },
        ec: { label: "Feed EC", icon: "fa-flask" },
        ph: { label: "pH", icon: "fa-vial" },
        soilEc: { label: "Root EC", icon: "fa-seedling" },
        waterTemp: { label: "Water", icon: "fa-water" },
        airPressure: { label: "Pressure", icon: "fa-gauge-high" },
        batteryLevel: { label: "Battery", icon: "fa-battery-half" }
      };

      return categories[key] || { label: "Metric", icon: "fa-wave-square" };
    }

    function getMetricWorkbenchGroup(key) {
      const groupKeyMap = {
        airTemp: "climate",
        leafTemp: "climate",
        humidity: "climate",
        co2: "climate",
        lux: "climate",
        vpd: "climate",
        airPressure: "climate",
        soilTemp: "root",
        soilMoisture: "root",
        soilEc: "root",
        waterTemp: "root",
        ec: "feed",
        ph: "feed",
        batteryLevel: "infrastructure"
      };
      const groups = {
        climate: { key: "climate", label: "Climate", icon: "fa-cloud-sun" },
        root: { key: "root", label: "Root zone", icon: "fa-seedling" },
        feed: { key: "feed", label: "Feed line", icon: "fa-flask" },
        infrastructure: { key: "infrastructure", label: "Node health", icon: "fa-microchip" }
      };
      groups.climate.label = "Current readings";
      groups.root.label = "Plant indicators";
      groups.feed.label = "Nutrients";

      return groups[groupKeyMap[key]] || { key: "other", label: "Other", icon: "fa-wave-square" };
    }

    function renderWorkbenchLenses(lenses, activeKey) {
      return lenses.map((lens) => `
        <button
          type="button"
          class="workbench-lens-button"
          data-workbench-lens="${escapeAttribute(lens.key)}"
          data-active="${String(lens.key === activeKey)}"
          data-tone="${escapeAttribute(lens.tone || "neutral")}"
          aria-pressed="${String(lens.key === activeKey)}"
        >
          <span class="workbench-lens-button-icon">
            <i class="fa-solid ${escapeAttribute(lens.icon || "fa-wave-square")}" aria-hidden="true"></i>
          </span>
          <span class="workbench-lens-button-label">${escapeHtml(lens.label)}</span>
          <span class="workbench-lens-count">${lens.count}</span>
        </button>
      `).join("");
    }

    function renderWorkbenchEmptyState(title, note, fallbackKey = "all") {
      return `
        <div class="workbench-empty-card">
          <div class="workbench-empty-title">${escapeHtml(title)}</div>
          <p class="workbench-empty-note">${escapeHtml(note)}</p>
          ${fallbackKey ? `
            <button type="button" class="workbench-empty-button" data-workbench-switch="${escapeAttribute(fallbackKey)}">
              <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
              Show ${escapeHtml(fallbackKey === "all" ? "all" : fallbackKey)}
            </button>
          ` : ""}
        </div>
      `;
    }

    function hashString(value) {
      let hash = 0;
      const source = String(value || "");
      for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
      }
      return Math.abs(hash);
    }

    function renderMetricHistoryButton(key) {
      return `
        <div class="metric-card-footer">
          <button
            type="button"
            class="metric-history-button"
            data-history-metric="${escapeAttribute(key)}"
            data-active="${String(activeTrendMetricKey === key)}"
            aria-pressed="${String(activeTrendMetricKey === key)}"
          >
            View trend
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }

    function buildTrendMetricOptions(options) {
      const {
        isSiteView,
        site,
        zone,
        profile,
        growthResults,
        siteAverageSummaries
      } = options;

      if (isSiteView) {
        return siteAverageSummaries.map((summary) => ({
          key: summary.key,
          available: summary.coverage > 0,
          definition: summary.definition,
          optimalRange: summary.averageOptimal,
          value: summary.averageValue,
          state: summary.state,
          tone: summary.state,
          label: summary.definition.label,
          meta: `Location avg · ${summary.coverage}/${summary.totalZones} blocks`,
          summary: summary.criticalCount > 0
            ? `${summary.criticalCount} critical block${summary.criticalCount === 1 ? "" : "s"} are pulling this average down.`
            : summary.warningCount > 0
              ? `${summary.warningCount} warning block${summary.warningCount === 1 ? "" : "s"} are drifting around this average.`
              : `${site.name} is holding this average steadily across ${summary.coverage}/${summary.totalZones} blocks.`,
          scopeLabel: site.name,
          coverage: summary.coverage,
          totalZones: summary.totalZones
        }));
      }

      return growthResults
        .map((result) => ({
          key: result.key,
          available: result.available !== false,
          definition: profile.metrics[result.key],
          optimalRange: profile.metrics[result.key].optimal,
          value: result.value,
          state: result.state,
          tone: result.state,
          label: profile.metrics[result.key].label,
          meta: result.available === false
            ? "Sensor not installed in this block"
            : profile.metrics[result.key].aggregation || "Block avg",
          summary: result.available === false
            ? `${profile.metrics[result.key].label} is not installed in this block, so there is no history to show yet.`
            : result.state === "optimal"
            ? `${profile.metrics[result.key].label} is inside the target band right now.`
            : `${result.deviationText} right now, so use history to see whether this is getting worse or already recovering.`,
          scopeLabel: zone.name
        }))
        .sort((left, right) => Number(left.available === false) - Number(right.available === false));
    }

    function syncActiveTrendMetrics(metricOptions, fallbackKey = "") {
      if (metricOptions.length === 0) {
        activeTrendMetricKey = "";
        activeTrendMetricKeys = [];
        return [];
      }

      const availableOptions = metricOptions.filter((option) => option.available !== false);
      const activeKeys = new Set([
        ...activeTrendMetricKeys,
        ...(activeTrendMetricKey ? [activeTrendMetricKey] : [])
      ]);
      const activeOptions = availableOptions.filter((option) => activeKeys.has(option.key));
      if (activeOptions.length > 0) {
        const nextActiveOptions = activeOptions.slice(0, 2);
        activeTrendMetricKeys = nextActiveOptions.map((option) => option.key);
        activeTrendMetricKey = activeOptions[0].key;
        return nextActiveOptions;
      }

      const fallbackOption = availableOptions.find((option) => option.key === fallbackKey);
      if (fallbackOption) {
        activeTrendMetricKey = fallbackOption.key;
        activeTrendMetricKeys = [fallbackOption.key];
        return [fallbackOption];
      }

      const nonOptimalOption = availableOptions.find((option) => option.state !== "optimal")
        || availableOptions[0];
      if (!nonOptimalOption) {
        activeTrendMetricKey = "";
        activeTrendMetricKeys = [];
        return [];
      }
      activeTrendMetricKey = nonOptimalOption.key;
      activeTrendMetricKeys = [nonOptimalOption.key];
      return [nonOptimalOption];
    }

    function getTrendToneColor(state) {
      if (state === "critical") return "#a05444";
      if (state === "warning") return "#af7b2c";
      return "#356b53";
    }

    function buildTrendSeries(option, rangeKey, scopeSeed) {
      const rangeConfig = trendRangeConfig[rangeKey] || trendRangeConfig["24h"];
      const pointCount = Math.max(2, Math.round((rangeConfig.totalHours * 60) / (rangeConfig.intervalMinutes || 60)) + 1);
      const domain = option.definition.displayRange || option.definition.critical;
      const optimalRange = option.optimalRange || option.definition.optimal;
      const span = Math.max(domain[1] - domain[0], 1);
      const currentValue = clamp(option.value, domain[0], domain[1]);
      const optimalMid = midpoint(optimalRange);
      const trendSeed = hashString(`${scopeSeed}:${option.key}:${rangeKey}`);
      const chartPrecision = Math.max(option.definition.decimals + 2, 3);
      const baseAmplitude = span * (rangeKey === "24h" ? 0.06 : rangeKey === "7d" ? 0.09 : 0.12);
      const driftBias = option.state === "critical"
        ? (currentValue - optimalMid) * 1.08
        : option.state === "warning"
          ? (currentValue - optimalMid) * 0.68
          : (currentValue - optimalMid) * 0.32;
      const startValue = clamp(
        currentValue - driftBias - ((trendSeed % 9) - 4) * baseAmplitude * 0.08,
        domain[0],
        domain[1]
      );

      const points = Array.from({ length: pointCount }, (_, index) => {
        const progress = pointCount === 1 ? 1 : index / (pointCount - 1);
        const waveA = Math.sin((progress * Math.PI * (2 + (trendSeed % 3))) + trendSeed * 0.013) * baseAmplitude;
        const waveB = Math.cos((progress * Math.PI * (1.5 + (trendSeed % 5))) + trendSeed * 0.021) * baseAmplitude * 0.45;
        const easing = 1 - Math.pow(progress, 1.35);
        const drift = startValue + (currentValue - startValue) * Math.pow(progress, 1.12);
        return roundValue(
          clamp(drift + ((waveA + waveB) * easing), domain[0], domain[1]),
          chartPrecision
        );
      });
      // Demonstrate two independent events when temperature and CO2 are compared.
      const directedDemoEvents = {
        airTemp: { index: 8, direction: 1 },
        co2: { index: 14, direction: -1 }
      };
      const isDirectedDemoScope = scopeSeed === "greenhouse-1:tomato-a-back:zone";
      const directedEvent = rangeKey === "24h" && isDirectedDemoScope
        ? directedDemoEvents[option.key]
        : null;
      if (directedEvent && points.length >= 20) {
        const eventMagnitude = Math.max(span * 0.06, baseAmplitude);
        const recoveryWeights = [1, 0.82, 0.64, 0.46, 0.28, 0.1];
        recoveryWeights.forEach((weight, offset) => {
          const pointIndex = directedEvent.index + offset;
          points[pointIndex] = roundValue(
            clamp(
              points[pointIndex] + (directedEvent.direction * eventMagnitude * weight),
              domain[0],
              domain[1]
            ),
            chartPrecision
          );
        });
      } else if (rangeKey === "24h" && option.state !== "optimal" && points.length >= 12) {
        const eventIndex = 7 + (trendSeed % 5);
        const eventDirection = currentValue < optimalMid ? -1 : 1;
        const eventMagnitude = Math.max(span * 0.04, baseAmplitude * 0.75);
        points[eventIndex] = roundValue(
          clamp(points[eventIndex - 1] + (eventDirection * eventMagnitude), domain[0], domain[1]),
          chartPrecision
        );
      }

      points[points.length - 1] = currentValue;
      return {
        domain,
        optimalRange,
        pointCount,
        values: points
      };
    }

    function renderTrendMetricButtons(metricOptions, activeKeys = []) {
      const activeKeySet = new Set(activeKeys);
      return metricOptions
        .filter((option) => option.available !== false)
        .map((option) => {
        const isActive = activeKeySet.has(option.key);
        return `
        <button
          type="button"
          class="trend-history-metric-button"
          data-trend-metric="${escapeAttribute(option.key)}"
          data-active="${String(isActive)}"
          data-tone="${escapeAttribute(option.tone || "neutral")}" 
          aria-pressed="${String(isActive)}"
        >
          <span>${escapeHtml(option.label)}</span>
        </button>
      `;
        }).join("");
    }

    function renderTrendRangeButtons(activeKey) {
      return Object.entries(trendRangeConfig).map(([key, config]) => `
        <button
          type="button"
          class="trend-history-range-button"
          data-trend-range="${escapeAttribute(key)}"
          data-active="${String(key === activeKey)}"
          data-tone="neutral"
          aria-pressed="${String(key === activeKey)}"
        >
          <span>${escapeHtml(config.label)}</span>
        </button>
      `).join("");
    }

    function formatTrendDuration(totalHours) {
      const minutes = Math.max(1, Math.round(totalHours * 60));
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (hours < 24) return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days} d ${remainingHours} h` : `${days} d`;
    }

    function getTrendDirectionText(delta) {
      if (delta > 0) return "rising";
      if (delta < 0) return "falling";
      return "stable";
    }

    function buildTrendReadoutItem(item, rangeConfig) {
      const values = item.series.values;
      const definition = item.option.definition;
      const optimalRange = item.option.optimalRange || definition.optimal;
      const currentValue = values[values.length - 1];
      const previousIndex = Math.max(0, values.length - Math.min(5, values.length));
      const recentReference = values[previousIndex];
      const recentDelta = currentValue - recentReference;
      const domain = item.series.domain || definition.displayRange || definition.critical || definition.warning || definition.optimal;
      const movementThreshold = Math.max((domain[1] - domain[0]) * 0.018, stepFromDecimals(definition.decimals) * 2);
      const isCurrentInTarget = currentValue >= optimalRange[0] && currentValue <= optimalRange[1];
      const direction = Math.abs(recentDelta) <= movementThreshold ? "stable" : getTrendDirectionText(recentDelta);
      const intervalHours = rangeConfig.totalHours / Math.max(values.length - 1, 1);
      let inTargetRunStart = values.length - 1;

      while (
        inTargetRunStart > 0
        && values[inTargetRunStart - 1] >= optimalRange[0]
        && values[inTargetRunStart - 1] <= optimalRange[1]
      ) {
        inTargetRunStart -= 1;
      }

      if (isCurrentInTarget) {
        const wasOutsideBeforeRun = inTargetRunStart > 0;
        const duration = formatTrendDuration((values.length - 1 - inTargetRunStart) * intervalHours);
        return {
          tone: "optimal",
          label: item.option.label,
          headline: wasOutsideBeforeRun ? `Returned to target ${duration} ago` : "Holding inside target",
          note: `${formatValue(currentValue, definition)} now · target ${formatRange(optimalRange, definition)}.`
        };
      }

      const isAboveTarget = currentValue > optimalRange[1];
      const badDirection = (isAboveTarget && recentDelta > movementThreshold) || (!isAboveTarget && recentDelta < -movementThreshold);
      const recoveryDirection = (isAboveTarget && recentDelta < -movementThreshold) || (!isAboveTarget && recentDelta > movementThreshold);
      const distanceText = isAboveTarget ? "above target" : "below target";
      const tone = item.option.state === "critical" ? "critical" : "warning";

      if (badDirection) {
        return {
          tone,
          label: item.option.label,
          headline: `${item.option.label} still ${direction}`,
          note: `${formatValue(currentValue, definition)} now, ${distanceText}; latest movement is away from target.`
        };
      }

      if (recoveryDirection) {
        return {
          tone,
          label: item.option.label,
          headline: `${item.option.label} moving back toward target`,
          note: `${formatValue(currentValue, definition)} now, still ${distanceText}, but the latest trend is improving.`
        };
      }

      return {
        tone,
        label: item.option.label,
        headline: `${item.option.label} stable outside target`,
        note: `${formatValue(currentValue, definition)} now, ${distanceText}; watch whether it re-enters ${formatRange(optimalRange, definition)}.`
      };
    }

    function renderTrendReadout(seriesItems, rangeConfig) {
      return seriesItems.map((item) => {
        const readout = buildTrendReadoutItem(item, rangeConfig);
        return `
          <article class="trend-history-readout-card" data-tone="${escapeAttribute(readout.tone)}">
            <div class="trend-history-readout-kicker">
              <span class="trend-history-readout-dot" aria-hidden="true"></span>
              ${escapeHtml(readout.label)}
            </div>
            <div class="trend-history-readout-main">${escapeHtml(readout.headline)}</div>
            <p class="trend-history-readout-note">${escapeHtml(readout.note)}</p>
          </article>
        `;
      }).join("");
    }

    function formatTrendTickValue(value, definition) {
      return formatNumber(value, definition.decimals);
    }

    function formatTrendTimeLabel(date, rangeKey) {
      const formatOptions = rangeKey === "24h"
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short" };
      return new Intl.DateTimeFormat("lt-LT", formatOptions).format(date);
    }

    function colorWithAlpha(color, alpha) {
      if (!color) return `rgba(47, 106, 79, ${alpha})`;
      if (color.startsWith("rgba(")) {
        return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
      }
      if (color.startsWith("rgb(")) {
        return color.replace(/^rgb\(([^)]+)\)$/, `rgba($1, ${alpha})`);
      }
      if (color.startsWith("#")) {
        const hex = color.slice(1);
        const expand = (value) => value.length === 1 ? value + value : value;
        const normalized = hex.length === 3
          ? [hex[0], hex[1], hex[2]].map(expand).join("")
          : hex;
        if (normalized.length === 6) {
          const r = parseInt(normalized.slice(0, 2), 16);
          const g = parseInt(normalized.slice(2, 4), 16);
          const b = parseInt(normalized.slice(4, 6), 16);
          if ([r, g, b].every(Number.isFinite)) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          }
        }
      }
      return color;
    }

    function buildTrendTimeTicks(rangeKey, totalHours) {
      const now = new Date();
      return [0, 0.25, 0.5, 0.75, 1].map((progress) => {
        const date = new Date(now.getTime() - ((1 - progress) * totalHours * 60 * 60 * 1000));
        return {
          progress,
          label: formatTrendTimeLabel(date, rangeKey)
        };
      });
    }

    function renderTrendChartSvg(state) {
      const width = 980;
      const height = 390;
      const padding = { top: 30, right: 36, bottom: 82, left: 88 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const snap = (value) => Math.round(value) + 0.5;
      const { domain, optimalRange, values, definition, metricLabel, rangeKey, rangeLabel, totalHours } = state;
      const warningRange = definition.warning || optimalRange;
      const referenceValues = definition.behavior === "higherIsBetter"
        ? [...values, optimalRange[0], optimalRange[1], warningRange[0]]
        : [...values, ...optimalRange, ...warningRange];
      const referenceMin = Math.min(...referenceValues);
      const referenceMax = Math.max(...referenceValues);
      const referenceSpan = Math.max(referenceMax - referenceMin, (domain[1] - domain[0]) * 0.12, 0.01);
      const axisPadding = referenceSpan * 0.14;
      const displayRange = definition.displayRange || null;
      const axisDomain = [
        displayRange ? Math.max(displayRange[0], referenceMin - axisPadding) : referenceMin - axisPadding,
        displayRange ? Math.min(displayRange[1], referenceMax + axisPadding) : referenceMax + axisPadding
      ];
      const denominator = Math.max(axisDomain[1] - axisDomain[0], 0.0001);
      const mapX = (index) => padding.left + ((chartWidth * index) / Math.max(values.length - 1, 1));
      const mapY = (value) => padding.top + ((axisDomain[1] - value) / denominator) * chartHeight;
      const points = values.map((value, index) => ({
        x: mapX(index),
        y: mapY(value),
        value
      }));
      const bandTop = mapY(optimalRange[1]);
      const bandBottom = mapY(optimalRange[0]);
      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((step) => {
        const value = axisDomain[1] - ((axisDomain[1] - axisDomain[0]) * step);
        return {
          y: padding.top + (chartHeight * step),
          value
        };
      });
      const xTicks = buildTrendTimeTicks(rangeKey, totalHours);
      const finalPoint = points[points.length - 1];
      const axisColor = "rgba(24, 33, 29, 0.30)";
      const gridColor = "rgba(24, 33, 29, 0.10)";
      const tickColor = "rgba(24, 33, 29, 0.56)";
      const metricColor = state.seriesColor || getTrendSeriesColor(0);
      const valueUnit = formatUnit(definition.unit);
      const currentValueLabel = `${formatNumber(values[values.length - 1], definition.decimals)} ${valueUnit}`;
      const stateColor = { optimal: "#356b53", warning: "#af7b2c", critical: "#a05444" };
      const getPointState = (value) => evaluateMetric(definition, value).state;
      const finalState = getPointState(values[values.length - 1]);
      const lineSegments = points.slice(1).map((point, index) => {
        const previous = points[index];
        const segmentState = getPointState((previous.value + point.value) / 2);
        return `<path d="M ${previous.x.toFixed(2)} ${previous.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}" fill="none" stroke="${stateColor[segmentState] || stateColor.optimal}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>`;
      }).join("");
      const shortMetricLabel = metricLabel
        .replace("Air temperature", "Temperature")
        .replace("Relative humidity", "Humidity");
      const optimalMaxLabelY = Math.max(padding.top + 14, Math.min(bandTop + 16, padding.top + chartHeight - 20));
      const optimalMinLabelY = Math.max(padding.top + 14, Math.min(bandBottom + 16, padding.top + chartHeight - 8));

      return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(state.ariaLabel)}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
          <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" rx="18" fill="rgba(255, 255, 255, 0.62)"></rect>
          <line x1="${snap(padding.left)}" y1="${snap(padding.top)}" x2="${snap(padding.left)}" y2="${snap(padding.top + chartHeight)}" stroke="${metricColor}" stroke-width="1.5" opacity="0.72" vector-effect="non-scaling-stroke"></line>
          <line x1="${snap(padding.left)}" y1="${snap(padding.top + chartHeight)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(padding.top + chartHeight)}" stroke="${axisColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"></line>
          ${yTicks.map((tick) => `
            <line
              x1="${snap(padding.left)}"
              y1="${snap(tick.y)}"
              x2="${snap(padding.left + chartWidth)}"
              y2="${snap(tick.y)}"
              stroke="${gridColor}"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            ></line>
            <line
              x1="${snap(padding.left - 8)}"
              y1="${snap(tick.y)}"
              x2="${snap(padding.left)}"
              y2="${snap(tick.y)}"
              stroke="${metricColor}"
              stroke-width="1.5"
              opacity="0.72"
              vector-effect="non-scaling-stroke"
            ></line>
            <text
              x="${Math.round(padding.left - 14)}"
              y="${Math.round(tick.y + 4)}"
              text-anchor="end"
              font-size="12"
              font-weight="700"
              fill="${metricColor}"
            >${escapeHtml(formatTrendTickValue(tick.value, definition))}</text>
          `).join("")}
          ${xTicks.map((tick) => {
            const x = padding.left + (chartWidth * tick.progress);
            return `
              <line
                x1="${snap(x)}"
                y1="${snap(padding.top + chartHeight)}"
                x2="${snap(x)}"
                y2="${snap(padding.top + chartHeight + 8)}"
                stroke="${axisColor}"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
              ></line>
              <text
                x="${Math.round(x)}"
                y="${Math.round(padding.top + chartHeight + 24)}"
                text-anchor="middle"
                font-size="12"
                font-weight="700"
                fill="${tickColor}"
              >${escapeHtml(tick.label)}</text>
            `;
          }).join("")}
          <line x1="${snap(padding.left)}" y1="${snap(bandTop)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(bandTop)}" stroke="${metricColor}" stroke-width="1.35" stroke-dasharray="7 6" opacity="0.62" vector-effect="non-scaling-stroke"></line>
          <line x1="${snap(padding.left)}" y1="${snap(bandBottom)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(bandBottom)}" stroke="${metricColor}" stroke-width="1.35" stroke-dasharray="7 6" opacity="0.62" vector-effect="non-scaling-stroke"></line>
          <text x="${Math.round(padding.left + 12)}" y="${Math.round(optimalMaxLabelY)}" font-size="10.5" font-weight="850" fill="${metricColor}" opacity="0.78">${escapeHtml(`${shortMetricLabel} optimal max`)}</text>
          <text x="${Math.round(padding.left + 12)}" y="${Math.round(optimalMinLabelY)}" font-size="10.5" font-weight="850" fill="${metricColor}" opacity="0.78">${escapeHtml(`${shortMetricLabel} optimal min`)}</text>
          ${lineSegments}
          <circle cx="${Math.round(finalPoint.x)}" cy="${Math.round(finalPoint.y)}" r="4.8" fill="#ffffff" stroke="${stateColor[finalState] || stateColor.optimal}" stroke-width="2" vector-effect="non-scaling-stroke"></circle>
          <rect
            x="${Math.round(Math.max(padding.left + 16, finalPoint.x - 46))}"
            y="${Math.round(Math.max(padding.top + 10, finalPoint.y - 34))}"
            width="96"
            height="24"
            rx="12"
            fill="rgba(255, 255, 255, 0.92)"
            stroke="rgba(24, 33, 29, 0.10)"
          ></rect>
          <text
            x="${Math.round(Math.max(padding.left + 64, finalPoint.x + 2))}"
            y="${Math.round(Math.max(padding.top + 26, finalPoint.y - 18))}"
            text-anchor="middle"
            font-size="12"
            font-weight="800"
            fill="${stateColor[finalState] || stateColor.optimal}"
          >${escapeHtml(currentValueLabel)}</text>
          <text
            x="${Math.round(padding.left + (chartWidth / 2))}"
            y="${Math.round(height - 18)}"
            text-anchor="middle"
            font-size="13"
            font-weight="800"
            fill="${axisColor}"
          >${escapeHtml(`Time (${rangeLabel})`)}</text>
          <text
            x="22"
            y="${Math.round(padding.top + (chartHeight / 2))}"
            text-anchor="middle"
            font-size="13"
            font-weight="800"
            fill="${metricColor}"
            transform="rotate(-90 22 ${Math.round(padding.top + (chartHeight / 2))})"
          >${escapeHtml(`${metricLabel} (${valueUnit})`)}</text>
        </svg>
      `;
    }

    function getTrendSeriesColor(index) {
      return ["#356b53", "#af7b2c", "#3d6f8f", "#8b5d7a", "#a05444", "#5b6f3d"][index % 6];
    }

    function getTrendAxisDomain(values, definition, optimalRange) {
      const warningRange = definition.warning || optimalRange;
      const displayRange = definition.displayRange || null;
      const referenceValues = definition.behavior === "higherIsBetter"
        ? [...values, optimalRange[0], optimalRange[1], warningRange[0]]
        : [...values, ...optimalRange, ...warningRange];
      const referenceMin = Math.min(...referenceValues);
      const referenceMax = Math.max(...referenceValues);
      const baseDomain = displayRange || definition.critical || definition.warning || definition.optimal;
      const referenceSpan = Math.max(referenceMax - referenceMin, (baseDomain[1] - baseDomain[0]) * 0.12, 0.01);
      const axisPadding = referenceSpan * 0.14;
      return [
        displayRange ? Math.max(displayRange[0], referenceMin - axisPadding) : referenceMin - axisPadding,
        displayRange ? Math.min(displayRange[1], referenceMax + axisPadding) : referenceMax + axisPadding
      ];
    }

    function buildTrendValueColorPieces(item, optimalColor) {
      const definition = item.option.definition;
      const optimalRange = item.option.optimalRange || definition.optimal;
      const warningRange = definition.warning || optimalRange;
      const criticalColor = "#b13d32";

      if (definition.behavior === "higherIsBetter") {
        return [
          { lt: warningRange[0], color: criticalColor },
          { gte: warningRange[0], lt: optimalRange[0], color: criticalColor },
          { gte: optimalRange[0], color: optimalColor }
        ];
      }

      return [
        { lt: warningRange[0], color: criticalColor },
        { gte: warningRange[0], lt: optimalRange[0], color: criticalColor },
        { gte: optimalRange[0], lte: optimalRange[1], color: optimalColor },
        { gt: optimalRange[1], lte: warningRange[1], color: criticalColor },
        { gt: warningRange[1], color: criticalColor }
      ];
    }

    function buildTrendEChartsOption(state) {
      const {
        seriesItems,
        rangeKey,
        rangeLabel,
        totalHours,
        rangeStart,
        ariaLabel
      } = state;
      const isMultiMetric = seriesItems.length > 1;
      const rangeEnd = rangeStart + (totalHours * 60 * 60 * 1000);
      const colors = seriesItems.map((_, index) => getTrendSeriesColor(index));
      const pointCount = seriesItems[0]?.series?.pointCount || seriesItems[0]?.series?.values?.length || 2;
      const pointIntervalMs = (totalHours * 60 * 60 * 1000) / Math.max(pointCount - 1, 1);
      const tooltipDateFormat = new Intl.DateTimeFormat("lt-LT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      const shortMetricLabel = (label) => translateInterfaceText(label)
        .replace("Air temperature", "Temperature")
        .replace("Relative humidity", "Humidity");
      const targetBandLayerBySeries = new Map(
        seriesItems
          .map((item, index) => {
            const definition = item.option.definition;
            const optimalRange = item.option.optimalRange || definition.optimal;
            const axisDomain = getTrendAxisDomain(item.series.values, definition, optimalRange);
            const visualSpan = (optimalRange[1] - optimalRange[0])
              / Math.max(axisDomain[1] - axisDomain[0], 0.0001);
            return { index, visualSpan };
          })
          .sort((left, right) => right.visualSpan - left.visualSpan)
          .reduce((layers, item, layer) => {
            layers.set(item.index, layer);
            return layers;
          }, new Map())
      );

      const yAxis = seriesItems.map((item, index) => {
        const color = colors[index];
        const definition = item.option.definition;
        const optimalRange = item.option.optimalRange || definition.optimal;
        const axisDomain = getTrendAxisDomain(item.series.values, definition, optimalRange);
        return {
          type: "value",
          name: `${translateInterfaceText(item.option.label)} (${formatUnit(definition.unit)})`,
          nameLocation: "middle",
          nameGap: 54,
          nameRotate: index === 0 ? 90 : -90,
          position: index === 0 ? "left" : "right",
          min: axisDomain[0],
          max: axisDomain[1],
          splitNumber: 4,
          axisLine: {
            show: true,
            lineStyle: { color, width: 1.2 }
          },
          axisTick: {
            show: true,
            lineStyle: { color }
          },
          axisLabel: {
            color,
            fontSize: 12,
            fontWeight: 700,
            margin: 12,
            formatter: (value) => formatTrendTickValue(value, definition)
          },
          nameTextStyle: {
            color,
            fontSize: 12,
            fontWeight: 800
          },
          axisPointer: {
            label: {
              formatter: (params) => formatValue(params.value, definition)
            }
          },
          splitLine: {
            show: index === 0,
            lineStyle: {
              color: "rgba(24, 33, 29, 0.10)",
              width: 1
            }
          }
        };
      });

      const chartSeries = seriesItems.map((item, index) => {
        const color = colors[index];
        const definition = item.option.definition;
        const optimalRange = item.option.optimalRange || definition.optimal;
        const data = item.series.values.map((value, pointIndex) => [
          rangeStart + (pointIndex * pointIntervalMs),
          value
        ]);
        const labelSide = index === 0 ? "insideStartTop" : "insideEndTop";
        const labelPrefix = shortMetricLabel(item.option.label);
        const targetMinLabel = `${labelPrefix} min ${formatValue(optimalRange[0], definition)}`;
        const targetMaxLabel = `${labelPrefix} max ${formatValue(optimalRange[1], definition)}`;
        const minimumValue = Math.min(...item.series.values);
        const maximumValue = Math.max(...item.series.values);
        const minimumIndex = item.series.values.indexOf(minimumValue);
        const maximumIndex = item.series.values.indexOf(maximumValue);
        const extremaLabelColor = colorWithAlpha(color, 0.94);
        const extremaBackground = "rgba(255, 255, 255, 0.94)";

        const seriesOption = {
          name: translateInterfaceText(item.option.label),
          type: "line",
          yAxisIndex: index,
          data,
          showSymbol: false,
          symbol: "circle",
          symbolSize: 7,
          smooth: 0.08,
          smoothMonotone: "x",
          connectNulls: false,
          animation: false,
          lineStyle: {
            width: 2,
            cap: "round",
            join: "round",
            opacity: 1
          },
          itemStyle: {
            borderColor: "#ffffff",
            borderWidth: 2,
            opacity: 1
          },
          emphasis: {
            disabled: true
          },
          areaStyle: {
            opacity: 0
          },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            animation: false,
            precision: definition.decimals,
            lineStyle: {
              color,
              width: 1.25,
              type: "dashed",
              opacity: 0.72
            },
            label: {
              show: true,
              position: labelSide,
              distance: 7,
              color,
              fontSize: 11,
              fontWeight: 800,
              backgroundColor: "rgba(255, 255, 255, 0.90)",
              borderColor: "rgba(24, 33, 29, 0.08)",
              borderWidth: 1,
              borderRadius: 8,
              padding: [4, 7]
            },
            data: [
              {
                name: targetMaxLabel,
                yAxis: optimalRange[1],
                label: { formatter: targetMaxLabel }
              },
              {
                name: targetMinLabel,
                yAxis: optimalRange[0],
                label: { formatter: targetMinLabel }
              }
            ]
          },
          markPoint: {
            silent: true,
            animation: false,
            symbol: "circle",
            symbolSize: 10,
            itemStyle: {
              color: extremaBackground,
              borderColor: extremaLabelColor,
              borderWidth: 2,
              opacity: 1
            },
            label: {
              show: true,
              distance: 8,
              color: extremaLabelColor,
              fontSize: 10,
              fontWeight: 850,
              backgroundColor: extremaBackground,
              borderColor: colorWithAlpha(color, 0.20),
              borderWidth: 1,
              borderRadius: 7,
              padding: [3, 6],
              formatter: (params) => params.data?.displayLabel || ""
            },
            data: [
              {
                name: "Minimum",
                coord: data[minimumIndex],
                value: minimumValue,
                displayLabel: `MIN ${formatValue(minimumValue, definition)}`,
                label: { position: "bottom" }
              },
              {
                name: "Maximum",
                coord: data[maximumIndex],
                value: maximumValue,
                displayLabel: `MAX ${formatValue(maximumValue, definition)}`,
                label: { position: "top" }
              }
            ]
          }
        };

        const targetBandLayer = targetBandLayerBySeries.get(index) || 0;
        seriesOption.markArea = {
          silent: true,
          animation: false,
          z: targetBandLayer,
          itemStyle: {
            color: colorWithAlpha(color, isMultiMetric && targetBandLayer === 0 ? 0.065 : 0.105),
            borderColor: "transparent",
            borderWidth: 0
          },
          data: [[
            {
              yAxis: optimalRange[0]
            },
            {
              yAxis: optimalRange[1]
            }
          ]]
        };

        return seriesOption;
      });

      const trendValueVisualMaps = seriesItems.map((item, index) => ({
        show: false,
        type: "piecewise",
        seriesIndex: index,
        dimension: 1,
        pieces: buildTrendValueColorPieces(item, colors[index])
      }));

      return {
        animation: false,
        textStyle: {
          fontFamily: "Manrope, sans-serif",
          color: "#18211d"
        },
        aria: {
          enabled: true,
          label: { description: ariaLabel }
        },
        color: colors,
        visualMap: trendValueVisualMaps,
        grid: {
          top: 34,
          right: isMultiMetric ? 88 : 36,
          bottom: isMultiMetric ? 68 : 50,
          left: 88,
          containLabel: false
        },
        legend: {
          show: isMultiMetric,
          bottom: 8,
          left: 88,
          itemWidth: 18,
          itemHeight: 3,
          icon: "roundRect",
          textStyle: {
            color: "rgba(24, 33, 29, 0.72)",
            fontSize: 12,
            fontWeight: 700
          },
          data: seriesItems.map((item, index) => ({
            name: translateInterfaceText(item.option.label),
            itemStyle: { color: colors[index] }
          }))
        },
        tooltip: {
          trigger: "axis",
          confine: true,
          renderMode: "html",
          backgroundColor: "rgba(24, 33, 29, 0.96)",
          borderColor: "rgba(255, 255, 255, 0.22)",
          borderWidth: 1,
          padding: [10, 12],
          textStyle: {
            color: "#ffffff",
            fontFamily: "Manrope, sans-serif",
            fontSize: 12
          },
          axisPointer: {
            type: "cross",
            snap: false,
            lineStyle: {
              color: "rgba(24, 33, 29, 0.38)",
              width: 1
            },
            crossStyle: {
              color: "rgba(24, 33, 29, 0.38)",
              width: 1
            },
            label: {
              backgroundColor: "#20382f",
              color: "#ffffff"
            }
          },
          formatter: (rawParams) => {
            const params = Array.isArray(rawParams) ? rawParams : [rawParams];
            const firstPoint = params.find((param) => Array.isArray(param.value));
            if (!firstPoint) return "";
            const timestamp = tooltipDateFormat.format(new Date(firstPoint.value[0]));
            const rows = params
              .filter((param) => Array.isArray(param.value) && param.seriesIndex < seriesItems.length)
              .map((param) => {
                const item = seriesItems[param.seriesIndex];
                if (!item) return "";
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:6px;">
                    <span style="display:flex;align-items:center;gap:7px;">
                      <span style="width:8px;height:8px;border-radius:50%;background:${colors[param.seriesIndex]};"></span>
                      ${escapeHtml(translateInterfaceText(item.option.label))}
                    </span>
                    <strong>${escapeHtml(formatValue(param.value[1], item.option.definition))}</strong>
                  </div>
                `;
              })
              .join("");
            return `<div style="font-weight:700;color:rgba(255,255,255,.72);">${escapeHtml(timestamp)}</div>${rows}`;
          }
          },
          xAxis: {
          type: "time",
          min: rangeStart,
          max: rangeEnd,
          boundaryGap: false,
          name: `${translateInterfaceText("Time")} (${rangeLabel})`,
          nameLocation: "middle",
          nameGap: 34,
          minInterval: Math.max(pointIntervalMs, 60 * 1000),
          axisLine: {
            show: true,
            lineStyle: {
              color: "rgba(24, 33, 29, 0.30)",
              width: 1.2
            }
          },
          axisTick: {
            show: true,
            lineStyle: { color: "rgba(24, 33, 29, 0.30)" }
          },
          axisLabel: {
            hideOverlap: true,
            color: "rgba(24, 33, 29, 0.58)",
            fontSize: 12,
            fontWeight: 700,
            formatter: (value) => formatTrendTimeLabel(new Date(value), rangeKey)
          },
          axisPointer: {
            label: {
              formatter: (params) => tooltipDateFormat.format(new Date(params.value))
            }
          },
          nameTextStyle: {
            color: "rgba(24, 33, 29, 0.46)",
            fontSize: 12,
            fontWeight: 800
          },
          splitLine: { show: false }
        },
        yAxis,
        series: chartSeries
      };
    }

    function renderDualTrendChartSvg(state) {
      const width = 980;
      const height = 390;
      const padding = { top: 30, right: 88, bottom: 82, left: 88 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const snap = (value) => Math.round(value) + 0.5;
      const { seriesItems, rangeKey, rangeLabel, totalHours } = state;
      const leftItem = seriesItems[0];
      const rightItem = seriesItems[1];
      const leftColor = getTrendSeriesColor(0);
      const rightColor = getTrendSeriesColor(1);
      const mapX = (index, length) => padding.left + ((chartWidth * index) / Math.max(length - 1, 1));
      const leftOptimalRange = leftItem.option.optimalRange || leftItem.option.definition.optimal;
      const rightOptimalRange = rightItem.option.optimalRange || rightItem.option.definition.optimal;
      const leftAxisDomain = getTrendAxisDomain(leftItem.series.values, leftItem.option.definition, leftOptimalRange);
      const rightAxisDomain = getTrendAxisDomain(rightItem.series.values, rightItem.option.definition, rightOptimalRange);
      const mapLeftY = (value) => padding.top + ((leftAxisDomain[1] - value) / Math.max(leftAxisDomain[1] - leftAxisDomain[0], 0.0001)) * chartHeight;
      const mapRightY = (value) => padding.top + ((rightAxisDomain[1] - value) / Math.max(rightAxisDomain[1] - rightAxisDomain[0], 0.0001)) * chartHeight;
      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((step) => ({
        y: padding.top + (chartHeight * step),
        leftValue: leftAxisDomain[1] - ((leftAxisDomain[1] - leftAxisDomain[0]) * step),
        rightValue: rightAxisDomain[1] - ((rightAxisDomain[1] - rightAxisDomain[0]) * step)
      }));
      const xTicks = buildTrendTimeTicks(rangeKey, totalHours);
      const axisColor = "rgba(24, 33, 29, 0.30)";
      const gridColor = "rgba(24, 33, 29, 0.10)";
      const tickColor = "rgba(24, 33, 29, 0.56)";
      const buildTargetBand = (item, mapY, color, side) => {
        const optimalRange = item.option.optimalRange || item.option.definition.optimal;
        const yTop = mapY(Math.max(optimalRange[0], optimalRange[1]));
        const yBottom = mapY(Math.min(optimalRange[0], optimalRange[1]));
        const isLeft = side === "left";
        const labelX = isLeft ? padding.left + 12 : padding.left + chartWidth - 12;
        const textAnchor = isLeft ? "start" : "end";
        const dashPattern = "7 6";
        const shortLabel = item.option.label
          .replace("Air temperature", "Temperature")
          .replace("Relative humidity", "Humidity");
        const topLabelY = Math.max(padding.top + 14, Math.min(yTop + 16, padding.top + chartHeight - 20));
        const bottomLabelY = Math.max(padding.top + 14, Math.min(yBottom + 16, padding.top + chartHeight - 8));
        return `
          <line x1="${snap(padding.left)}" y1="${snap(yTop)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(yTop)}" stroke="${color}" stroke-width="1.35" stroke-dasharray="${dashPattern}" opacity="0.62" vector-effect="non-scaling-stroke"></line>
          <line x1="${snap(padding.left)}" y1="${snap(yBottom)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(yBottom)}" stroke="${color}" stroke-width="1.35" stroke-dasharray="${dashPattern}" opacity="0.62" vector-effect="non-scaling-stroke"></line>
          <text x="${labelX.toFixed(2)}" y="${topLabelY.toFixed(2)}" text-anchor="${textAnchor}" font-size="10.5" font-weight="850" fill="${color}" opacity="0.78">${escapeHtml(`${shortLabel} optimal max`)}</text>
          <text x="${labelX.toFixed(2)}" y="${bottomLabelY.toFixed(2)}" text-anchor="${textAnchor}" font-size="10.5" font-weight="850" fill="${color}" opacity="0.78">${escapeHtml(`${shortLabel} optimal min`)}</text>
        `;
      };
      const targetBands = `${buildTargetBand(leftItem, mapLeftY, leftColor, "left")}${buildTargetBand(rightItem, mapRightY, rightColor, "right")}`;
      const lines = seriesItems.map((item, seriesIndex) => {
        const color = getTrendSeriesColor(seriesIndex);
        const mapY = seriesIndex === 0 ? mapLeftY : mapRightY;
        const points = item.series.values.map((value, index) => ({
          x: mapX(index, item.series.values.length),
          y: mapY(value),
          value
        }));
        const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
        const finalPoint = points[points.length - 1];
        return `
          <path d="${path}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
          <circle cx="${Math.round(finalPoint.x)}" cy="${Math.round(finalPoint.y)}" r="4.4" fill="#ffffff" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"></circle>
        `;
      }).join("");
      const legend = seriesItems.map((item, index) => `
        <g transform="translate(${padding.left + (index * 168)} ${height - 34})">
          <circle cx="0" cy="0" r="5" fill="${getTrendSeriesColor(index)}"></circle>
          <text x="12" y="4" font-size="12" font-weight="800" fill="rgba(24, 33, 29, 0.70)">${escapeHtml(`${item.option.label} (${index === 0 ? "left" : "right"} axis)`)}</text>
        </g>
      `).join("");
      return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(state.ariaLabel)}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
          <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" rx="10" fill="rgba(255, 255, 255, 0.62)"></rect>
          <line x1="${snap(padding.left)}" y1="${snap(padding.top)}" x2="${snap(padding.left)}" y2="${snap(padding.top + chartHeight)}" stroke="${axisColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"></line>
          <line x1="${snap(padding.left + chartWidth)}" y1="${snap(padding.top)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(padding.top + chartHeight)}" stroke="${axisColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"></line>
          <line x1="${snap(padding.left)}" y1="${snap(padding.top + chartHeight)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(padding.top + chartHeight)}" stroke="${axisColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"></line>
          ${yTicks.map((tick) => `
            <line x1="${snap(padding.left)}" y1="${snap(tick.y)}" x2="${snap(padding.left + chartWidth)}" y2="${snap(tick.y)}" stroke="${gridColor}" stroke-width="1" vector-effect="non-scaling-stroke"></line>
            <text x="${Math.round(padding.left - 14)}" y="${Math.round(tick.y + 4)}" text-anchor="end" font-size="12" font-weight="700" fill="${leftColor}">${escapeHtml(formatTrendTickValue(tick.leftValue, leftItem.option.definition))}</text>
            <text x="${Math.round(padding.left + chartWidth + 14)}" y="${Math.round(tick.y + 4)}" text-anchor="start" font-size="12" font-weight="700" fill="${rightColor}">${escapeHtml(formatTrendTickValue(tick.rightValue, rightItem.option.definition))}</text>
          `).join("")}
          ${xTicks.map((tick) => {
            const x = padding.left + (chartWidth * tick.progress);
            return `
              <line x1="${snap(x)}" y1="${snap(padding.top + chartHeight)}" x2="${snap(x)}" y2="${snap(padding.top + chartHeight + 8)}" stroke="${axisColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"></line>
              <text x="${Math.round(x)}" y="${Math.round(padding.top + chartHeight + 24)}" text-anchor="middle" font-size="12" font-weight="700" fill="${tickColor}">${escapeHtml(tick.label)}</text>
            `;
          }).join("")}
          ${targetBands}
          ${lines}
          <text x="${Math.round(padding.left + (chartWidth / 2))}" y="${Math.round(height - 18)}" text-anchor="middle" font-size="13" font-weight="800" fill="${axisColor}">${escapeHtml(`Time (${rangeLabel})`)}</text>
          <text x="22" y="${Math.round(padding.top + (chartHeight / 2))}" text-anchor="middle" font-size="13" font-weight="800" fill="${leftColor}" transform="rotate(-90 22 ${Math.round(padding.top + (chartHeight / 2))})">${escapeHtml(`${leftItem.option.label} (${formatUnit(leftItem.option.definition.unit)})`)}</text>
          <text x="${width - 22}" y="${Math.round(padding.top + (chartHeight / 2))}" text-anchor="middle" font-size="13" font-weight="800" fill="${rightColor}" transform="rotate(90 ${width - 22} ${Math.round(padding.top + (chartHeight / 2))})">${escapeHtml(`${rightItem.option.label} (${formatUnit(rightItem.option.definition.unit)})`)}</text>
          ${legend}
        </svg>
      `;
    }

    function buildTrendHistoryState(options) {
      const {
        isSiteView,
        site,
        zone,
        trendMetricOptions
      } = options;
      const rangeConfig = trendRangeConfig[activeTrendRangeKey] || trendRangeConfig["24h"];
      if (
        activeTrendMetricKeys.length === 0
        && !activeTrendMetricKey
        && !isSiteView
        && site.id === "greenhouse-1"
        && zone.id === "tomato-a-back"
      ) {
        activeTrendMetricKeys = ["airTemp", "co2"];
        activeTrendMetricKey = "airTemp";
      }
      const selectedMetrics = syncActiveTrendMetrics(trendMetricOptions, options.defaultMetricKey);
      const selectedMetric = selectedMetrics[0];
      const isMultiMetric = selectedMetrics.length > 1;

      if (!selectedMetric) {
        return null;
      }

      const scopeSeed = isSiteView ? `${site.id}:site` : `${site.id}:${zone.id}:zone`;
      const seriesItems = selectedMetrics.map((metricOption) => ({
        option: metricOption,
        series: buildTrendSeries(metricOption, activeTrendRangeKey, scopeSeed)
      }));
      const series = seriesItems[0].series;
      const startValue = series.values[0];
      const currentValue = series.values[series.values.length - 1];
      const deltaValue = roundValue(currentValue - startValue, selectedMetric.definition.decimals);
      const historyLow = Math.min(...series.values);
      const historyHigh = Math.max(...series.values);
      const recentReference = series.values[Math.max(0, series.values.length - Math.min(5, series.values.length))];
      const recentDelta = currentValue - recentReference;
      const optimalRange = selectedMetric.optimalRange || selectedMetric.definition.optimal;
      const currentAboveTarget = currentValue > optimalRange[1];
      const currentBelowTarget = currentValue < optimalRange[0];
      const movementIsSmall = Math.abs(recentDelta) < Math.max((series.domain[1] - series.domain[0]) * 0.03, 0.01);
      const rangeStart = Date.now() - (rangeConfig.totalHours * 60 * 60 * 1000);
      const tooltipDateFormat = new Intl.DateTimeFormat("lt-LT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      const hoverPoints = series.values.map((value, index) => {
        const progress = series.values.length === 1 ? 1 : index / (series.values.length - 1);
        const timestamp = tooltipDateFormat.format(new Date(rangeStart + (progress * rangeConfig.totalHours * 60 * 60 * 1000)));
        return {
          value: formatValue(value, selectedMetric.definition),
          time: timestamp,
          items: seriesItems.map((item) => ({
            label: item.option.label,
            value: formatValue(item.series.values[index], item.option.definition)
          }))
        };
      });

      let callout = isSiteView
        ? `Use this curve to see whether ${selectedMetric.label.toLowerCase()} across ${site.name} is drifting as a location-level pattern or already settling after a correction.`
        : `Use this curve to see whether ${selectedMetric.label.toLowerCase()} in ${zone.name} is drifting, spiking, or already recovering before you change anything else.`;

      if (movementIsSmall) {
        callout = currentAboveTarget || currentBelowTarget
          ? `${selectedMetric.label} is staying away from target rather than snapping back quickly, so this looks more like a sustained condition than a one-off spike.`
          : `${selectedMetric.label} is relatively flat lately, so the current reading looks stable rather than noisy.`;
      } else if (recentDelta > 0) {
        callout = currentAboveTarget
          ? `${selectedMetric.label} is still climbing above target in the latest part of the curve, so the current issue is likely still building.`
          : `${selectedMetric.label} is climbing back toward target, which suggests the last correction may already be helping.`;
      } else if (recentDelta < 0) {
        callout = currentBelowTarget
          ? `${selectedMetric.label} is still falling below target in the latest part of the curve, so this likely needs attention before it deepens.`
          : `${selectedMetric.label} is easing downward toward target, which suggests the system may already be recovering.`;
      }

      if (isMultiMetric) {
        const labels = selectedMetrics.map((metric) => metric.label).join(" / ");
        callout = `This comparison shows how ${labels.toLowerCase()} moved in the same time window. The first metric uses the left Y axis, the second uses the right Y axis, and each dashed band keeps that metric's own target range.`;
      }

      const chartState = {
        seriesItems,
        rangeKey: activeTrendRangeKey,
        rangeLabel: rangeConfig.label,
        totalHours: rangeConfig.totalHours,
        rangeStart,
        ariaLabel: `${selectedMetrics.map((metric) => metric.label).join(", ")} over the last ${rangeConfig.label}`
      };

      return {
        title: isSiteView ? `24-hour trends for ${site.name}` : `24-hour trends for ${zone.name}`,
        summary: isSiteView
          ? `Select up to two metrics to compare how growing conditions moved across ${site.name}.`
          : `Select up to two metrics to compare how temperature, humidity, CO2, or VPD moved inside ${zone.name}.`,
        state: selectedMetric.state,
        rangeMeta: rangeConfig.meta,
        metricLabel: isMultiMetric ? `${selectedMetrics.length} metrics selected` : selectedMetric.label,
        metricMeta: isMultiMetric
          ? "Dual-axis comparison · left and right Y axes use real units"
          : `${selectedMetric.meta} · Target ${formatRange(optimalRange, selectedMetric.definition)}`,
        chartState,
        chartOption: buildTrendEChartsOption(chartState),
        axisLabels: {
          start: `${rangeConfig.label} window`,
          mid: isMultiMetric ? "Left axis + right axis" : "Optimal min + max",
          end: isMultiMetric ? "Tooltip shows both real values" : `Y unit: ${formatUnit(selectedMetric.definition.unit)}`
        },
        metricButtons: renderTrendMetricButtons(trendMetricOptions, selectedMetrics.map((metric) => metric.key)),
        rangeButtons: renderTrendRangeButtons(activeTrendRangeKey),
        readoutHtml: renderTrendReadout(seriesItems, rangeConfig),
        hoverPoints,
        callout,
        backendNote: "Ready for real sensor history once live readings are connected."
      };
    }

    function renderTrendEChart(chartOption) {
      if (trendHistoryChartInstance) {
        trendHistoryChartInstance.dispose();
        trendHistoryChartInstance = null;
      }

      elements.trendHistoryChart.innerHTML = "";
      currentTrendHistoryPoints = [];
      elements.trendHistoryTooltip = null;

      if (!window.echarts) {
        elements.trendHistoryChart.innerHTML = `
          <div class="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-ink/52">
            Trend chart engine could not be loaded.
          </div>
        `;
        return;
      }

      trendHistoryChartInstance = window.echarts.init(
        elements.trendHistoryChart,
        null,
        { renderer: "svg" }
      );
      trendHistoryChartInstance.setOption(chartOption, { notMerge: true });
      window.requestAnimationFrame(() => trendHistoryChartInstance?.resize());
    }

    function openTrendHistory(metricKey) {
      if (metricKey) {
        activeTrendMetricKey = metricKey;
        activeTrendMetricKeys = [metricKey];
      }
      activePrimaryPage = "history";
      sidebarActionOverride = null;
      setExperienceMode("detailed");
      renderDashboard();
      syncTopLevelRoute("/history");
      scrollToSection("historySection");
    }

    function renderLiveReadingRow(key, definition, result, scopeSeed, zone, freshnessStatus = "live") {
      const category = getMetricCategory(key);
      const isAvailable = result.available !== false;
      const observation = getObservationPresentation(zone, key, result, freshnessStatus);
      const summary = isAvailable
        ? getNodeMetricSummary(zone, key, definition, result)
        : {
            installedCount: 0,
            reportingCount: 0,
            readings: [],
            medianValue: null,
            medianResult: { value: null, state: "unavailable", severity: 0 },
            min: null,
            max: null,
            outsideCount: 0,
            localOutliers: []
          };
      const typicalResult = summary.medianResult;
      const hasCurrentValue = isAvailable && summary.reportingCount > 0;
      const visual = hasCurrentValue ? getDiagnosticDeviationVisual(typicalResult, definition) : null;
      const trend = isAvailable ? getDiagnosticTrend(result, definition, scopeSeed) : null;
      const statusLabel = !isAvailable
        ? diagnosticText("Unavailable", "Neprieinama")
        : typicalResult.state === "optimal"
          ? diagnosticText("In target", "Normoje")
          : typicalResult.state === "critical"
            ? diagnosticText("Critical", "Kritinė")
            : diagnosticText("Warning", "Dėmesio");
      const deviation = hasCurrentValue && typicalResult.state !== "optimal"
        ? getDiagnosticDeviationText(typicalResult)
        : diagnosticText("Inside target range", "Tiksliniame intervale");
      const rangeText = summary.min === null || summary.max === null
        ? diagnosticText("No current range", "Nėra dabartinio diapazono")
        : `${formatValue(summary.min, definition)}–${formatValue(summary.max, definition)}`;
      const reportingText = isAvailable
        ? diagnosticText(
            `${summary.reportingCount}/${summary.installedCount} sensors reporting · range ${rangeText}`,
            `${summary.reportingCount}/${summary.installedCount} sensorių siunčia · diapazonas ${rangeText}`
          )
        : observation.detail;
      const exceptionLabel = summary.localOutliers.length > 0
        ? diagnosticText(
            `${summary.localOutliers.length} local exception${summary.localOutliers.length === 1 ? "" : "s"}`,
            `${summary.localOutliers.length} ${summary.localOutliers.length === 1 ? "lokali išimtis" : "lokalios išimtys"}`
          )
        : summary.outsideCount > 0
          ? diagnosticText(
              `${summary.outsideCount} outside target`,
              `${summary.outsideCount} už tikslinių ribų`
            )
          : "";
      const isExpanded = expandedLiveMetricKey === key;
      const nodeRows = summary.readings.map((reading) => `
        <div class="live-node-reading-row" data-state="${escapeAttribute(reading.metricResult.state)}" data-observation="${escapeAttribute(reading.observation.state)}">
          <div>
            <strong>${escapeHtml(reading.node.name || reading.node.id)}</strong>
            <small>${escapeHtml(reading.node.id)} · ${escapeHtml(reading.position)}</small>
          </div>
          <span>${escapeHtml(reading.source)}</span>
          <strong>${reading.observation.hasCurrentValue ? escapeHtml(formatValue(reading.value, definition)) : "—"}</strong>
          <span class="reading-freshness-label" data-observation="${escapeAttribute(reading.observation.state)}" title="${escapeAttribute(reading.observation.detail)}">${escapeHtml(reading.observation.label)}</span>
          <span class="live-node-condition" data-state="${escapeAttribute(reading.metricResult.state)}">${escapeHtml(stateConfig[reading.metricResult.state]?.label || "Unavailable")}</span>
        </div>
      `).join("");

      return `
        <section class="live-reading-group" data-expanded="${String(isExpanded)}">
          <article class="live-reading-row" data-state="${escapeAttribute(isAvailable ? typicalResult.state : "unavailable")}" data-observation="${escapeAttribute(observation.state)}" data-metric-card="${escapeAttribute(key)}">
            <button type="button" class="live-reading-identity live-reading-expand-control" data-live-reading-expand="${escapeAttribute(key)}" aria-expanded="${String(isExpanded)}" ${isAvailable ? "" : "disabled"}>
              <span class="live-reading-icon"><i class="fa-solid ${escapeAttribute(category.icon)}" aria-hidden="true"></i></span>
              <span><strong>${escapeHtml(getDiagnosticMetricLabel(definition.label))}</strong></span>
              <i class="fa-solid fa-chevron-down live-reading-expand-icon" aria-hidden="true"></i>
            </button>
            <div class="live-reading-value">
              <strong>${hasCurrentValue ? escapeHtml(formatValue(summary.medianValue, definition)) : "—"}</strong>
              <small>${exceptionLabel ? `<b class="live-reading-exception">${escapeHtml(exceptionLabel)}</b>` : escapeHtml(deviation)}</small>
            </div>
            <div class="live-reading-target">
              <span>${diagnosticText("Target", "Tikslas")}</span>
              <strong>${escapeHtml(formatRange(definition.optimal, definition))}</strong>
            </div>
            <div class="live-reading-position">
              ${visual ? `
                <span class="live-reading-track" aria-label="${diagnosticText("Section median position against target", "Sekcijos medianos padėtis tikslinio intervalo atžvilgiu")}">
                  <i class="live-reading-optimal" style="left:${visual.optimalStart.toFixed(2)}%;width:${Math.max(visual.optimalEnd - visual.optimalStart, 2).toFixed(2)}%"></i>
                  <i class="live-reading-marker" style="left:${visual.marker.toFixed(2)}%"></i>
                </span>
              ` : `<span class="live-reading-no-data">${diagnosticText("No sensor data", "Nėra sensoriaus duomenų")}</span>`}
            </div>
            <div class="live-reading-trend">
              <span>${diagnosticText("24h", "24 val.")}</span>
              <strong>${trend ? escapeHtml(trend.direction) : "—"}</strong>
              <small>${trend ? escapeHtml(formatSignedValue(trend.delta, definition)) : ""}</small>
            </div>
            <span class="live-reading-status" data-state="${escapeAttribute(isAvailable ? typicalResult.state : "unavailable")}">${escapeHtml(["offline", "missing", "not-installed"].includes(observation.state) ? observation.label : statusLabel)}</span>
            <button type="button" class="live-reading-trend-button" data-history-metric="${escapeAttribute(key)}" ${isAvailable ? "" : "disabled"}>
              ${diagnosticText("Trend", "Grafikas")}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
          </article>
          <div class="live-reading-node-detail" ${isExpanded ? "" : "hidden"}>
            <div class="live-reading-node-detail-head">
              <div>
                <strong>${escapeHtml(getDiagnosticMetricLabel(definition.label))} · ${diagnosticText("by node", "pagal mazgą")}</strong>
                <span>${escapeHtml(reportingText)}</span>
              </div>
              <button type="button" data-triage-action="nodes">${diagnosticText("Open Nodes", "Atidaryti mazgus")}</button>
            </div>
            <div class="live-node-reading-head" aria-hidden="true">
              <span>${diagnosticText("Node and position", "Mazgas ir vieta")}</span>
              <span>${diagnosticText("Sensor role", "Sensoriaus paskirtis")}</span>
              <span>${diagnosticText("Value", "Reikšmė")}</span>
              <span>${diagnosticText("Data", "Duomenys")}</span>
              <span>${diagnosticText("Condition", "Būsena")}</span>
            </div>
            ${nodeRows || `<div class="live-reading-node-empty">${diagnosticText("No sensors are assigned to this metric.", "Šiam parametrui nepriskirta sensorių.")}</div>`}
          </div>
        </section>
      `;
    }

    function renderLiveReadingsBoard(results, profile, site, zone) {
      const installedResults = results.filter((result) => result.available !== false);
      return `
        <div class="live-readings-table-head" aria-hidden="true">
          <span>${diagnosticText("Parameter", "Parametras")}</span>
          <span>${diagnosticText("Current", "Dabar")}</span>
          <span>${diagnosticText("Target", "Tikslas")}</span>
          <span>${diagnosticText("Position", "Padėtis")}</span>
          <span>${diagnosticText("Direction", "Kryptis")}</span>
          <span>${diagnosticText("Status", "Būsena")}</span>
          <span></span>
        </div>
        ${installedResults.map((result) => renderLiveReadingRow(
          result.key,
          profile.metrics[result.key],
          result,
          `${site.id}:${zone.id}:live-readings`,
          zone,
          getZoneMetricFreshness(zone, result.key)
        )).join("")}
      `;
    }

    function renderMetricCard(key, definition, result) {
      const category = getMetricCategory(key);
      const sliderScale = key === "batteryLevel" ? "descending" : "ascending";
      const sliderMin = (definition.displayRange || definition.critical)[0];
      const sliderMax = (definition.displayRange || definition.critical)[1];
      const sliderMinLabel = formatValue(sliderMin, definition);
      const sliderMaxLabel = formatValue(sliderMax, definition);
      const showDeviation = result.state !== "optimal";
      const statusText = showDeviation
        ? result.deviationText
            .replace("Below target by ", "Below by ")
            .replace("Above target by ", "Above by ")
        : "";
      if (result.available === false) {
        return `
          <article class="metric-card p-4" data-state="unavailable" data-metric-card="${key}">
            <div class="metric-card-head flex items-start justify-between gap-3">
              <div>
                <div class="metric-category-badge"><i class="fa-solid ${category.icon}"></i>${category.label}</div>
                <p class="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/38">Sensor not installed</p>
              </div>
              <div class="flex flex-col items-end gap-2 text-right">
                <span class="state-chip metric-state-chip" data-state="optimal" style="opacity:0.55;">Unavailable</span>
                <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/38">${definition.aggregation || "Block avg"}</p>
              </div>
            </div>
            <div class="metric-value-row mt-2" data-has-deviation="true">
              <div class="metric-deviation font-semibold text-ink/42">Excluded from index</div>
              <div class="metric-value-shell">
                <div class="metric-current-value font-extrabold text-ink/42">-</div>
              </div>
            </div>
            <div class="metric-scale mt-2">
              <input
                class="metric-slider"
                type="range"
                data-scale="${sliderScale}"
                disabled
                min="${sliderMin}"
                max="${sliderMax}"
                step="${stepFromDecimals(definition.decimals)}"
                value="${midpoint(definition.optimal)}"
              >
              <div class="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/36">
                <span>${sliderMinLabel}</span>
                <span>Not available</span>
                <span>${sliderMaxLabel}</span>
              </div>
            </div>
          </article>
        `;
      }

      return `
        <article class="metric-card p-4" data-state="${result.state}" data-metric-card="${key}">
          <div class="metric-card-head flex items-start justify-between gap-3">
            <div>
              <div class="metric-category-badge"><i class="fa-solid ${category.icon}"></i>${category.label}</div>
              <p class="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/42">${formatRange(definition.optimal, definition)}</p>
            </div>
            <div class="flex flex-col items-end gap-2 text-right">
              <span class="state-chip metric-state-chip" data-role="state-chip" data-state="${result.state}">${stateConfig[result.state].label}</span>
              <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">${definition.aggregation || "Block avg"}</p>
            </div>
          </div>
          <div class="metric-value-row mt-2" data-has-deviation="${showDeviation ? "true" : "false"}">
            <div data-role="deviation" data-state="${result.state}" class="metric-deviation font-semibold ${showDeviation ? "" : "hidden"}">${statusText}</div>
            <div class="metric-value-shell">
              <div data-role="current-value" class="metric-current-value font-extrabold text-ink">${formatValue(result.value, definition)}</div>
            </div>
          </div>
          <div class="metric-scale mt-2">
            <input
              class="metric-slider"
              type="range"
              data-metric-slider
              data-key="${key}"
              data-scale="${sliderScale}"
              min="${sliderMin}"
              max="${sliderMax}"
              step="${stepFromDecimals(definition.decimals)}"
              value="${result.value}"
            >
            <div class="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/42">
              <span>${sliderMinLabel}</span>
              <span>Test</span>
              <span>${sliderMaxLabel}</span>
              </div>
            </div>
            ${renderMetricHistoryButton(key)}
          </article>
        `;
      }

    function updateMetricCardElement(card, definition, result) {
      if (!card) return;
      if (result.available === false) return;

      card.dataset.state = result.state;

      const stateChip = card.querySelector('[data-role="state-chip"]');
      const currentValue = card.querySelector('[data-role="current-value"]');
      const deviation = card.querySelector('[data-role="deviation"]');
      const slider = card.querySelector('[data-metric-slider]');

      if (stateChip) {
        stateChip.dataset.state = result.state;
        stateChip.textContent = stateConfig[result.state].label;
      }

      if (currentValue) {
        currentValue.textContent = formatValue(result.value, definition);
      }

      if (deviation) {
        const showDeviation = result.state !== "optimal";
        deviation.textContent = showDeviation
          ? result.deviationText
              .replace("Below target by ", "Below by ")
              .replace("Above target by ", "Above by ")
          : "";
        deviation.dataset.state = result.state;
        deviation.className = `metric-deviation font-semibold ${showDeviation ? "" : "hidden"}`;
      }

      if (slider) {
        slider.value = result.value;
      }
    }

    function renderZoneCards(profile, results) {
      const nonOptimalResults = results.filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal");

      if (nonOptimalResults.length === 0) {
        return `
          <article class="zone-card p-5" data-state="optimal">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-moss">Stable block</p>
                <h4 class="mt-2 text-lg font-bold text-ink">All key blocks are stable</h4>
              </div>
              <span class="state-chip" data-state="optimal">Optimal</span>
            </div>
            <p class="mt-3 text-sm leading-6 text-ink/64">No urgent intervention is needed.</p>
          </article>
        `;
      }

      return nonOptimalResults.map((item) => {
        const definition = profile.metrics[item.key];
        return `
          <article class="zone-card p-5" data-state="${item.state}">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold ${item.state === "critical" ? "text-ember" : "text-amber"}">${item.state === "critical" ? "High priority" : "Medium priority"}</p>
                <h4 class="mt-2 text-lg font-bold text-ink">${definition.zone}</h4>
              </div>
              <span class="state-chip" data-state="${item.state}">${stateConfig[item.state].label}</span>
            </div>
            <p class="mt-3 text-sm leading-6 text-ink/66">${definition.action}</p>
            <div class="mt-4 rounded-[20px] bg-white/70 px-4 py-3 text-sm text-ink/66">
              <strong>${definition.label}</strong> | <strong>${formatValue(item.value, definition)}</strong>
            </div>
          </article>
        `;
      }).join("");
    }

    function renderPriorities(items) {
      return items.map((item) => `<div class="rounded-[22px] border border-black/6 bg-[#f7f2e8] px-4 py-3 leading-6">${escapeHtml(item)}</div>`).join("");
    }

    function evaluateZoneSnapshot(site, zone, readingsOverride = null) {
      const profile = cropProfiles[zone.profile];
      const readings = readingsOverride || (isApiDataMode() ? readingsFromApiObservations(latestReadingsBySectionId[zone.id]) : getZoneReadings(profile, zone, activeScenarioKey));
      const availableMetrics = new Set(zone.availableMetrics || []);
      const results = Object.entries(profile.metrics).map(([key, definition]) => {
        const isConfigured = availableMetrics.has(key);
        const hasLiveValue = Number.isFinite(Number(readings?.[key]));
        return {
          key,
          available: isConfigured && (!isApiDataMode() || hasLiveValue),
          ...(isConfigured
            ? evaluateMetricForReadings(definition, key, availableMetrics, readings)
            : { value: null, state: "unavailable", severity: 0, scalePosition: 0, deviationText: "Unavailable", narrative: "Sensor not installed." })
        };
      }).sort((left, right) => {
        if (left.available === right.available) return 0;
        return left.available === false ? 1 : -1;
      });

      const overall = deriveOverallState(results);
      return { site, zone, profile, results, overall };
    }

    function renderAlertRailFilters(filters, activeKey) {
      return filters.map((filter) => `
        <button
          type="button"
          class="alert-filter-chip"
          data-global-system-action
          data-alert-filter="${escapeAttribute(filter.key)}"
          data-active="${String(filter.key === activeKey)}"
          data-tone="${escapeAttribute(filter.tone || "neutral")}"
          aria-pressed="${String(filter.key === activeKey)}"
        >
          <span class="alert-filter-chip-label">${escapeHtml(filter.label)}</span>
          <span class="alert-filter-chip-count">${filter.count}</span>
        </button>
      `).join("");
    }

    function filterAlertRailItems(items, filterKey, activeSiteId) {
      switch (filterKey) {
        case "critical":
          return items.filter((item) => item.overall.state === "critical");
        case "warning":
          return items.filter((item) => item.overall.state === "warning");
        case "site":
          return items.filter((item) => item.site.id === activeSiteId);
        case "all":
        default:
          return items;
      }
    }

    function persistAlertActionState() {
      try {
        window.localStorage.setItem(alertActionStorageKey, JSON.stringify(alertActionState));
      } catch (error) {
        // The prototype remains usable if browser storage is unavailable.
      }
    }

    function formatAlertDuration(timestamp) {
      const minutes = Math.max(1, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} h ${minutes % 60} min`;
      return `${Math.floor(hours / 24)} d ${hours % 24} h`;
    }

    function buildAlertRecords(issues) {
      let changed = false;
      const records = issues.map((issue) => {
        const primaryResult = issue.results
          .filter((result) => result.available !== false && isGrowthMetricKey(result.key) && result.state !== "optimal")
          .sort((left, right) => right.severity - left.severity)[0];
        if (!primaryResult) return null;

        const definition = issue.profile.metrics[primaryResult.key];
        const id = `${issue.site.id}:${issue.zone.id}:${primaryResult.key}`;
        if (!alertActionState[id]) {
          // The actual start time will come from the backend; this keeps the prototype actionable today.
          alertActionState[id] = {
            status: "open",
            detectedAt: new Date(Date.now() - Math.round(18 + primaryResult.severity * 110) * 60000).toISOString(),
            updatedAt: null,
            updatedBy: null,
            snapshot: {
              siteId: issue.site.id,
              zoneId: issue.zone.id,
              metricKey: primaryResult.key,
              metricLabel: definition.label,
              value: formatValue(primaryResult.value, definition),
              deviation: primaryResult.deviationText,
              state: primaryResult.state
            }
          };
          changed = true;
        }

        const action = alertActionState[id];
        return {
          id,
          site: issue.site,
          zone: issue.zone,
          state: primaryResult.state,
          metricKey: primaryResult.key,
          metricLabel: definition.label,
          value: formatValue(primaryResult.value, definition),
          deviation: primaryResult.deviationText,
          detectedAt: action.detectedAt,
          status: action.status || "open",
          updatedAt: action.updatedAt || null,
          updatedBy: action.updatedBy || null
        };
      }).filter(Boolean);

      Object.entries(alertActionState).forEach(([id, action]) => {
        if (action.status !== "resolved" || records.some((record) => record.id === id) || !action.snapshot) return;
        const site = dashboardData.sites.find((item) => item.id === action.snapshot.siteId);
        const zone = site?.zones?.find((item) => item.id === action.snapshot.zoneId);
        if (!site || !zone) return;
        records.push({
          id,
          site,
          zone,
          state: action.snapshot.state || "optimal",
          metricKey: action.snapshot.metricKey,
          metricLabel: action.snapshot.metricLabel,
          value: action.snapshot.value,
          deviation: action.snapshot.deviation,
          detectedAt: action.detectedAt,
          status: "resolved",
          updatedAt: action.updatedAt || null,
          updatedBy: action.updatedBy || null
        });
      });

      if (changed) persistAlertActionState();
      return records;
    }

    function renderAlertsManagementPage(records) {
      currentAlertRecords = records;
      const statusOrder = ["critical", "warning", "acknowledged", "snoozed", "resolved"];
      const filters = [
        { key: "active", label: "Active", count: records.filter((record) => record.status !== "resolved").length },
        { key: "critical", label: "Critical", count: records.filter((record) => record.status !== "resolved" && record.state === "critical").length },
        { key: "warning", label: "Warning", count: records.filter((record) => record.status !== "resolved" && record.state === "warning").length },
        { key: "acknowledged", label: "Acknowledged", count: records.filter((record) => record.status === "acknowledged").length },
        { key: "snoozed", label: "Snoozed", count: records.filter((record) => record.status === "snoozed").length },
        { key: "resolved", label: "Resolved", count: records.filter((record) => record.status === "resolved").length }
      ];
      const selectedFilter = filters.some((filter) => filter.key === activeAlertsPageFilter) ? activeAlertsPageFilter : "active";
      activeAlertsPageFilter = selectedFilter;
      const visibleRecords = records.filter((record) => {
        if (selectedFilter === "active") return record.status !== "resolved";
        if (statusOrder.includes(selectedFilter)) {
          if (selectedFilter === "critical" || selectedFilter === "warning") return record.status !== "resolved" && record.state === selectedFilter;
          return record.status === selectedFilter;
        }
        return true;
      });
      const criticalCount = filters.find((filter) => filter.key === "critical").count;
      const warningCount = filters.find((filter) => filter.key === "warning").count;
      const resolvedCount = filters.find((filter) => filter.key === "resolved").count;

      elements.alertsManagementShell.innerHTML = `
        <div class="surface rounded-[34px] p-6 md:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.28em] text-pine/56">Alerts</p>
              <h2 class="mt-2 font-display text-3xl font-bold text-ink">Work the issues that need attention</h2>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/62">Each alert is tied to an Area, Section and live sensor reading. Actions are recorded locally until the backend is connected.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="state-chip" data-state="critical">${criticalCount} critical</span>
              <span class="state-chip" data-state="warning">${warningCount} warning</span>
              <span class="state-chip" data-state="optimal">${resolvedCount} resolved</span>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap gap-2" role="toolbar" aria-label="Alert status filters">
            ${filters.map((filter) => `<button type="button" data-alert-page-filter="${filter.key}" data-active="${String(filter.key === selectedFilter)}" class="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink/68 transition data-[active=true]:border-pine/20 data-[active=true]:bg-pine data-[active=true]:text-white">${escapeHtml(filter.label)} <span class="ml-1 opacity-70">${filter.count}</span></button>`).join("")}
          </div>

          <div class="mt-6 grid gap-3">
            ${visibleRecords.length ? visibleRecords.map((record) => `
              <article class="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_12px_28px_rgba(20,32,27,0.04)]" data-alert-record="${escapeAttribute(record.id)}">
                <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="state-chip" data-state="${record.state}">${stateConfig[record.state].label}</span>
                      ${record.status !== "open" ? `<span class="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink/60">${escapeHtml(record.status)}</span>` : ""}
                      <span class="text-xs font-semibold text-ink/46">Open for ${formatAlertDuration(record.detectedAt)}</span>
                    </div>
                    <h3 class="mt-3 text-lg font-bold text-ink">${escapeHtml(record.metricLabel)}: ${escapeHtml(record.value)}</h3>
                    <p class="mt-1 text-sm text-ink/64">${escapeHtml(record.site.name)} · ${escapeHtml(record.zone.name)} · ${escapeHtml(record.deviation)}</p>
                    ${record.updatedAt ? `<p class="mt-2 text-xs text-ink/46">${escapeHtml(record.status)} by ${escapeHtml(record.updatedBy || "team member")} · ${new Date(record.updatedAt).toLocaleString("lt-LT", { dateStyle: "medium", timeStyle: "short" })}</p>` : ""}
                  </div>
                  <div class="flex flex-wrap items-center gap-2 xl:justify-end">
                    <button type="button" data-alert-history="${escapeAttribute(record.id)}" class="rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink/72">View trend</button>
                    ${record.status === "open" ? `<button type="button" data-alert-action="acknowledged" data-alert-id="${escapeAttribute(record.id)}" class="rounded-xl border border-pine/18 bg-pine/8 px-3.5 py-2.5 text-sm font-semibold text-pine">Acknowledge</button>` : ""}
                    ${record.status !== "resolved" ? `<button type="button" data-alert-action="snoozed" data-alert-id="${escapeAttribute(record.id)}" class="rounded-xl border border-amber/18 bg-amber/8 px-3.5 py-2.5 text-sm font-semibold text-amber">Snooze</button><button type="button" data-alert-action="resolved" data-alert-id="${escapeAttribute(record.id)}" class="rounded-xl bg-pine px-3.5 py-2.5 text-sm font-semibold text-white">Resolve</button>` : ""}
                  </div>
                </div>
              </article>
            `).join("") : `
              <div class="rounded-[24px] border border-dashed border-black/12 bg-[#fbfaf7] p-8 text-center">
                <div class="text-lg font-bold text-ink">No ${escapeHtml(selectedFilter)} alerts</div>
                <p class="mt-2 text-sm text-ink/58">There is nothing to action in this list right now.</p>
              </div>
            `}
          </div>
        </div>
      `;
    }

    function openAlertHistory(record) {
      activeSiteId = record.site.id;
      activeZoneId = record.zone.id;
      activeProfileKey = record.zone.profile;
      activeViewScope = "zone";
      activeTrendMetricKey = record.metricKey;
      activeTrendMetricKeys = [record.metricKey];
      activePrimaryPage = "history";
      sidebarActionOverride = null;
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
      syncTopLevelRoute("/history");
      scrollToSection("historySection");
    }

    function renderGlobalSystemList(items, options = {}) {
      const { activeSiteId, activeFilterKey = "all" } = options;
      if (items.length === 0) {
        const filterLabel = activeFilterKey === "critical"
          ? "critical incidents"
          : activeFilterKey === "warning"
            ? "warning incidents"
            : activeFilterKey === "site"
              ? "active incidents in this location"
              : "active incidents";

        return `
          <div class="workbench-empty-card">
            <div class="workbench-empty-title">No ${escapeHtml(filterLabel)} right now.</div>
            <p class="workbench-empty-note">Switch filters or return to all active incidents to review the full system queue.</p>
            ${activeFilterKey !== "all" ? `
              <button type="button" class="workbench-empty-button" data-global-system-action data-alert-filter="all">
                <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                Show all active
              </button>
            ` : ""}
          </div>
        `;
      }

      return items.map((item) => `
        <button
          type="button"
          class="alert-rail-item"
          data-state="${item.overall.state}"
          data-global-system-action
          data-alert-site-id="${escapeAttribute(item.site.id)}"
          data-alert-zone-id="${escapeAttribute(item.zone.id)}"
        >
          <div class="alert-rail-item-top">
            <div class="min-w-0">
              <div class="alert-rail-item-kicker">${item.site.id === activeSiteId ? "Current location" : "System queue"} &middot; ${escapeHtml(item.site.name)}</div>
              <h4 class="alert-rail-item-title">${escapeHtml(item.zone.name)}</h4>
            </div>
            <span class="state-chip shrink-0" data-state="${item.overall.state}">${stateConfig[item.overall.state].label}</span>
          </div>
          <p class="alert-rail-item-summary">${escapeHtml(item.summary)}</p>
          <div class="alert-rail-item-footer">
            <span class="alert-rail-item-score">Block score ${item.overall.indexScore}%</span>
            <span class="alert-rail-item-link">
              Open block
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </span>
          </div>
        </button>
      `).join("");
    }

    function applyStateChip(el, stateKey, text) {
      el.dataset.state = stateKey;
      el.textContent = text || stateConfig[stateKey].label;
    }

    function setHeaderBatteryDropdownOpen(isOpen) {
      isHeaderBatteryDropdownOpen = Boolean(isOpen);
      elements.headerBatteryDropdown.classList.toggle("is-open", isHeaderBatteryDropdownOpen);
      elements.headerBatteryDropdown.setAttribute("aria-hidden", String(!isHeaderBatteryDropdownOpen));
      elements.headerBatteryIndicator.setAttribute("aria-expanded", String(isHeaderBatteryDropdownOpen));
    }

    function renderHeaderBatteryDropdown(lowNodes) {
      const sortedNodes = lowNodes.slice().sort((left, right) => {
        if (left.level !== right.level) return left.level - right.level;
        return left.id.localeCompare(right.id);
      });

      elements.headerBatteryDropdownCount.textContent = `${sortedNodes.length} ${sortedNodes.length === 1 ? "node" : "nodes"}`;

      if (sortedNodes.length === 0) {
        elements.headerBatteryDropdownContent.innerHTML = `
          <div class="header-battery-dropdown-empty">
            No nodes are currently below battery threshold.
          </div>
        `;
        return;
      }

      elements.headerBatteryDropdownContent.innerHTML = `
        <div class="header-battery-dropdown-list">
          ${sortedNodes.map((node) => {
            const nodeState = node.level < criticalBatteryThreshold ? "critical" : "warning";
            return `
              <div class="header-battery-dropdown-item" data-state="${nodeState}">
                <div class="min-w-0">
                  <div class="font-bold text-ink">${escapeHtml(node.name || node.id)}</div>
                  <div class="mt-1 text-sm text-ink/58">${escapeHtml(node.id)} &middot; ${escapeHtml(node.zoneName)}</div>
                  <div class="mt-1 text-sm text-ink/48">${escapeHtml(node.siteName)}</div>
                </div>
                <span class="header-battery-dropdown-badge shrink-0" data-state="${nodeState}">
                  <i class="fa-solid fa-battery-half" aria-hidden="true"></i>
                  ${node.level}%
                </span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderOverviewTriage({
      site,
      zone,
      profile,
      results,
      displayedOverallState,
      globalState,
      allSystemIssues,
      systemLowBatteryNodes,
      unavailableCount,
      availableResults,
      growthResults,
      timestamp
    }) {
      const prioritySnapshot = allSystemIssues[0] || {
        site,
        zone,
        profile,
        results,
        overall: displayedOverallState
      };
      const priorityResult = prioritySnapshot.results
        .filter((result) => result.available !== false && isGrowthMetricKey(result.key))
        .sort((left, right) => {
          if (left.state !== "optimal" && right.state === "optimal") return -1;
          if (left.state === "optimal" && right.state !== "optimal") return 1;
          return right.severity - left.severity;
        })[0] || null;
      const priorityDefinition = priorityResult
        ? prioritySnapshot.profile.metrics[priorityResult.key]
        : null;
      const selectedPrimaryResult = results
        .filter((result) => result.available !== false && isGrowthMetricKey(result.key))
        .sort((left, right) => {
          if (left.state !== "optimal" && right.state === "optimal") return -1;
          if (left.state === "optimal" && right.state !== "optimal") return 1;
          return right.severity - left.severity;
        })[0] || null;
      const selectedPrimaryDefinition = selectedPrimaryResult
        ? profile.metrics[selectedPrimaryResult.key]
        : null;
      const priorityTitle = priorityResult && priorityDefinition
        ? `${getDecisionVerb(priorityResult, priorityDefinition)} ${priorityDefinition.label.toLowerCase()}`
        : "Keep monitoring current conditions";
      const actionGuidance = {
        humidity: "Check humidifier output and ventilation rate.",
        airTemp: "Review heating, cooling, and ventilation settings.",
        co2: "Check CO2 supply and ventilation timing.",
        vpd: "Review temperature and humidity together before adjusting the climate.",
        soilTemp: "Inspect root-zone heating and irrigation temperature.",
        waterTemp: "Check the irrigation water temperature before the next cycle."
      };
      const suggestedAction = priorityResult
        ? actionGuidance[priorityResult.key] || `Review the source of the ${priorityDefinition.label.toLowerCase()} deviation.`
        : "No immediate intervention is required.";
      const currentScore = displayedOverallState.indexScore;
      const previousScore = Math.min(100, currentScore + 6);
      const scoreDelta = currentScore - previousScore;
      const preferredMetricOrder = ["humidity", "airTemp", "co2"];
      const readingItems = [...availableResults]
        .sort((left, right) => {
          const leftIssue = left.state === "optimal" ? 1 : 0;
          const rightIssue = right.state === "optimal" ? 1 : 0;
          if (leftIssue !== rightIssue) return leftIssue - rightIssue;
          return preferredMetricOrder.indexOf(left.key) - preferredMetricOrder.indexOf(right.key);
        })
        .slice(0, 3);
      const metricKey = priorityResult?.key || readingItems[0]?.key || "humidity";
      const farmState = getZoneFarmState(site, zone, results);
      latestRenderedFarmState = farmState;
      updateClientConnectionStatus();
      const nodeSummary = farmState.nodeSummary || { live: 0, delayed: 0, stale: 0, offline: 0 };
      const dataStatusLabel = getFreshnessLabel(farmState.dataStatus);
      const hasUsableCurrentData = farmState.coverage.reportingNodes > 0
        && farmState.coverage.liveMetrics > 0;
      const effectivePriorityTitle = hasUsableCurrentData
        ? priorityTitle
        : diagnosticText("Restore sensor data", "Atkurkite sensorių duomenis");
      const effectiveSuggestedAction = hasUsableCurrentData
        ? suggestedAction
        : diagnosticText(
            "Check node power, gateway coverage, and the latest uplink.",
            "Patikrinkite mazgų maitinimą, ryšio aprėptį ir paskutinį duomenų siuntimą."
          );

      const actionQueue = [
        {
          tone: hasUsableCurrentData ? priorityResult?.state || "optimal" : "warning",
          title: hasUsableCurrentData
            ? priorityResult && priorityDefinition ? priorityTitle : "Continue monitoring"
            : effectivePriorityTitle,
          note: hasUsableCurrentData
            ? priorityResult ? priorityResult.deviationText : "All installed growth metrics are inside target."
            : farmState.lastKnownCondition
              ? `Last known condition: ${farmState.lastKnownCondition.status}.`
              : "Current growing conditions cannot be verified.",
          action: hasUsableCurrentData ? "trend" : "nodes",
          label: hasUsableCurrentData ? "View trend" : "Open nodes"
        },
        farmState.dataStatus !== "live"
          ? {
              tone: "warning",
              title: `${dataStatusLabel} sensor delivery`,
              note: `${nodeSummary.live} of ${farmState.coverage.registeredNodes} nodes report on time. ${nodeSummary.delayed} delayed, ${nodeSummary.stale} stale, ${nodeSummary.offline} offline.`,
              action: "nodes",
              label: "Check nodes"
            }
          : null,
        systemLowBatteryNodes.length > 0
          ? {
              tone: "warning",
              title: `Check ${systemLowBatteryNodes.length} low-battery node${systemLowBatteryNodes.length === 1 ? "" : "s"}`,
              note: `Lowest battery: ${systemLowBatteryNodes[0].id} at ${systemLowBatteryNodes[0].level}%.`,
              action: "nodes",
              label: "Open nodes"
            }
          : null,
        allSystemIssues.length > 1
          ? {
              tone: globalState,
              title: `Compare ${allSystemIssues.length} affected sections`,
              note: "Check whether the main issue is local or visible elsewhere in the system.",
              action: "alerts",
              label: "Review alerts"
            }
          : null,
        unavailableCount > 0
          ? {
              tone: "warning",
              title: `Review ${unavailableCount} missing metric${unavailableCount === 1 ? "" : "s"}`,
              note: "Missing readings reduce confidence in the selected section summary.",
              action: "nodes",
              label: "Check sensors"
            }
          : null
      ].filter(Boolean).slice(0, 3);

      elements.overviewTriageSection.dataset.state = displayedOverallState.state;
      elements.overviewTriageSection.innerHTML = `
        <div class="triage-priority-score-grid">
          <article class="triage-priority-card" data-state="${escapeAttribute(priorityResult?.state || "optimal")}">
            <div class="triage-title-row">
              <div class="triage-card-kicker">Today’s priority</div>
              <span class="overview-data-status" data-freshness="${escapeAttribute(farmState.dataStatus)}">
                <i class="fa-solid ${farmState.dataStatus === "live" ? "fa-signal" : farmState.dataStatus === "offline" ? "fa-link-slash" : "fa-clock"}" aria-hidden="true"></i>
                ${escapeHtml(dataStatusLabel)} · ${nodeSummary.live}/${farmState.coverage.registeredNodes} nodes
              </span>
            </div>
            <div class="triage-location-line">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
              ${escapeHtml(prioritySnapshot.site.name)} <span>›</span> ${escapeHtml(prioritySnapshot.zone.name)}
            </div>
            <h2>${escapeHtml(effectivePriorityTitle)}</h2>
            ${hasUsableCurrentData && priorityResult && priorityDefinition ? `
              <div class="triage-priority-facts">
                <div><span>Current</span><strong>${escapeHtml(formatValue(priorityResult.value, priorityDefinition))}</strong></div>
                <div><span>Target</span><strong>${escapeHtml(formatRange(priorityDefinition.optimal, priorityDefinition))}</strong></div>
                <div><span>Gap</span><strong>${escapeHtml(priorityResult.deviationText)}</strong></div>
              </div>
            ` : ""}
            <div class="triage-guidance">
              <span>Suggested action</span>
              <strong>${escapeHtml(effectiveSuggestedAction)}</strong>
            </div>
            <div class="triage-button-row">
              <button type="button" class="triage-primary-button" data-triage-action="trend" data-metric-key="${escapeAttribute(metricKey)}">
                View trend <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
              </button>
              <button type="button" class="triage-secondary-button" data-triage-action="alerts">Review alerts</button>
            </div>
          </article>

          <article class="triage-score-card" data-state="${escapeAttribute(displayedOverallState.state)}">
            <div>
              <div class="triage-card-kicker">Growing conditions score</div>
              <div class="triage-score-value">${currentScore}</div>
              <div class="triage-score-state">${escapeHtml(getHealthStateLabel(displayedOverallState.state))}</div>
            </div>
            <dl class="triage-score-details">
              <div><dt>Main drag</dt><dd>${escapeHtml(selectedPrimaryDefinition?.label || "None")}</dd></div>
              <div><dt>Missing metrics</dt><dd>${unavailableCount}</dd></div>
              <div><dt>24h trend</dt><dd>${previousScore} → ${currentScore} <span>${scoreDelta < 0 ? "↓" : scoreDelta > 0 ? "↑" : "="} ${Math.abs(scoreDelta)} in 24h</span></dd></div>
            </dl>
          </article>
        </div>

        <section class="triage-section">
          <div class="triage-section-heading">
            <div><span class="triage-eyebrow">Live readings</span><h3>Current section snapshot</h3></div>
            <span>${escapeHtml(site.name)} · ${escapeHtml(zone.name)}</span>
          </div>
          <div class="triage-readings-grid">
            ${readingItems.map((result) => {
              const definition = profile.metrics[result.key];
              const readingFreshness = getZoneMetricFreshness(zone, result.key);
              const observation = getObservationPresentation(zone, result.key, result, readingFreshness);
              const metricSummary = getNodeMetricSummary(zone, result.key, definition, result);
              const range = metricSummary.min === null || metricSummary.max === null
                ? "—"
                : `${formatValue(metricSummary.min, definition)}–${formatValue(metricSummary.max, definition)}`;
              const exceptionLabel = metricSummary.localOutliers.length > 0
                ? diagnosticText(
                    `${metricSummary.localOutliers.length} local exception${metricSummary.localOutliers.length === 1 ? "" : "s"}`,
                    `${metricSummary.localOutliers.length} ${metricSummary.localOutliers.length === 1 ? "lokali išimtis" : "lokalios išimtys"}`
                  )
                : "";
              const reportingSummary = diagnosticText(
                `${metricSummary.reportingCount}/${metricSummary.installedCount} reporting`,
                `${metricSummary.reportingCount}/${metricSummary.installedCount} siunčia`
              );
              return `
                <article class="triage-reading" data-state="${escapeAttribute(metricSummary.medianResult.state)}" data-observation="${escapeAttribute(observation.state)}">
                  <div><span>${escapeHtml(definition.label)}</span><strong>${metricSummary.medianValue !== null ? escapeHtml(formatValue(metricSummary.medianValue, definition)) : "—"}</strong></div>
                  <span class="triage-reading-state">${escapeHtml(exceptionLabel || (["offline", "missing", "not-installed"].includes(observation.state) ? observation.label : stateConfig[metricSummary.medianResult.state]?.label || "Unavailable"))}</span>
                  <small>${escapeHtml(reportingSummary)} · ${escapeHtml(range)} · <b class="reading-freshness-label" data-observation="${escapeAttribute(observation.state)}" title="${escapeAttribute(observation.detail)}">${escapeHtml(observation.label)}</b></small>
                </article>
              `;
            }).join("")}
          </div>
        </section>

        <div class="triage-bottom-grid">
          <section class="triage-section triage-action-section">
            <div class="triage-section-heading">
              <div><span class="triage-eyebrow">Action queue</span><h3>Next three actions</h3></div>
            </div>
            <ol class="triage-action-list">
              ${actionQueue.map((item, index) => `
                <li data-tone="${escapeAttribute(item.tone)}">
                  <span class="triage-action-index">${index + 1}</span>
                  <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.note)}</p></div>
                  <button type="button" data-triage-action="${escapeAttribute(item.action)}" data-metric-key="${escapeAttribute(metricKey)}">${escapeHtml(item.label)}</button>
                </li>
              `).join("")}
            </ol>
          </section>

          <section class="triage-section triage-reliability-section">
            <div class="triage-section-heading">
              <div><span class="triage-eyebrow">Data and hardware</span><h3>${escapeHtml(dataStatusLabel)} data</h3></div>
            </div>
            <div class="triage-reliability-score" data-freshness="${escapeAttribute(farmState.dataStatus)}"><strong>${farmState.coverage.liveMetrics}/${farmState.coverage.expectedMetrics}</strong><span>metrics live now</span></div>
            <div class="triage-reliability-facts">
              <span><i class="fa-solid fa-signal" aria-hidden="true"></i>${nodeSummary.live} live · ${nodeSummary.delayed} delayed</span>
              <span><i class="fa-solid fa-clock" aria-hidden="true"></i>${nodeSummary.stale} stale · ${nodeSummary.offline} offline</span>
              <span><i class="fa-solid fa-battery-half" aria-hidden="true"></i>${systemLowBatteryNodes.length} low-battery nodes</span>
            </div>
            <div class="triage-button-row">
              <button type="button" class="triage-secondary-button" data-triage-action="nodes">Open nodes</button>
              <button type="button" class="triage-secondary-button" data-triage-action="trend" data-metric-key="${escapeAttribute(metricKey)}">Open trends</button>
            </div>
          </section>
        </div>
      `;
    }

    function diagnosticText(english, lithuanian) {
      return interfaceLanguage === "lt" ? lithuanian : english;
    }

    function getDiagnosticMetricLabel(label) {
      return interfaceLanguage === "lt" ? translateInterfaceText(label) : label;
    }

    function getDiagnosticTrend(result, definition, scopeSeed) {
      const series = buildTrendSeries({
        key: result.key,
        value: result.value,
        state: result.state,
        definition,
        optimalRange: definition.optimal
      }, "24h", scopeSeed);
      const start = series.values[0];
      const end = series.values[series.values.length - 1];
      const distanceFromTarget = (value) => {
        if (value < definition.optimal[0]) return definition.optimal[0] - value;
        if (value > definition.optimal[1]) return value - definition.optimal[1];
        return 0;
      };
      const startDistance = distanceFromTarget(start);
      const endDistance = distanceFromTarget(end);
      const tolerance = Math.max(Math.abs(definition.optimal[1] - definition.optimal[0]) * 0.015, 0.001);
      const direction = endDistance > startDistance + tolerance
        ? diagnosticText("Worsening", "Blogėja")
        : endDistance < startDistance - tolerance
          ? diagnosticText("Improving", "Gerėja")
          : diagnosticText("Stable", "Stabili");

      return {
        start,
        end,
        delta: end - start,
        direction,
        series
      };
    }

    function getDiagnosticImpact(result) {
      if (!result || result.state === "optimal") return "None";
      if (result.state === "critical" || result.severity >= 0.62) return "High";
      if (result.severity >= 0.28) return "Medium";
      return "Low";
    }

    function getDiagnosticAction(metricKey, label) {
      const actions = {
        humidity: ["Check humidifier output, ventilation rate, fan direction, and local airflow.", "Patikrinkite drėkintuvo veikimą, vėdinimo intensyvumą, ventiliatorių kryptį ir vietinį oro judėjimą."],
        airTemp: ["Check heating, cooling, ventilation, and nearby air inlets.", "Patikrinkite šildymą, vėsinimą, vėdinimą ir artimiausias oro įleidimo angas."],
        co2: ["Check CO2 supply timing, valves, and ventilation overlap.", "Patikrinkite CO2 tiekimo laiką, vožtuvus ir ar tiekimas nesutampa su intensyviu vėdinimu."],
        vpd: ["Review temperature and humidity together before changing either control.", "Prieš keisdami valdymą, kartu įvertinkite temperatūrą ir santykinę drėgmę."],
        soilTemp: ["Inspect root-zone heating and irrigation water temperature.", "Patikrinkite šaknų zonos šildymą ir laistymo vandens temperatūrą."],
        waterTemp: ["Check irrigation storage and delivery temperature.", "Patikrinkite laistymo vandens laikymo ir tiekimo temperatūrą."]
      };
      const action = actions[metricKey];
      if (action) return diagnosticText(action[0], action[1]);
      return diagnosticText(
        `Inspect the operating conditions that influence ${String(label || "this metric").toLowerCase()}.`,
        `Patikrinkite darbo sąlygas, kurios veikia rodiklį „${getDiagnosticMetricLabel(label || "šis rodiklis")}“.`
      );
    }

    function getDiagnosticVerification(metricKey, definition) {
      const checks = {
        humidity: [["Humidifier output", "Drėkintuvo veikimą"], ["Ventilation rate", "Vėdinimo intensyvumą"], ["Fan direction", "Ventiliatorių kryptį"], ["Open doors or vents", "Atviras duris ar angas"], ["Sensor placement", "Sensoriaus vietą"]],
        airTemp: [["Heating or cooling output", "Šildymo ar vėsinimo veikimą"], ["Vent position", "Vėdinimo angų padėtį"], ["Airflow distribution", "Oro srauto pasiskirstymą"], ["Sensor placement", "Sensoriaus vietą"]],
        co2: [["CO2 supply", "CO2 tiekimą"], ["Valve timing", "Vožtuvų veikimo laiką"], ["Ventilation overlap", "Sutapimą su vėdinimu"], ["Sensor placement", "Sensoriaus vietą"]],
        vpd: [["Temperature reading", "Temperatūros rodmenį"], ["Humidity reading", "Drėgmės rodmenį"], ["Airflow changes", "Oro srauto pokyčius"], ["Sensor agreement", "Sensorių rodmenų sutapimą"]],
        soilTemp: [["Root-zone heating", "Šaknų zonos šildymą"], ["Irrigation temperature", "Laistymo temperatūrą"], ["Sensor contact", "Sensoriaus kontaktą"]],
        waterTemp: [["Storage temperature", "Laikymo temperatūrą"], ["Pipe exposure", "Vamzdžių aplinkos poveikį"], ["Sensor immersion", "Sensoriaus panardinimą"]]
      };
      const fallbackChecks = [["Control output", "Valdymo įrangos veikimą"], ["Airflow or water flow", "Oro arba vandens srautą"], ["Sensor placement", "Sensoriaus vietą"]];
      return {
        checks: (checks[metricKey] || fallbackChecks).map((check) => diagnosticText(check[0], check[1])),
        success: diagnosticText(
          `Reading remains inside ${formatRange(definition.optimal, definition)} for at least 30 minutes.`,
          `Rodmuo bent 30 minučių išlieka intervale ${formatRange(definition.optimal, definition)}.`
        )
      };
    }

    function getDiagnosticDecisionVerb(result, definition) {
      const verb = getDecisionVerb(result, definition);
      const translations = {
        Monitor: "Stebėti",
        Increase: "Padidinti",
        Reduce: "Sumažinti",
        Check: "Patikrinti"
      };
      return interfaceLanguage === "lt" ? translations[verb] || verb : verb;
    }

    function getDiagnosticImpactText(metricKey, label) {
      if (interfaceLanguage !== "lt") return getDecisionImpactText(metricKey, label);
      const impactMap = {
        humidity: "Tikėtinas poveikis: VPD artėja prie tikslinio intervalo, o augalų vandens streso rizika mažėja.",
        vpd: "Tikėtinas poveikis: transpiracijos intensyvumas artėja prie kultūros profilio tikslo.",
        co2: "Tikėtinas poveikis: fotosintezės sąlygos tampa stabilesnės.",
        airTemp: "Tikėtinas poveikis: mažėja klimato stresas, o VPD vertinimas tampa patikimesnis.",
        soilTemp: "Tikėtinas poveikis: šaknų zonos veikla tampa stabilesnė.",
        waterTemp: "Tikėtinas poveikis: šaknų zonos temperatūra artėja prie rekomenduojamo intervalo."
      };
      return impactMap[metricKey] || `Tikėtinas poveikis: rodiklis „${getDiagnosticMetricLabel(label || "šis rodiklis")}“ artėja prie kultūros profilio tikslo.`;
    }

    function getDiagnosticImpactLabel(impact) {
      const translations = { None: "Nėra", Low: "Mažas", Medium: "Vidutinis", High: "Didelis", "Trust only": "Tik patikimumui" };
      return interfaceLanguage === "lt" ? translations[impact] || impact : impact;
    }

    function getDiagnosticDeviationText(result) {
      const text = String(result?.deviationText || "");
      if (interfaceLanguage !== "lt") return text;
      return text
        .replace(/^Below target by (.+)$/i, "Žemiau tikslo: $1")
        .replace(/^Above target by (.+)$/i, "Virš tikslo: $1");
    }

    function getDiagnosticDurationText(value) {
      const text = String(value || "");
      if (interfaceLanguage !== "lt") return text;
      return text
        .replace(/(\d+)\s+h\b/g, "$1 val.")
        .replace(/(\d+)\s+min\s+ago\b/gi, "prieš $1 min.")
        .replace(/(\d+)\s+min\b(?!\.)/g, "$1 min.");
    }

    function getDiagnosticActionTitle(result, definition, label) {
      if (interfaceLanguage !== "lt") {
        return result ? `${getDecisionVerb(result, definition)} ${String(label).toLowerCase()}` : "Continue routine monitoring";
      }
      if (!result || !definition) return "Tęsti įprastą stebėjimą";
      const accusativeLabels = {
        humidity: "santykinę drėgmę",
        airTemp: "oro temperatūrą",
        co2: "CO2 koncentraciją",
        vpd: "VPD",
        soilTemp: "substrato temperatūrą",
        waterTemp: "vandens temperatūrą"
      };
      return `${getDiagnosticDecisionVerb(result, definition)} ${accusativeLabels[result.key] || String(label).toLowerCase()}`;
    }

    function getDiagnosticDeviationVisual(result, definition) {
      const scale = definition.critical || definition.warning || definition.optimal;
      const scaleMin = Math.min(scale[0], definition.optimal[0], result.value);
      const scaleMax = Math.max(scale[1], definition.optimal[1], result.value);
      const span = Math.max(scaleMax - scaleMin, 0.001);
      const toPercent = (value) => clamp(((value - scaleMin) / span) * 100, 2, 98);

      return {
        marker: toPercent(result.value),
        optimalStart: toPercent(definition.optimal[0]),
        optimalEnd: toPercent(definition.optimal[1])
      };
    }

    function getSnapshotPrimaryIssue(snapshot) {
      return snapshot.results
        .filter((result) => result.available !== false && isGrowthMetricKey(result.key) && result.state !== "optimal")
        .sort((left, right) => right.severity - left.severity)[0] || null;
    }

    function renderDetailedDiagnostics({
      site,
      zone,
      profile,
      results,
      growthResults,
      availableResults,
      unavailableResults,
      displayedOverallState,
      siteSnapshots,
      alertRecords,
      zoneBatteryNodes,
      coverageOverride = null,
      isSiteView = false,
      timestamp
    }) {
      const rankedGrowthResults = [...availableResults].sort((left, right) => {
        if (left.state !== "optimal" && right.state === "optimal") return -1;
        if (left.state === "optimal" && right.state !== "optimal") return 1;
        return right.severity - left.severity;
      });
      const primaryResult = rankedGrowthResults[0] || null;
      const primaryDefinition = primaryResult ? profile.metrics[primaryResult.key] : null;
      const coverage = coverageOverride || getCoverageStatsFromResults(results);
      const primaryAlert = primaryResult
        ? alertRecords.find((record) =>
            record.site.id === site.id
            && record.zone.id === zone.id
            && record.metricKey === primaryResult.key
          )
        : null;
      const primaryTrend = primaryResult && primaryDefinition
        ? getDiagnosticTrend(primaryResult, primaryDefinition, `${site.id}:${zone.id}:diagnostic`)
        : null;
      const siteIssueRows = siteSnapshots.map((snapshot) => {
        const issue = getSnapshotPrimaryIssue(snapshot);
        const definition = issue ? snapshot.profile.metrics[issue.key] : null;
        return { snapshot, issue, definition };
      });
      const sameIssueRows = primaryResult
        ? siteIssueRows.filter((row) => row.issue?.key === primaryResult.key)
        : [];
      const isSystemicPattern = sameIssueRows.length >= 2;
      const scoreImpact = getDiagnosticImpact(primaryResult);
      const previousScore = Math.min(100, displayedOverallState.indexScore + 6);
      const selectedLowBatteryNodes = zoneBatteryNodes.filter((node) => node.state !== "optimal");
      const verification = primaryDefinition
        ? getDiagnosticVerification(primaryResult.key, primaryDefinition)
        : {
            checks: [diagnosticText("Confirm current sensor readings", "Patvirtinti dabartinius sensorių rodmenis")],
            success: diagnosticText("No new warning appears during the next reading cycle.", "Per kitą matavimo ciklą neatsiranda naujų perspėjimų.")
          };
      const suggestedAction = primaryDefinition
        ? getDiagnosticAction(primaryResult.key, primaryDefinition.label)
        : diagnosticText("Continue routine monitoring.", "Tęskite įprastą stebėjimą.");
      const narrativeSeverity = primaryResult?.state === "critical"
        ? diagnosticText("Critical deviation", "Kritinis nuokrypis")
        : primaryResult?.state === "warning"
          ? diagnosticText("Moderate deviation", "Vidutinis nuokrypis")
          : diagnosticText("No active growth deviation", "Aktyvių auginimo nuokrypių nėra");
      const confidenceLabel = coverage.unavailable === 0 && selectedLowBatteryNodes.length === 0
        ? diagnosticText("Full coverage", "Pilna aprėptis")
        : coverage.available >= Math.ceil(coverage.total * 0.7)
          ? diagnosticText("Partial but usable", "Dalinė, bet pakankama")
          : diagnosticText("Limited", "Ribota");
      const trendRows = rankedGrowthResults.slice(0, 4).map((result) => {
        const definition = profile.metrics[result.key];
        return {
          result,
          definition,
          trend: getDiagnosticTrend(result, definition, `${site.id}:${zone.id}:diagnostic-table`)
        };
      });
      const factors = [
        ...trendRows.map((item) => ({
          label: getDiagnosticMetricLabel(item.definition.label),
          current: formatValue(item.result.value, item.definition),
          target: formatRange(item.definition.optimal, item.definition),
          state: item.result.state,
          visual: getDiagnosticDeviationVisual(item.result, item.definition),
          impact: getDiagnosticImpact(item.result),
          trend: item.trend.direction,
          duration: item.result.key === primaryResult?.key && primaryAlert
            ? getDiagnosticDurationText(formatAlertDuration(primaryAlert.detectedAt))
            : item.result.state === "optimal"
              ? diagnosticText("In range", "Normoje")
              : diagnosticText("Latest cycle", "Naujausias ciklas")
        })),
        {
          label: diagnosticText("Data coverage", "Duomenų aprėptis"),
          current: `${coverage.available}/${coverage.total}`,
          target: `${coverage.total}/${coverage.total}`,
          state: coverage.unavailable > 0 ? "warning" : "optimal",
          visual: null,
          impact: coverage.unavailable > 0 ? "Trust only" : "None",
          trend: diagnosticText("Stable", "Stabili"),
          duration: diagnosticText(`${coverage.unavailable} missing`, `Trūksta: ${coverage.unavailable}`)
        },
        {
          label: diagnosticText("Node battery", "Mazgų baterijos"),
          current: selectedLowBatteryNodes.length > 0
            ? diagnosticText(
                `${Math.min(...selectedLowBatteryNodes.map((node) => node.level))}% lowest`,
                `Mažiausia: ${Math.min(...selectedLowBatteryNodes.map((node) => node.level))}%`
              )
            : diagnosticText("Healthy", "Tvarkingos"),
          target: diagnosticText("> watch threshold", "> stebėjimo ribos"),
          state: selectedLowBatteryNodes.some((node) => node.state === "critical")
            ? "critical"
            : selectedLowBatteryNodes.length > 0 ? "warning" : "optimal",
          visual: null,
          impact: selectedLowBatteryNodes.length > 0 ? "Trust only" : "None",
          trend: selectedLowBatteryNodes.length > 0
            ? diagnosticText("Watch", "Stebėti")
            : diagnosticText("Stable", "Stabili"),
          duration: diagnosticText(`${selectedLowBatteryNodes.length} nodes`, `Mazgai: ${selectedLowBatteryNodes.length}`)
        }
      ];
      const primaryLabel = primaryDefinition
        ? getDiagnosticMetricLabel(primaryDefinition.label)
        : diagnosticText("No active limiting factor", "Aktyvaus ribojančio veiksnio nėra");
      const primaryValue = primaryDefinition
        ? formatValue(primaryResult.value, primaryDefinition)
        : diagnosticText("In range", "Normoje");
      const primaryTarget = primaryDefinition
        ? formatRange(primaryDefinition.optimal, primaryDefinition)
        : diagnosticText("All targets met", "Visi tikslai pasiekti");
      const issuePatternText = primaryResult
        ? isSystemicPattern
          ? diagnosticText(
              `${sameIssueRows.length} sections in ${site.name} show the same ${primaryDefinition.label.toLowerCase()} issue. Check shared climate settings before treating it as local.`,
              `${sameIssueRows.length} sekcijose srityje „${site.name}“ matomas tas pats rodiklio „${primaryLabel}“ nuokrypis. Prieš laikydami jį vietiniu, patikrinkite bendrus klimato nustatymus.`
            )
          : diagnosticText(
              `The same issue is not repeated across multiple sections in ${site.name}. Start with a local inspection.`,
              `Kitose srities „${site.name}“ sekcijose toks pats nuokrypis nesikartoja. Pradėkite nuo vietinės patikros.`
            )
        : diagnosticText(
            `No repeated growth issue is currently visible across ${site.name}.`,
            `Srityje „${site.name}“ šiuo metu nematyti pasikartojančių auginimo nuokrypių.`
          );
      const likelyCauseText = isSystemicPattern
        ? diagnosticText(
            "Shared humidification, ventilation, or airflow should be checked first. This is a testable hypothesis, not an automatic diagnosis.",
            "Pirmiausia patikrinkite bendrą drėkinimą, vėdinimą ir oro judėjimą. Tai patikrinama hipotezė, o ne automatinė diagnozė."
          )
        : diagnosticText(
            "Local airflow, control output, sensor placement, or a section-specific operating change should be checked first.",
            "Pirmiausia patikrinkite vietinį oro judėjimą, valdymo įrangos veikimą, sensoriaus vietą ir naujausius šios sekcijos pakeitimus."
          );
      const healthLabel = displayedOverallState.state === "critical"
        ? diagnosticText("Critical", "Kritinė")
        : displayedOverallState.state === "warning"
          ? diagnosticText("Needs attention", "Reikia dėmesio")
          : diagnosticText("Good", "Gera");
      const diagnosisTitle = primaryResult
        ? diagnosticText(
            `${primaryLabel} is the dominant limiting factor in ${isSiteView ? site.name : zone.name}`,
            `Rodiklis „${primaryLabel}“ yra pagrindinis ribojantis veiksnys ${isSiteView ? `srityje „${site.name}“` : `sekcijoje „${zone.name}“`}`
          )
        : diagnosticText("No active limiting factor detected", "Aktyvių ribojančių veiksnių neaptikta");
      const scoreImpactLabel = getDiagnosticImpactLabel(scoreImpact);
      const benefitImpactLabel = interfaceLanguage === "lt"
        ? ({ None: "nėra", Low: "maža", Medium: "vidutinė", High: "didelė" }[scoreImpact] || scoreImpactLabel.toLowerCase())
        : scoreImpactLabel;

      elements.detailedDiagnosticsSection.dataset.state = displayedOverallState.state;
      elements.detailedDiagnosticsSection.innerHTML = `
        <section class="diagnostic-card diagnostic-narrative diagnostic-situation-board" data-state="${escapeAttribute(primaryResult?.state || "optimal")}">
          <div class="diagnostic-section-head">
            <div>
              <span class="diagnostic-eyebrow">${diagnosticText("Situation board", "Situacijos suvestinė")}</span>
              <h2>${escapeHtml(diagnosisTitle)}</h2>
            </div>
            <div class="diagnostic-head-status">
              <span class="overview-updated-time">${diagnosticText("Updated", "Atnaujinta")} ${escapeHtml(timestamp)}</span>
              <span class="diagnostic-status" data-state="${escapeAttribute(primaryResult?.state || "optimal")}">${escapeHtml(narrativeSeverity)}</span>
            </div>
          </div>
          <div class="diagnostic-command-grid">
            <div class="diagnostic-command-score" data-state="${escapeAttribute(displayedOverallState.state)}">
              <span>${diagnosticText("Growing score", "Auginimo sąlygų įvertis")}</span>
              <strong>${displayedOverallState.indexScore}</strong>
              <small>${escapeHtml(healthLabel)}</small>
            </div>
            <div class="diagnostic-command-fact">
              <span>${escapeHtml(primaryLabel)}</span>
              <strong>${escapeHtml(primaryValue)}</strong>
              <small>${diagnosticText("Target", "Tikslas")}: ${escapeHtml(primaryTarget)}</small>
            </div>
            <div class="diagnostic-command-fact">
              <span>${diagnosticText("24h direction", "24 val. kryptis")}</span>
              <strong>${primaryTrend ? escapeHtml(primaryTrend.direction) : diagnosticText("Stable", "Stabili")}</strong>
              <small>${primaryTrend ? `${formatSignedValue(primaryTrend.delta, primaryDefinition)} · ${primaryAlert ? escapeHtml(getDiagnosticDurationText(formatAlertDuration(primaryAlert.detectedAt))) : diagnosticText("latest reading", "naujausias matavimas")}` : diagnosticText("No active deviation", "Aktyvaus nuokrypio nėra")}</small>
            </div>
            <div class="diagnostic-command-fact">
              <span>${diagnosticText("Data coverage", "Duomenų aprėptis")}</span>
              <strong>${coverage.available}/${coverage.total}</strong>
              <small>${escapeHtml(confidenceLabel)} · ${selectedLowBatteryNodes.length} ${diagnosticText("battery flags", "baterijų perspėjimai")}</small>
            </div>
          </div>
          <div class="diagnostic-command-action">
            <span><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>${escapeHtml(getDiagnosticActionTitle(primaryResult, primaryDefinition, primaryLabel))}</span>
            <div>
              <button type="button" class="diagnostic-secondary-button" data-diagnostic-evidence-open aria-controls="diagnosticEvidenceDrawer" aria-expanded="false">${diagnosticText("Why?", "Kodėl?")}</button>
              <button type="button" class="diagnostic-primary-button" data-triage-action="trend" data-metric-key="${escapeAttribute(primaryResult?.key || "humidity")}">${diagnosticText("Verify in Trends", "Patikrinti grafike")}</button>
            </div>
          </div>
        </section>

        <button type="button" class="diagnostic-drawer-backdrop" data-diagnostic-evidence-close aria-label="${diagnosticText("Close explanation", "Uždaryti paaiškinimą")}" hidden></button>
        <aside id="diagnosticEvidenceDrawer" class="diagnostic-evidence-drawer" aria-label="${diagnosticText("Diagnostic evidence", "Diagnostikos įrodymai")}" aria-hidden="true" hidden>
          <div class="diagnostic-drawer-head">
            <div>
              <span class="diagnostic-eyebrow">${diagnosticText("Rule Engine evidence", "Taisyklių variklio pagrindimas")}</span>
              <h3>${diagnosticText("Why this recommendation?", "Kodėl pateikta ši rekomendacija?")}</h3>
            </div>
            <button type="button" class="diagnostic-drawer-close" data-diagnostic-evidence-close aria-label="${diagnosticText("Close", "Uždaryti")}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          <div class="diagnostic-drawer-body">
            <div class="diagnostic-evidence-step">
              <span>01</span>
              <div><strong>${diagnosticText("Observe", "Būsena")}</strong><p>${escapeHtml(diagnosticText(
                `${primaryLabel} is ${primaryValue}; target is ${primaryTarget}.`,
                `Rodiklis „${primaryLabel}“ yra ${primaryValue}; tikslas – ${primaryTarget}.`
              ))}</p></div>
            </div>
            <div class="diagnostic-evidence-step">
              <span>02</span>
              <div><strong>${diagnosticText("Explain", "Poveikis")}</strong><p>${escapeHtml(primaryResult ? getDiagnosticImpactText(primaryResult.key, primaryLabel) : diagnosticText("Installed growth metrics are currently inside target.", "Įdiegti auginimo rodikliai šiuo metu yra tiksliniuose intervaluose."))}</p></div>
            </div>
            <div class="diagnostic-evidence-step">
              <span>03</span>
              <div><strong>${diagnosticText("Scope", "Apimtis")}</strong><p>${escapeHtml(issuePatternText)}</p></div>
            </div>
            <div class="diagnostic-drawer-hypothesis">
              <span>${diagnosticText("What to verify first", "Ką patikrinti pirmiausia")}</span>
              <strong>${escapeHtml(likelyCauseText)}</strong>
            </div>
            <div class="diagnostic-drawer-checks">
              <span>${diagnosticText("Physical checks", "Ką patikrinti vietoje")}</span>
              <ul>${verification.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("")}</ul>
            </div>
            <p class="diagnostic-model-note">${diagnosticText(
              "Missing readings and battery condition are shown as data-trust risks. They do not directly reduce the growing conditions score.",
              "Trūkstami matavimai ir baterijų būklė rodomi kaip duomenų patikimumo rizikos. Jie tiesiogiai nemažina auginimo sąlygų įverčio."
            )}</p>
          </div>
        </aside>

        <div class="diagnostic-two-column">
          <section class="diagnostic-card diagnostic-score-breakdown" hidden>
            <div class="diagnostic-section-head">
              <div><span class="diagnostic-eyebrow">${diagnosticText("Causal score breakdown", "Įverčio sudėtis")}</span><h3>${diagnosticText(`Why the score is ${displayedOverallState.indexScore}`, `Kodėl įvertis yra ${displayedOverallState.indexScore}`)}</h3></div>
              <span class="diagnostic-impact" data-impact="${escapeAttribute(scoreImpact.toLowerCase())}">${escapeHtml(scoreImpactLabel)} ${diagnosticText("impact", "poveikis")}</span>
            </div>
            <div class="diagnostic-score-layout">
              <div class="diagnostic-score-number" data-state="${escapeAttribute(displayedOverallState.state)}">
                <strong>${displayedOverallState.indexScore}</strong>
                <span>${escapeHtml(healthLabel)}</span>
                <small>${previousScore} → ${displayedOverallState.indexScore} ${diagnosticText("in 24h", "per 24 val.")}</small>
              </div>
              <div class="diagnostic-contributors">
                <div>
                  <span>${diagnosticText("Positive contributors", "Teigiami veiksniai")}</span>
                  <ul>${rankedGrowthResults.filter((result) => result.state === "optimal").slice(0, 4).map((result) => `<li><i class="fa-solid fa-check" aria-hidden="true"></i>${escapeHtml(getDiagnosticMetricLabel(profile.metrics[result.key].label))} ${diagnosticText("inside target", "atitinka tikslą")}</li>`).join("") || `<li>${diagnosticText("No confirmed positive contributor", "Patvirtintų teigiamų veiksnių nėra")}</li>`}</ul>
                </div>
                <div>
                  <span>${diagnosticText("Main drag", "Pagrindinė priežastis")}</span>
                  <ul>${primaryResult && primaryResult.state !== "optimal" ? `<li><i class="fa-solid fa-arrow-down" aria-hidden="true"></i>${escapeHtml(primaryLabel)} · ${escapeHtml(getDiagnosticDeviationText(primaryResult))}</li>` : `<li>${diagnosticText("No active score drag", "Aktyvių įvertį mažinančių veiksnių nėra")}</li>`}</ul>
                </div>
              </div>
            </div>
          </section>

          <section class="diagnostic-card diagnostic-trust diagnostic-trust-wide">
            <div class="diagnostic-section-head">
              <div><span class="diagnostic-eyebrow">${diagnosticText("Sensor trust", "Sensorių patikimumas")}</span><h3>${diagnosticText("Can this diagnosis be trusted?", "Ar šia diagnoze galima pasitikėti?")}</h3></div>
            </div>
            <div class="diagnostic-coverage">
              <strong>${coverage.available}/${coverage.total}</strong>
              <span>${escapeHtml(confidenceLabel)}</span>
            </div>
            <div class="diagnostic-trust-facts">
              <span><i class="fa-solid fa-circle-check" aria-hidden="true"></i>${coverage.available} ${diagnosticText("live growth metrics", "aktyvūs auginimo rodikliai")}</span>
              <span><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${coverage.unavailable} ${diagnosticText("missing metrics", "trūkstami rodikliai")}</span>
              <span><i class="fa-solid fa-battery-half" aria-hidden="true"></i>${selectedLowBatteryNodes.length} ${diagnosticText(`low-battery nodes in this ${isSiteView ? "area" : "section"}`, `mazgai su silpna baterija šioje ${isSiteView ? "srityje" : "sekcijoje"}`)}</span>
              <span><i class="fa-solid fa-clock" aria-hidden="true"></i>${diagnosticText("Oldest uplink", "Seniausias duomenų gavimas")} ${escapeHtml(getDiagnosticDurationText(stateConfig[activeScenarioKey].uplink))}</span>
            </div>
            ${selectedLowBatteryNodes.length > 0 ? `
              <div class="diagnostic-node-list">
                ${selectedLowBatteryNodes.slice(0, 3).map((node) => `<div><strong>${escapeHtml(node.id)}</strong><span>${node.level}% · ${escapeHtml(node.state === "critical" ? diagnosticText("Critical", "Kritinė") : diagnosticText("Watch", "Stebėti"))}</span></div>`).join("")}
              </div>
            ` : ""}
            <button type="button" class="diagnostic-link-button" data-triage-action="nodes">${diagnosticText("Open node health", "Atidaryti mazgų būklę")}</button>
          </section>
        </div>

        <section class="diagnostic-card diagnostic-ranking">
          <div class="diagnostic-section-head">
            <div><span class="diagnostic-eyebrow">${diagnosticText("Prioritize", "Prioritetai")}</span><h3>${diagnosticText("Limiting factor ranking", "Ribojančių veiksnių reitingas")}</h3></div>
            <span class="diagnostic-head-note">${diagnosticText("Growth impact and data trust are separated", "Augimo poveikis ir duomenų patikimumas vertinami atskirai")}</span>
          </div>
          <div class="diagnostic-table-wrap">
            <table class="diagnostic-table">
              <thead><tr><th>#</th><th>${diagnosticText("Factor", "Rodiklis")}</th><th>${diagnosticText("Reading vs target", "Rodmuo ir tikslas")}</th><th>${diagnosticText("Status", "Būsena")}</th><th>${diagnosticText("Impact", "Poveikis")}</th><th>${diagnosticText("24h direction", "24 val. kryptis")}</th><th>${diagnosticText("Duration", "Trukmė")}</th></tr></thead>
              <tbody>
                ${factors.map((factor, index) => `
                  <tr data-state="${escapeAttribute(factor.state)}">
                    <td>${index + 1}</td>
                    <td><strong>${escapeHtml(factor.label)}</strong></td>
                    <td>
                      <div class="diagnostic-reading-cell">
                        <span><strong>${escapeHtml(factor.current)}</strong><small>${escapeHtml(factor.target)}</small></span>
                        ${factor.visual ? `
                          <span class="diagnostic-deviation-bar" data-state="${escapeAttribute(factor.state)}" aria-label="${diagnosticText("Current value position against target", "Dabartinio rodmens padėtis tikslinio intervalo atžvilgiu")}">
                            <i class="diagnostic-deviation-optimal" style="left:${factor.visual.optimalStart.toFixed(2)}%;width:${Math.max(factor.visual.optimalEnd - factor.visual.optimalStart, 2).toFixed(2)}%"></i>
                            <i class="diagnostic-deviation-marker" style="left:${factor.visual.marker.toFixed(2)}%"></i>
                          </span>
                        ` : `<span class="diagnostic-deviation-summary">${escapeHtml(factor.target)}</span>`}
                      </div>
                    </td>
                    <td><span class="diagnostic-table-state" data-state="${escapeAttribute(factor.state)}">${escapeHtml(factor.state === "optimal" ? diagnosticText("OK", "Gerai") : factor.state === "critical" ? diagnosticText("Critical", "Kritinė") : diagnosticText("Warning", "Dėmesio"))}</span></td>
                    <td>${escapeHtml(getDiagnosticImpactLabel(factor.impact))}</td>
                    <td>${escapeHtml(factor.trend)}</td>
                    <td>${escapeHtml(factor.duration)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>

        <div class="diagnostic-two-column diagnostic-comparison-row">
          <section class="diagnostic-card">
            <div class="diagnostic-section-head">
              <div><span class="diagnostic-eyebrow">${diagnosticText("Local vs systemic", "Vietinė ar sisteminė problema")}</span><h3>${diagnosticText("Is the issue wider than this section?", "Ar problema apima daugiau nei šią sekciją?")}</h3></div>
              <span class="diagnostic-status" data-state="${escapeAttribute(isSystemicPattern ? "warning" : "optimal")}">${isSystemicPattern ? diagnosticText("Repeated pattern", "Pasikartojanti problema") : diagnosticText("Likely local", "Tikėtina vietinė")}</span>
            </div>
            <div class="diagnostic-comparison-list">
              ${siteIssueRows.map((row) => `
                <div data-active="${String(row.snapshot.zone.id === zone.id)}">
                  <span><strong>${escapeHtml(row.snapshot.zone.name)}</strong><small>${escapeHtml(row.definition ? getDiagnosticMetricLabel(row.definition.label) : diagnosticText("In range", "Normoje"))}</small></span>
                  <span>${row.snapshot.overall.indexScore}</span>
                  <span class="diagnostic-dot" data-state="${escapeAttribute(row.snapshot.overall.state)}"></span>
                </div>
              `).join("")}
            </div>
          </section>

          <section class="diagnostic-card">
            <div class="diagnostic-section-head">
              <div><span class="diagnostic-eyebrow">${diagnosticText("24h dynamics", "24 val. pokyčiai")}</span><h3>${diagnosticText("What changed?", "Kas pasikeitė?")}</h3></div>
              <button type="button" class="diagnostic-link-button" data-triage-action="trend" data-metric-key="${escapeAttribute(primaryResult?.key || "humidity")}">${diagnosticText("Open full trend", "Atidaryti visą grafiką")}</button>
            </div>
            <div class="diagnostic-dynamics-list">
              <div><span>${diagnosticText("Growing score", "Auginimo sąlygų įvertis")}</span><strong>${previousScore} → ${displayedOverallState.indexScore}</strong><small>${displayedOverallState.indexScore < previousScore ? diagnosticText("Worsening", "Blogėja") : diagnosticText("Stable", "Stabili")}</small></div>
              ${trendRows.slice(0, 3).map((item) => `<div><span>${escapeHtml(getDiagnosticMetricLabel(item.definition.label))}</span><strong>${escapeHtml(formatValue(item.trend.start, item.definition))} → ${escapeHtml(formatValue(item.trend.end, item.definition))}</strong><small>${escapeHtml(item.trend.direction)}</small></div>`).join("")}
            </div>
          </section>
        </div>

        <section class="diagnostic-card diagnostic-verification">
          <div class="diagnostic-section-head">
            <div><span class="diagnostic-eyebrow">${diagnosticText("Act and verify", "Veikti ir patikrinti")}</span><h3>${escapeHtml(getDiagnosticActionTitle(primaryResult, primaryDefinition, primaryLabel))}</h3></div>
            <span class="diagnostic-impact" data-impact="${escapeAttribute(scoreImpact.toLowerCase())}">${escapeHtml(diagnosticText(`${scoreImpactLabel} expected benefit`, `Tikėtina nauda: ${benefitImpactLabel}`))}</span>
          </div>
          <div class="diagnostic-verification-grid">
            <div>
              <span class="diagnostic-step-label">${diagnosticText("Recommended action", "Rekomenduojamas veiksmas")}</span>
              <p>${escapeHtml(suggestedAction)}</p>
              <small>${escapeHtml(primaryResult ? getDiagnosticImpactText(primaryResult.key, primaryLabel) : diagnosticText("No intervention is required.", "Veiksmų imtis nereikia."))}</small>
            </div>
            <div>
              <span class="diagnostic-step-label">${diagnosticText("Success condition", "Sėkmės kriterijus")}</span>
              <p>${escapeHtml(verification.success)}</p>
              <small>${diagnosticText("Compare nearby nodes and confirm that no new warning appears.", "Palyginkite artimiausių mazgų rodmenis ir įsitikinkite, kad neatsiranda naujų perspėjimų.")}</small>
            </div>
          </div>
          <div class="diagnostic-button-row">
            <button type="button" class="diagnostic-primary-button" data-triage-action="trend" data-metric-key="${escapeAttribute(primaryResult?.key || "humidity")}">${diagnosticText("Verify in Trends", "Patikrinti grafike")}</button>
            <button type="button" class="diagnostic-secondary-button" data-triage-action="alerts">${diagnosticText("Review active alerts", "Peržiūrėti aktyvius perspėjimus")}</button>
            ${selectedLowBatteryNodes.length > 0 ? `<button type="button" class="diagnostic-secondary-button" data-triage-action="nodes">${diagnosticText("Check node batteries", "Patikrinti mazgų baterijas")}</button>` : ""}
          </div>
        </section>
      `;
    }

    function renderDashboard(options = {}) {
      const isLocationsPage = activePrimaryPage === "locations";
      const isBlocksPage = activePrimaryPage === "blocks";
      const isNodesPage = activePrimaryPage === "nodes";
      const isReadingsPage = activePrimaryPage === "readings";
      const isHistoryPage = activePrimaryPage === "history";
      const isSettingsPage = activePrimaryPage === "settings";
      const isAlertsPage = activePrimaryPage === "alerts";
      const isManagementPage = isLocationsPage || isBlocksPage || isNodesPage || isSettingsPage || isAlertsPage;
      const isPrimaryWorkspacePage = isManagementPage || isHistoryPage || isReadingsPage;
      const site = getActiveSite();
      const zone = getActiveZone(site);
      if (!site || !zone) return;
      const profile = cropProfiles[activeProfileKey];
      const isDetailedExperienceMode = isReadingsPage || isHistoryPage || isDetailedExperience();
      const isSimpleExperienceMode = !isDetailedExperienceMode;
      const isDetailedOverview = !isPrimaryWorkspacePage && isDetailedExperienceMode;

      if (isSimpleExperienceMode && activeViewScope === "site" && activeSiteDetailView === "zones") {
        activeSiteDetailView = "averages";
      }

      if (isSimpleExperienceMode && !["all", "overview"].includes(activeWorkspaceFocus)) {
        activeWorkspaceFocus = "all";
      }

      const availableMetrics = new Set(zone.availableMetrics || []);
      const { skipMetricsGrid = false } = options;
      const hasReadings = Object.keys(currentReadings).length > 0;
      const readings = hasReadings
        ? currentReadings
        : isApiDataMode()
          ? {}
          : getZoneReadings(profile, zone, activeScenarioKey);

      if (!hasReadings && !isApiDataMode()) {
        currentReadings = { ...readings };
      }

      const results = Object.entries(profile.metrics).map(([key, definition]) => {
        const isConfigured = availableMetrics.has(key);
        const hasLiveValue = Number.isFinite(Number(readings?.[key]));
        return {
          key,
          available: isConfigured && (!isApiDataMode() || hasLiveValue),
          ...(isConfigured
            ? evaluateMetricForReadings(definition, key, availableMetrics, readings)
            : { value: null, state: "unavailable", severity: 0, scalePosition: 0, deviationText: "Unavailable", narrative: "Sensor not installed." })
        };
      });

      const overallState = deriveOverallState(results);
      const growthResults = results.filter((item) => isGrowthMetricKey(item.key));
      const nonOptimalResults = growthResults.filter((item) => item.available !== false && item.state !== "optimal");
      const availableResults = growthResults.filter((item) => item.available !== false);
      const unavailableResults = growthResults.filter((item) => item.available === false);
      const batteryDefinition = profile.metrics.batteryLevel;
      const batteryResult = results.find((item) => item.key === "batteryLevel");
      const batteryThreshold = batteryDefinition ? getBatteryAlertThreshold(batteryDefinition) : criticalBatteryThreshold;
      const zoneBatteryNodes = batteryDefinition && zone && batteryResult?.available !== false
        ? getZoneBatteryNodeDetails(zone, batteryDefinition, site)
        : [];
      const siteBatteryNodes = batteryDefinition
        ? getSiteBatteryNodeDetails(site, batteryDefinition)
        : [];
      const systemLowBatteryNodes = getSystemLowBatteryNodes();
      const headerBatteryState = systemLowBatteryNodes.length === 0
        ? "optimal"
        : systemLowBatteryNodes.length > 1
          ? "critical"
          : "warning";
      let globalSnapshots = dashboardData.sites.flatMap((systemSite) =>
        systemSite.zones.map((systemZone) => {
          const isActiveZone = systemSite.id === site.id && systemZone.id === zone.id;
          return evaluateZoneSnapshot(systemSite, systemZone, isActiveZone ? readings : null);
        })
      );
      globalSnapshots = globalSnapshots.map((snapshot) =>
        snapshot.site.id === site.id && snapshot.zone.id === zone.id
          ? { ...snapshot, profile, results, overall: overallState }
          : snapshot
      );
      renderSiteOptions(globalSnapshots);
      renderZoneOptions(globalSnapshots);
      const globalCritical = globalSnapshots.filter((snapshot) => snapshot.overall.state === "critical").length;
      const globalWarning = globalSnapshots.filter((snapshot) => snapshot.overall.state === "warning").length;
      const globalStable = globalSnapshots.filter((snapshot) => snapshot.overall.state === "optimal").length;
      const globalState = globalCritical > 0 ? "critical" : globalWarning > 0 ? "warning" : "optimal";
      const allSystemIssues = globalSnapshots
        .filter((snapshot) => snapshot.overall.state !== "optimal")
        .sort((left, right) => left.overall.indexScore - right.overall.indexScore)
        .map((snapshot) => {
          const labels = snapshot.results
            .filter((item) => item.available !== false && isGrowthMetricKey(item.key) && item.state !== "optimal")
            .map((item) => snapshot.profile.metrics[item.key].label.toLowerCase());
          return {
            ...snapshot,
            summary: labels.length > 0
              ? `${joinLabels(labels)} need attention.`
              : "This block needs attention."
          };
        });
      const criticalSystemIssues = allSystemIssues.filter((snapshot) => snapshot.overall.state === "critical");
      const warningSystemIssues = allSystemIssues.filter((snapshot) => snapshot.overall.state === "warning");
      const currentSiteSystemIssues = allSystemIssues.filter((snapshot) => snapshot.site.id === site.id);
      const alertRecords = buildAlertRecords(allSystemIssues);
      const siteSnapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === site.id);
      const weakestSiteSnapshot = getWeakestSiteSnapshot(siteSnapshots);
      const siteOverallState = deriveSiteOverallState(siteSnapshots);
      const isSiteView = activeViewScope === "site";
      if (activeWorkspaceFocus === "route" && isSiteView && activeSiteDetailView === "zones") {
        activeSiteDetailView = "averages";
      }
      const isSiteHotspotsView = isSiteView && activeSiteDetailView === "zones";
      const siteAverageSummaries = isSiteView ? buildSiteAverageSummaries(siteSnapshots) : [];
      const sensorHealthNodes = isSiteView ? siteBatteryNodes : zoneBatteryNodes;
      const displayedOverallState = isSiteView ? siteOverallState : overallState;
      const timestamp = new Date().toLocaleTimeString("lt-LT", { hour: "2-digit", minute: "2-digit" });
      const thumbPosition = clamp(displayedOverallState.indexScore, 8, 92);
      const unavailableCount = unavailableResults.length;
      const siteProfileSummary = getSiteProfileSummary(siteSnapshots);
      const topIndicatorDrivers = isSiteView
        ? getTopSiteDrivers(siteSnapshots)
        : getTopIndicatorDrivers(profile, nonOptimalResults);
      const heroDecision = buildHeroDecision({
        isSiteView,
        profile,
        zone,
        siteSnapshots,
        nonOptimalResults,
        displayedOverallState,
        results,
        manualOverride
      });
      const heroSensorGlanceState = buildHeroSensorGlanceState({
        isSiteView,
        isSiteHotspotsView,
        site,
        zone,
        profile,
        growthResults,
        siteAverageSummaries
      });
      const actionDeck = buildActionDeck({
        isSiteView,
        site,
        zone,
        profile,
        results,
        nonOptimalResults,
        siteSnapshots,
        displayedOverallState,
        batteryDefinition,
        batteryResult,
        globalState,
        globalCritical,
        globalWarning,
        siteDetailView: activeSiteDetailView
      });
      const alertRailFilters = [
        {
          key: "all",
          label: "All active",
          count: allSystemIssues.length,
          tone: globalState === "critical" ? "critical" : globalState === "warning" ? "warning" : "optimal",
          description: allSystemIssues.length > 0
            ? `Showing ${Math.min(allSystemIssues.length, 6)} of ${allSystemIssues.length} active incidents across the full system.`
            : "No active incidents are visible across the full system."
        },
        {
          key: "critical",
          label: "Critical",
          count: criticalSystemIssues.length,
          tone: "critical",
          description: criticalSystemIssues.length > 0
            ? `${criticalSystemIssues.length} blocks need immediate intervention before conditions drift further.`
            : "No critical incidents are active right now."
        },
        {
          key: "warning",
          label: "Warning",
          count: warningSystemIssues.length,
          tone: "warning",
          description: warningSystemIssues.length > 0
            ? `${warningSystemIssues.length} blocks are drifting and should be checked before they turn critical.`
            : "No warning incidents are active right now."
        },
        {
          key: "site",
          label: "This location",
          count: currentSiteSystemIssues.length,
          tone: currentSiteSystemIssues.some((snapshot) => snapshot.overall.state === "critical")
            ? "critical"
            : currentSiteSystemIssues.length > 0
              ? "warning"
              : "optimal",
          description: currentSiteSystemIssues.length > 0
            ? `${site.name} currently contributes ${currentSiteSystemIssues.length} active incidents to the system queue.`
            : `${site.name} is currently not contributing any active incidents to the system queue.`
        }
      ];
      if (!alertRailFilters.some((filter) => filter.key === activeAlertRailFilterKey)) {
        activeAlertRailFilterKey = "all";
      }
      const activeAlertRailFilter = alertRailFilters.find((filter) => filter.key === activeAlertRailFilterKey) || alertRailFilters[0];
      const filteredAlertRailItems = filterAlertRailItems(allSystemIssues, activeAlertRailFilter.key, site.id);
      const criticalSensorHealthCount = sensorHealthNodes.filter((node) => node.state === "critical").length;
      const watchSensorHealthCount = sensorHealthNodes.filter((node) => node.state === "warning").length;
      const healthySensorHealthCount = sensorHealthNodes.filter((node) => node.level >= batteryThreshold).length;
      const sensorHealthFilters = batteryDefinition && (isSiteView || batteryResult?.available !== false)
        ? [
            {
              key: "focus",
              label: "Focus",
              count: criticalSensorHealthCount + watchSensorHealthCount,
              tone: criticalSensorHealthCount > 0 ? "critical" : watchSensorHealthCount > 0 ? "warning" : "optimal",
              description: criticalSensorHealthCount + watchSensorHealthCount > 0
                ? `${criticalSensorHealthCount + watchSensorHealthCount} nodes are below the ${batteryThreshold}% replacement threshold.`
                : `No nodes are below the ${batteryThreshold}% replacement threshold.`
            },
            {
              key: "critical",
              label: "Critical",
              count: criticalSensorHealthCount,
              tone: "critical",
              description: criticalSensorHealthCount > 0
                ? `${criticalSensorHealthCount} nodes are already below the ${criticalBatteryThreshold}% critical floor.`
                : "No nodes are below the critical floor."
            },
            {
              key: "warning",
              label: "Watchlist",
              count: watchSensorHealthCount,
              tone: "warning",
              description: watchSensorHealthCount > 0
                ? `${watchSensorHealthCount} nodes are below ${batteryThreshold}% and should be replaced in the next round.`
                : `No nodes are in the ${batteryThreshold}% watch band.`
            },
            {
              key: "healthy",
              label: "Healthy",
              count: healthySensorHealthCount,
              tone: "optimal",
              description: healthySensorHealthCount > 0
                ? `${healthySensorHealthCount} nodes are still above the ${batteryThreshold}% watch threshold.`
                : "No nodes have comfortable remaining runway."
            },
            {
              key: "all",
              label: "All nodes",
              count: sensorHealthNodes.length,
              tone: "neutral",
              description: `Showing all ${sensorHealthNodes.length} nodes in this ${isSiteView ? "site" : "zone"} power triage board.`
            }
          ]
        : [];
      if (!sensorHealthFilters.some((filter) => filter.key === activeSensorHealthFilterKey)) {
        activeSensorHealthFilterKey = "focus";
      }
      const activeSensorHealthFilter = sensorHealthFilters.find((filter) => filter.key === activeSensorHealthFilterKey) || sensorHealthFilters[0] || null;
      const filteredSensorHealthNodes = activeSensorHealthFilter
        ? filterSensorHealthNodes(sensorHealthNodes, activeSensorHealthFilter.key, batteryThreshold)
        : [];
      const workbenchConfig = buildWorkbenchLenses({
        isSiteView,
        isSiteHotspotsView,
        site,
        zone,
        growthResults,
        availableResults,
        unavailableResults,
        siteSnapshots,
        siteAverageSummaries
      });
      currentWorkbenchLenses = isReadingsPage
        ? workbenchConfig.lenses.filter((lens) => lens.key !== "focus")
        : workbenchConfig.lenses;
      if (isReadingsPage && activeWorkbenchLensKey === "focus") {
        activeWorkbenchLensKey = "all";
      }
      if (isSimpleExperienceMode && currentWorkbenchLenses.some((lens) => lens.key === "focus")) {
        activeWorkbenchLensKey = "focus";
      }
      if (!currentWorkbenchLenses.some((lens) => lens.key === activeWorkbenchLensKey)) {
        activeWorkbenchLensKey = workbenchConfig.defaultKey;
      }
      const activeWorkbenchLens = currentWorkbenchLenses.find((lens) => lens.key === activeWorkbenchLensKey) || currentWorkbenchLenses[0];
      const inspectionRouteState = buildInspectionRouteState({
        isSiteView,
        site,
        zone,
        profile,
        siteSnapshots,
        nonOptimalResults
      });
      if (!inspectionRouteState.filters.some((filter) => filter.key === activeInspectionRouteFilterKey)) {
        activeInspectionRouteFilterKey = inspectionRouteState.defaultKey;
      }
      const activeInspectionRouteFilter = inspectionRouteState.filters.find((filter) => filter.key === activeInspectionRouteFilterKey) || inspectionRouteState.filters[0] || null;
      const filteredInspectionRouteItems = activeInspectionRouteFilter
        ? filterInspectionRouteItems(inspectionRouteState.items, activeInspectionRouteFilter.key)
        : inspectionRouteState.items;
      const scenarioDefinition = getScenarioDefinition();
      const manualOverrideDiffs = getManualOverrideDiffs(profile, zone);
      const primaryManualOverride = manualOverrideDiffs[0] || null;
      const changedMetricLabels = manualOverrideDiffs.slice(0, 3).map((item) => item.definition.label.toLowerCase());
      const changedMetricSummary = changedMetricLabels.length > 0
        ? `Changed metrics: ${joinLabels(changedMetricLabels)}.`
        : "Custom metric values are overriding the preset.";
      const manualChangeCountLabel = `${manualOverrideDiffs.length} manual ${manualOverrideDiffs.length === 1 ? "change" : "changes"}`;
      const manualChangeVerb = manualOverrideDiffs.length === 1 ? "is" : "are";
      const scenarioTone = manualOverride ? displayedOverallState.state : activeScenarioKey;
      const advancedToolsState = getAdvancedToolsState({
        scenarioDefinition,
        manualOverride,
        scenarioTone
      });
      const scenarioScopeText = isSiteView
        ? `Location lab | ${siteSnapshots.length} blocks`
        : `Block lab | ${zone.sensorCount} nodes`;
      const scenarioModeText = manualOverride
        ? `Manual on ${scenarioDefinition.shortLabel}`
        : scenarioDefinition.label;
      let scenarioLabTitle = isSiteView
        ? `${scenarioDefinition.label} is active for ${site.name}`
        : `${scenarioDefinition.label} is loaded for ${zone.name}`;
      let scenarioLabSummary = isSiteView
        ? activeScenarioKey === "optimal"
          ? `You are viewing the live modeled baseline across all ${siteSnapshots.length} blocks. Switch to Warning or Critical to see which areas crack first.`
          : `${scenarioDefinition.shortLabel} conditions are being applied across the location model so you can rehearse the response before the real environment drifts this far.`
        : activeScenarioKey === "optimal"
          ? `You are looking at the live modeled baseline for ${zone.name}. Pick a preset or move a slider to create a deliberate branch test.`
          : `${scenarioDefinition.shortLabel} conditions set the starting point for this block. Use the sliders below to branch into a custom one-block test.`;
      let manualOverrideStateText = activeScenarioKey === "optimal"
        ? "Preset locked"
        : `${scenarioDefinition.shortLabel} preset`;
      let manualOverrideTitle = isSiteView
        ? "Whole-location preset is active"
        : "Block sandbox is ready";
      let manualOverrideSummary = isSiteView
        ? `Presets reshape generated readings across all ${siteSnapshots.length} blocks in ${site.name}. Switch to Block view whenever you want a one-block manual branch test.`
        : activeScenarioKey === "optimal"
          ? `Move any metric slider below to create a one-block what-if test without leaving ${zone.name}.`
          : `The ${scenarioDefinition.shortLabel.toLowerCase()} preset is now the starting point. Move any slider below to branch into a custom block-only test.`;
      let manualOverrideMeta = isSiteView
        ? "Hotspots becomes especially useful after switching presets."
        : `Shortcut R resets any slider-driven branch back to the ${scenarioDefinition.shortLabel.toLowerCase()} preset.`;

      if (manualOverride) {
        scenarioLabTitle = isSiteView
          ? `Manual test is influencing ${site.name}`
          : `Manual test is active in ${zone.name}`;
        scenarioLabSummary = isSiteView
          ? `${manualChangeCountLabel} from ${zone.name} ${manualChangeVerb} overriding the active preset, so the location score already reflects a custom branch test.`
          : `${manualChangeCountLabel} ${manualChangeVerb} overriding the active preset in this block. The growth index is already reflecting that branch test.`;
        manualOverrideStateText = "Manual branch";
        manualOverrideTitle = isSiteView
          ? `${manualChangeCountLabel} ${manualChangeVerb} influencing the location view`
          : `${manualChangeCountLabel} ${manualChangeVerb} active in ${zone.name}`;
        manualOverrideSummary = isSiteView
          ? `${changedMetricSummary} Those changes live in ${zone.name}, but the location score already includes them.`
          : `${changedMetricSummary} The block score already reflects this branch test against the ${scenarioDefinition.shortLabel.toLowerCase()} baseline.`;
        manualOverrideMeta = primaryManualOverride
          ? `Largest delta: ${primaryManualOverride.definition.label} ${formatSignedValue(primaryManualOverride.delta, primaryManualOverride.definition)} versus the ${scenarioDefinition.shortLabel.toLowerCase()} baseline. Press R to reset.`
          : `Press R or use Reset test to snap back to the ${scenarioDefinition.shortLabel.toLowerCase()} preset.`;
      }

      const routeCardTone = isSiteHotspotsView
        ? "neutral"
        : activeInspectionRouteFilter?.tone || "neutral";
      const routeCardValue = isSiteHotspotsView
        ? "Route parked"
        : activeInspectionRouteFilter?.label || "Route";
      const routeCardNote = isSiteHotspotsView
        ? "Hotspots lens is active, so the walkthrough lane is hidden until you reopen location averages."
        : `${filteredInspectionRouteItems.length} ${filteredInspectionRouteItems.length === 1 ? "stop is" : "stops are"} visible in the current walkthrough slice.`;
      const powerTelemetryUnavailable = !isSiteView && batteryResult?.available === false;
      const powerCardTone = powerTelemetryUnavailable
        ? "neutral"
        : activeSensorHealthFilter?.tone || "neutral";
      const powerCardValue = powerTelemetryUnavailable
        ? "Telemetry off"
        : activeSensorHealthFilter?.label || "Power";
      const powerCardNote = powerTelemetryUnavailable
        ? "Battery telemetry is not installed in this block yet, so node power cannot be triaged here."
        : `${filteredSensorHealthNodes.length} ${filteredSensorHealthNodes.length === 1 ? "node is" : "nodes are"} visible in the current power board.`;
      const opsDockTitle = isSiteView
        ? activeSiteDetailView === "zones"
          ? "Location hotspot cockpit"
          : "Location operations cockpit"
        : "Block operations cockpit";
      const opsRouteSummary = isSiteHotspotsView
        ? "route parked"
        : `${(activeInspectionRouteFilter?.label || "route").toLowerCase()} route`;
      const opsPowerSummary = powerTelemetryUnavailable
        ? "telemetry off"
        : `${(activeSensorHealthFilter?.label || "power").toLowerCase()} power triage`;
      const opsScopeSummary = isSiteView
        ? activeSiteDetailView === "zones"
          ? `${site.name} is in hotspot ranking mode`
          : `${site.name} is in location-average mode`
        : `${zone.name} is open inside ${site.name}`;
      const opsDockSummary = manualOverride
        ? `${opsScopeSummary}. Manual branch is active with ${opsRouteSummary}, ${(activeWorkbenchLens?.label || "focus").toLowerCase()} workbench lens, ${activeAlertRailFilter.label.toLowerCase()} alerts, and ${opsPowerSummary}.`
        : `${opsScopeSummary}. ${scenarioDefinition.shortLabel} scenario is active with ${opsRouteSummary}, ${(activeWorkbenchLens?.label || "focus").toLowerCase()} workbench lens, ${activeAlertRailFilter.label.toLowerCase()} alerts, and ${opsPowerSummary}.`;
      const opsDockCards = [
        {
          action: "scenario",
          tone: scenarioTone,
          kicker: "Scenario",
          value: manualOverride ? "Manual branch" : scenarioDefinition.label,
          note: manualOverride
            ? isSiteView
              ? `${manualChangeCountLabel} from ${zone.name} already affect the location score.`
              : `${manualChangeCountLabel} are overriding the active preset in this block.`
            : scenarioDefinition.meta,
          cta: "Open lab"
        },
        {
          action: "route",
          tone: routeCardTone,
          kicker: "Inspection route",
          value: routeCardValue,
          note: routeCardNote,
          cta: isSiteHotspotsView ? "Restore route" : "Open route"
        },
        {
          action: "workbench",
          tone: activeWorkbenchLens?.tone || "neutral",
          kicker: "Workbench",
          value: activeWorkbenchLens?.label || "Focus",
          note: activeWorkbenchLens?.description || "Open the current analytics slice.",
          cta: "Open analytics"
        },
        {
          action: "alerts",
          tone: activeAlertRailFilter.tone || globalState,
          kicker: "Alerts",
          value: filteredAlertRailItems.length > 0 ? `${filteredAlertRailItems.length} active` : "Clear",
          note: `${criticalSystemIssues.length} critical, ${warningSystemIssues.length} warning, ${allSystemIssues.length} active incidents in total.`,
          cta: "Review alerts"
        },
        {
          action: "power",
          tone: powerCardTone,
          kicker: "Power triage",
          value: powerCardValue,
          note: powerCardNote,
          cta: "Open power board"
        }
      ];
      const isOpsDockResetDisabled = activeWorkbenchLensKey === "focus"
        && activeInspectionRouteFilterKey === "focus"
        && activeAlertRailFilterKey === "all"
        && activeSensorHealthFilterKey === "focus"
        && !sidebarActionOverride
        && !(activeViewScope === "site" && activeSiteDetailView === "zones");
      const impactBoardState = buildImpactBoardState({
        isSiteView,
        site,
        zone,
        profile,
        results,
        displayedOverallState,
        siteSnapshots,
        manualOverride,
        manualOverrideDiffs,
        scenarioDefinition
      });
      const decisionBriefPayload = buildDecisionBrief({
        isSiteView,
        site,
        zone,
        displayedOverallState,
        scenarioDefinition,
        manualOverride,
        impactBoardState,
        actionDeck,
        activeAlertRailFilter,
        filteredAlertRailItems,
        activeSensorHealthFilter,
        filteredSensorHealthNodes,
        activeInspectionRouteFilter,
        filteredInspectionRouteItems,
        heroDecision
      });
      currentDecisionBriefPayload = decisionBriefPayload;
      currentImpactBoardCards = impactBoardState.cards;
      impactBoardAction = impactBoardState.action;
      renderLocationsManagementPage(globalSnapshots);
      renderBlocksManagementPage(globalSnapshots);
      renderNodesManagementPage();
      renderSettingsManagementPage(globalSnapshots);
      renderAlertsManagementPage(alertRecords);
      renderOverviewTriage({
        site,
        zone,
        profile,
        results,
        displayedOverallState,
        globalState,
        allSystemIssues,
        systemLowBatteryNodes,
        unavailableCount,
        availableResults,
        growthResults,
        timestamp
      });
      const detailedSnapshot = isSiteView && weakestSiteSnapshot
        ? weakestSiteSnapshot
        : { zone, profile, results };
      const detailedGrowthResults = detailedSnapshot.results.filter((item) => isGrowthMetricKey(item.key));
      renderDetailedDiagnostics({
        site,
        zone: detailedSnapshot.zone,
        profile: detailedSnapshot.profile,
        results: detailedSnapshot.results,
        growthResults: detailedGrowthResults,
        availableResults: detailedGrowthResults.filter((item) => item.available !== false),
        unavailableResults: detailedGrowthResults.filter((item) => item.available === false),
        displayedOverallState,
        siteSnapshots,
        alertRecords,
        zoneBatteryNodes: isSiteView ? siteBatteryNodes : zoneBatteryNodes,
        coverageOverride: isSiteView ? getCoverageStatsFromSiteSnapshots(siteSnapshots) : null,
        isSiteView,
        timestamp
      });

      elements.experienceModeTitle.textContent = isDetailedExperienceMode ? "Detailed analysis view" : "Simple client view";
      elements.experienceModeSummary.textContent = isDetailedExperienceMode
        ? isSiteView
          ? `Detailed analysis is open for ${site.name}. It includes system alerts, extra filters, sensor power, inspection route, and scenario tools.`
          : `Detailed analysis is open for ${zone.name}. It includes system alerts, extra filters, sensor power, inspection route, and scenario tools.`
        : isSiteView
          ? `Simple view keeps only the current location situation, the main average readings, and the next step for ${site.name}.`
          : `Simple view keeps only the current score, the main readings behind it, and the next step for ${zone.name}.`;
      const isExperienceModeAvailable = activePrimaryPage === "overview";
      [...elements.experienceModeControl.querySelectorAll("[data-experience-mode]")].forEach((button) => {
        const isActive = button.dataset.experienceMode === (isDetailedExperienceMode ? "detailed" : "simple");
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
        button.disabled = !isExperienceModeAvailable;
        button.setAttribute("aria-disabled", String(!isExperienceModeAvailable));
      });
      elements.experienceModeControl.hidden = false;
      elements.experienceModeControl.dataset.disabled = String(!isExperienceModeAvailable);
      elements.scopeHelperText.textContent = isSiteView
        ? isSimpleExperienceMode
          ? "Viewing the whole area. Switch to a section when you want to inspect one growing space."
          : isSiteHotspotsView
            ? "These sections are lowering the area score most. Open one to see its live growth index."
            : "Viewing the area score across all sections. Switch to a section for live readings."
        : isSimpleExperienceMode
          ? "Viewing one section. Change Area or Section to inspect another growing space."
          : "Viewing one section with its growth score, live readings, and supporting details.";
      elements.zoneScopeButton.dataset.active = String(!isSiteView);
      elements.zoneScopeButton.setAttribute("aria-pressed", String(!isSiteView));
      elements.siteScopeButton.dataset.active = String(isSiteView);
      elements.siteScopeButton.setAttribute("aria-pressed", String(isSiteView));
      elements.siteMetricsViewToggle.hidden = !isSiteView || isSimpleExperienceMode;
      elements.siteAveragesButton.dataset.active = String(activeSiteDetailView === "averages");
      elements.siteAveragesButton.setAttribute("aria-pressed", String(activeSiteDetailView === "averages"));
      elements.siteZonesButton.dataset.active = String(activeSiteDetailView === "zones");
      elements.siteZonesButton.setAttribute("aria-pressed", String(activeSiteDetailView === "zones"));
      const selectedSiteScore = getContextScoreSummary(siteOverallState);
      const selectedZoneScore = getContextScoreSummary(overallState);
      elements.siteContextValue.textContent = site.name;
      elements.siteContextMeta.textContent = selectedSiteScore.text;
      elements.siteContextMeta.dataset.state = selectedSiteScore.state;
      elements.zoneContextCard.dataset.disabled = isSiteView ? "true" : "false";
      elements.zoneTrigger.disabled = isSiteView;
      elements.zoneTrigger.setAttribute("aria-disabled", String(isSiteView));
      elements.zoneContextValue.textContent = isSiteView ? "All sections" : zone.name;
      elements.zoneContextMeta.textContent = isSiteView
        ? (interfaceLanguage === "lt" ? "Įtraukta į Area įvertį" : "Included in Area score")
        : selectedZoneScore.text;
      elements.zoneContextMeta.dataset.state = isSiteView ? selectedSiteScore.state : selectedZoneScore.state;
      elements.profileContextValue.textContent = isSiteView ? siteProfileSummary.value : profile.name;
      elements.profileContextMeta.textContent = isSiteView ? siteProfileSummary.meta : "Inherited from section";
      try {
        elements.opsDockTitle.textContent = opsDockTitle;
      elements.opsDockSummary.textContent = opsDockSummary;
      applyStateChip(elements.opsDockStateChip, displayedOverallState.state);
      elements.workspaceFocusSummary.textContent = getWorkspaceFocusSummary(activeWorkspaceFocus, {
        siteName: site.name,
        zoneName: zone.name,
        workbenchLabel: activeWorkbenchLens?.label || "Focus",
        routeLabel: activeInspectionRouteFilter?.label || "Focus",
        alertLabel: activeAlertRailFilter.label,
        powerLabel: activeSensorHealthFilter?.label || "Focus"
      });
      [...elements.workspaceFocusBar.querySelectorAll("[data-workspace-focus]")].forEach((button) => {
        const isActive = button.dataset.workspaceFocus === activeWorkspaceFocus;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      elements.opsDockCards.innerHTML = renderOpsDockCards(opsDockCards);
      elements.opsDockResetButton.disabled = isOpsDockResetDisabled;
      elements.opsDockResetButton.setAttribute("aria-disabled", String(isOpsDockResetDisabled));
      elements.opsDockSecondaryButton.hidden = !manualOverride;
      elements.experienceModeSection.hidden = true;
      elements.locationsManagementSection.hidden = !isLocationsPage;
      elements.blocksManagementSection.hidden = !isBlocksPage;
      elements.nodesManagementSection.hidden = !isNodesPage;
      elements.settingsManagementSection.hidden = !isSettingsPage;
      elements.alertsManagementSection.hidden = !isAlertsPage;
      elements.overviewTriageSection.hidden = isPrimaryWorkspacePage || isDetailedExperienceMode;
      elements.detailedDiagnosticsSection.hidden = !isDetailedOverview;
      if (elements.sidebarQuickActions) elements.sidebarQuickActions.hidden = true;
      elements.opsDockSection.hidden = isPrimaryWorkspacePage || !isDetailedExperienceMode || isDetailedOverview;
      elements.alertsSection.hidden = isPrimaryWorkspacePage || !isDetailedExperienceMode || isDetailedOverview || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "alerts");
      elements.heroStatusPanel.hidden = isPrimaryWorkspacePage || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "overview");
      elements.metricsSection.hidden = !isReadingsPage
        && (isPrimaryWorkspacePage || isSimpleExperienceMode || isDetailedOverview || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "metrics"));
      elements.sensorHealthSection.hidden = isPrimaryWorkspacePage || !isDetailedExperienceMode || isDetailedOverview || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "power");
      elements.impactBoardPanel.dataset.state = impactBoardState.state;
      elements.impactBoardTitle.textContent = impactBoardState.title;
      elements.impactBoardSummary.textContent = impactBoardState.summary;
      elements.impactBaselineScore.textContent = impactBoardState.baselineScore;
      elements.impactCurrentScore.textContent = impactBoardState.currentScore;
      elements.impactBoardMeta.textContent = impactBoardState.meta;
      applyStateChip(elements.impactScoreDeltaChip, impactBoardState.state, impactBoardState.deltaChip);
      elements.impactBoardActionButton.textContent = impactBoardAction?.label || "Open analytics";
      elements.decisionBriefTitle.textContent = decisionBriefPayload.title;
      elements.decisionBriefSummary.textContent = decisionBriefPayload.summary;
      elements.decisionBriefPreview.textContent = decisionBriefPayload.preview;
      elements.decisionBriefChips.innerHTML = renderDecisionBriefChips(decisionBriefPayload.chips);
      setDecisionBriefStatus("Ready to share", "neutral");
      elements.impactBoardCards.innerHTML = renderImpactBoardCards(currentImpactBoardCards, {
        emptyTitle: isSiteView ? "No location movers are active against live baseline." : "No metric movers are active against live baseline.",
        emptyNote: activeScenarioKey === "optimal" && !manualOverride
          ? isSiteView
            ? `The current location score matches the live baseline. Switch presets or open a block to rehearse drift.`
            : `The current block score matches the live baseline. Switch presets or move a slider to rehearse drift.`
          : `The active scenario is not creating a measurable score shift in the current scope.`
      });
      const forceOpenAlertsFocus = activeWorkspaceFocus === "alerts";
      elements.globalSystemCard.dataset.state = globalState;
      elements.globalSystemCard.dataset.collapsed = forceOpenAlertsFocus ? "false" : globalSystemCollapsed ? "true" : "false";
      elements.globalSystemTitle.textContent = globalState === "critical"
        ? "Critical issues exist in the system"
        : globalState === "warning"
          ? "Some blocks need attention"
          : "All locations are currently stable";
      elements.globalSystemSummary.textContent = globalState === "optimal"
        ? `${globalStable} stable blocks across the system`
        : `${globalCritical} critical · ${globalWarning} warning blocks across the system`;
      elements.globalSystemText.textContent = globalState === "optimal"
        ? "No critical issues were detected across the customer system."
        : "This summary includes every location and block in the customer system, including the one currently open.";
      elements.globalSystemExpanded.hidden = forceOpenAlertsFocus ? false : globalSystemCollapsed;
      applyStateChip(elements.globalSystemChip, globalState);
      elements.globalStableCount.textContent = globalStable;
      elements.globalWarningCount.textContent = globalWarning;
      elements.globalCriticalCount.textContent = globalCritical;
      elements.alertRailMeta.textContent = activeAlertRailFilter.description;
      elements.alertRailFilters.innerHTML = renderAlertRailFilters(alertRailFilters, activeAlertRailFilter.key);
        elements.globalSystemList.innerHTML = renderGlobalSystemList(filteredAlertRailItems.slice(0, 6), {
          activeSiteId: site.id,
          activeFilterKey: activeAlertRailFilter.key
        });
      } catch (error) {
        console.error("Non-critical dashboard section failed to render", error);
      }
      document.body.dataset.dashboardState = displayedOverallState.state;
      document.body.dataset.workspaceFocus = activeWorkspaceFocus;
      document.body.dataset.viewScope = activeViewScope;
      document.body.dataset.experienceMode = activeExperienceMode;
      document.body.dataset.primaryPage = activePrimaryPage;
      elements.heroStatusPanel.dataset.state = displayedOverallState.state;
      elements.heroHeadline.textContent = heroDecision.headline;
      elements.heroDescription.textContent = heroDecision.description;
      elements.scopeChip.textContent = isSimpleExperienceMode
        ? `System: ${globalCritical} critical · ${globalWarning} warning · ${globalStable} OK`
        : isSiteView
          ? `Showing: ${site.name}`
          : `Showing: ${site.name} / ${zone.name}`;
      elements.scopeChip.dataset.state = isSimpleExperienceMode ? globalState : displayedOverallState.state;
      elements.heroTimestampChip.textContent = `Updated ${timestamp}`;
      elements.advancedToolsPanel.hidden = !isDetailedOverview;
      elements.advancedToolsTitle.textContent = advancedToolsState.title;
      elements.advancedToolsSummaryText.textContent = advancedToolsState.summary;
      applyStateChip(elements.advancedToolsStateChip, advancedToolsState.state, advancedToolsState.chipLabel);
      elements.scenarioLabPanel.dataset.state = scenarioTone;
      elements.scenarioLabTitle.textContent = scenarioLabTitle;
      elements.scenarioLabSummary.textContent = scenarioLabSummary;
      elements.scenarioLabScopeChip.textContent = scenarioScopeText;
      elements.scenarioLabModeChip.textContent = scenarioModeText;
      elements.manualOverridePanel.dataset.active = String(manualOverride);
      elements.manualOverridePanel.dataset.state = scenarioTone;
      elements.manualOverrideState.textContent = manualOverrideStateText;
      elements.manualOverrideTitle.textContent = manualOverrideTitle;
      elements.manualOverrideSummary.textContent = manualOverrideSummary;
      elements.manualOverrideMeta.textContent = manualOverrideMeta;
      elements.manualOverrideResetButton.disabled = !manualOverride;
      elements.manualOverrideResetButton.setAttribute("aria-disabled", String(!manualOverride));
      scenarioPresetButtons.forEach((button) => {
        const isActive = button.dataset.scenarioPreset === activeScenarioKey;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      elements.indicatorTitle.textContent = isSimpleExperienceMode
        ? isSiteView ? "Area conditions score" : "Growing Conditions Score"
        : isSiteView ? "Area conditions index" : "Growing Conditions Index";
      elements.indicatorScoreLabel.textContent = isSimpleExperienceMode
        ? "Conditions score"
        : isSiteView ? "Selected area conditions" : "Selected section conditions";
      elements.indicatorMetaLabel.textContent = isSiteView ? "Sections included" : "Oldest node uplink";
      elements.indicatorSummary.textContent = isSiteView
        ? buildSiteIndicatorSummary(siteSnapshots, topIndicatorDrivers)
        : buildGrowthIndicatorSummary(topIndicatorDrivers, unavailableCount);
      applyStateChip(elements.indicatorZoneBadge, displayedOverallState.state, getScopeBadgeLabel(displayedOverallState.state, activeViewScope));
      elements.indicatorScoreWrap.dataset.state = displayedOverallState.state;
      elements.indicatorScore.textContent = `${displayedOverallState.indexScore}`;
      elements.indicatorScoreState.textContent = getHealthStateLabel(displayedOverallState.state);
      elements.heroSensorGlanceTitle.textContent = heroSensorGlanceState.title;
      elements.heroSensorGlanceSummary.textContent = heroSensorGlanceState.summary;
      elements.heroSensorGlanceGrid.innerHTML = renderHeroSensorGlanceCards(heroSensorGlanceState.items);
      elements.indicatorSupportGrid.hidden = isSimpleExperienceMode;
      elements.indicatorCountStrip.hidden = isSimpleExperienceMode;
      elements.indicatorDrivers.innerHTML = renderIndicatorDrivers(topIndicatorDrivers);
      elements.indicatorDriverGroup.hidden = topIndicatorDrivers.length === 0;
      elements.indicatorDrivers.hidden = topIndicatorDrivers.length === 0;
      const visibleActionDeckCards = isSimpleExperienceMode
        ? actionDeck.cards.slice(0, 1).map((card) => ({
            ...card,
            kicker: "Recommended next step",
            cta: card.targetId === "metricsSection" ? "Open all readings" : card.cta
          }))
        : actionDeck.cards;
      elements.actionDeckLabel.textContent = isSimpleExperienceMode ? "Recommended next step" : "What to do now";
      elements.actionDeckShell.hidden = isSimpleExperienceMode;
      elements.actionDeckSummary.textContent = actionDeck.cards[0]
        ? isSimpleExperienceMode
          ? `Start with ${actionDeck.cards[0].title.toLowerCase()}. Open detailed analysis only if you need full readings, hardware checks, or wider system context.`
          : `Start with ${actionDeck.cards[0].title.toLowerCase()}. If you need more follow-up, continue from left to right.`
        : "Follow the cards from left to right when you need the next step.";
      elements.actionDeckShortcuts.hidden = isSimpleExperienceMode;
      elements.actionDeckShortcuts.textContent = "Now -> Next -> Later";
      elements.actionDeck.innerHTML = renderActionDeckCards(visibleActionDeckCards);
      currentActionDeckCards = visibleActionDeckCards;
      actionDeckShortcutMap = new Map(visibleActionDeckCards.map((card, index) => [String(index + 1), card]));
      elements.todayPriorityPanel.hidden = true;
      if (isSimpleExperienceMode && !isPrimaryWorkspacePage) {
        const prioritySnapshot = allSystemIssues[0] || { site, zone, profile, results };
        const priorityResult = prioritySnapshot?.results
          ?.filter((result) => result.available !== false && isGrowthMetricKey(result.key))
          .sort((left, right) => {
            if (left.state !== "optimal" && right.state === "optimal") return -1;
            if (left.state === "optimal" && right.state !== "optimal") return 1;
            return right.severity - left.severity;
          })[0] || null;
        const priorityDefinition = priorityResult ? prioritySnapshot.profile.metrics[priorityResult.key] : null;
        const priorityTrendOption = priorityResult && priorityDefinition ? {
          key: priorityResult.key,
          value: priorityResult.value,
          state: priorityResult.state,
          definition: priorityDefinition,
          optimalRange: priorityDefinition.optimal
        } : null;
        const prioritySeries = priorityTrendOption
          ? buildTrendSeries(priorityTrendOption, "24h", `${prioritySnapshot.site.id}:${prioritySnapshot.zone.id}:priority`)
          : null;
        const priorityDelta = prioritySeries
          ? roundValue(prioritySeries.values[prioritySeries.values.length - 1] - prioritySeries.values[0], priorityDefinition.decimals)
          : 0;
        const priorityAlert = priorityResult
          ? alertRecords.find((record) => record.site.id === prioritySnapshot.site.id && record.zone.id === prioritySnapshot.zone.id && record.metricKey === priorityResult.key)
          : null;
        const priorityTrend = !priorityDefinition
          ? "No trend yet"
          : priorityDelta === 0
            ? "Stable over 24 h"
            : `${priorityDelta > 0 ? "↑" : "↓"} ${formatValue(Math.abs(priorityDelta), priorityDefinition)} in 24 h`;
        const globalPriorityAction = priorityResult && priorityDefinition ? {
          state: priorityResult.state,
          title: `${getDecisionVerb(priorityResult, priorityDefinition)} ${priorityDefinition.label.toLowerCase()}`,
          note: `${prioritySnapshot.zone.name} in ${prioritySnapshot.site.name} is ${priorityResult.deviationText.toLowerCase()}. ${getDecisionImpactText(priorityResult.key, priorityDefinition.label)}`,
          cta: "Open metrics",
          targetId: "metricsSection",
          siteId: prioritySnapshot.site.id,
          zoneId: prioritySnapshot.zone.id,
          profileKey: prioritySnapshot.zone.profile,
          metricKey: priorityResult.key
        } : actionDeck.cards[0];
        renderTodayPriority([globalPriorityAction], allSystemIssues, {
          metric: priorityDefinition?.label,
          definition: priorityDefinition,
          result: priorityResult,
          trend: priorityTrend,
          duration: priorityAlert ? formatAlertDuration(priorityAlert.detectedAt) : "Latest reading",
          scopeLabel: prioritySnapshot.zone.name,
          siteId: prioritySnapshot.site.id,
          zoneId: prioritySnapshot.zone.id,
          siteName: prioritySnapshot.site.name,
          zoneName: prioritySnapshot.zone.name
        });
      } else {
        currentTodayPriorityAction = null;
      }
      elements.indicatorUplink.textContent = isSiteView
        ? manualOverride
          ? `${siteSnapshots.length} sections | manual branch`
          : `${siteSnapshots.length} sections`
        : manualOverride ? "manual test" : stateConfig[activeScenarioKey].uplink;

      elements.conditionFill.style.width = `${thumbPosition}%`;
      elements.conditionThumb.style.left = `${thumbPosition}%`;
      elements.conditionThumb.style.setProperty("--thumb-color", stateConfig[displayedOverallState.state].thumb);
      elements.conditionThumbLabel.textContent = `${displayedOverallState.indexScore}%`;
      elements.conditionTrackShell.hidden = isSimpleExperienceMode;
      elements.indicatorStageFooter.hidden = isSimpleExperienceMode;

      elements.overallStateCard.dataset.state = displayedOverallState.state;
      elements.overallStateCard.hidden = false;
      elements.overallStateTitle.textContent = heroDecision.title;
      elements.stableCount.textContent = displayedOverallState.stableCount;
      elements.warningCount.textContent = displayedOverallState.warningCount;
      elements.criticalCount.textContent = displayedOverallState.criticalCount;
      elements.decisionFocusValue.textContent = heroDecision.focusValue;
      elements.decisionFocusNote.textContent = heroDecision.focusNote;
      elements.decisionUrgencyValue.textContent = heroDecision.urgency.value;
      elements.decisionUrgencyNote.textContent = heroDecision.urgency.note;
      elements.decisionConfidenceValue.textContent = heroDecision.confidence.value;
      elements.decisionConfidenceNote.textContent = heroDecision.confidence.note;
      elements.headerBatteryIndicator.dataset.state = headerBatteryState;
      elements.headerBatteryIndicator.setAttribute(
        "aria-label",
        `${systemLowBatteryNodes.length} slave nodes below battery threshold`
      );
      elements.headerBatteryCount.textContent = String(systemLowBatteryNodes.length);
      renderHeaderBatteryDropdown(systemLowBatteryNodes);

      if (batteryDefinition && batteryResult) {
        if (isSiteView) {
          const siteLowBatteryNodes = sensorHealthNodes.filter((node) => node.level < batteryThreshold);
          const siteBatteryState = siteLowBatteryNodes.length === 0
            ? "optimal"
            : siteLowBatteryNodes.some((node) => node.level < criticalBatteryThreshold)
              ? "critical"
              : "warning";

          elements.sensorHealthTitle.textContent = "Power triage across location";
          applyStateChip(elements.sensorHealthChip, siteBatteryState, stateConfig[siteBatteryState].label);
          elements.sensorHealthSummary.textContent = siteLowBatteryNodes.length > 0
            ? `${siteLowBatteryNodes.length} slave nodes across this location are below the ${batteryThreshold}% battery threshold.`
            : "All slave nodes in this location are above the configured battery alert threshold.";
          elements.sensorHealthMeta.textContent = activeSensorHealthFilter?.description || `Showing all ${sensorHealthNodes.length} nodes in this location power triage board.`;
          elements.sensorHealthFilters.innerHTML = renderSensorHealthFilters(sensorHealthFilters, activeSensorHealthFilter?.key);
          elements.sensorHealthList.innerHTML = renderSensorHealthNodeCards(filteredSensorHealthNodes, batteryDefinition, {
            isSiteView: true,
            emptyTitle: activeSensorHealthFilter?.key === "focus" ? "No location nodes need power attention." : "No location nodes match this filter.",
            emptyNote: activeSensorHealthFilter?.key === "focus"
              ? `Every node in ${site.name} is currently above the ${batteryThreshold}% watch threshold.`
              : `Try another filter to inspect a different slice of the location power triage board.`
          });
        } else {
          const lowBatteryNodes = sensorHealthNodes.filter((node) => node.level < batteryThreshold);

          elements.sensorHealthTitle.textContent = "Power triage by block";
          applyStateChip(
            elements.sensorHealthChip,
            batteryResult.available === false ? "warning" : batteryResult.state,
            batteryResult.available === false ? "Unavailable" : stateConfig[batteryResult.state].label
          );
          elements.sensorHealthSummary.textContent = batteryResult.available === false
            ? "Battery telemetry is not installed in this block."
            : lowBatteryNodes.length > 0
              ? `${lowBatteryNodes.length} slave nodes are below the ${batteryThreshold}% battery threshold in this block.`
              : "All slave nodes are above the configured battery alert threshold in this block.";
          elements.sensorHealthMeta.textContent = batteryResult.available === false
            ? "Install battery telemetry in this block before treating sensor power as observable."
            : activeSensorHealthFilter?.description || `Showing all ${sensorHealthNodes.length} nodes in this block power triage board.`;
          elements.sensorHealthFilters.innerHTML = batteryResult.available === false
            ? ""
            : renderSensorHealthFilters(sensorHealthFilters, activeSensorHealthFilter?.key);
          elements.sensorHealthList.innerHTML = batteryResult.available === false
            ? `
              <div class="workbench-empty-card">
                <div class="workbench-empty-title">Battery telemetry is unavailable.</div>
                <p class="workbench-empty-note">This block cannot be triaged for node power until battery telemetry is installed.</p>
              </div>
            `
            : renderSensorHealthNodeCards(filteredSensorHealthNodes, batteryDefinition, {
                isSiteView: false,
                emptyTitle: activeSensorHealthFilter?.key === "focus" ? "No block nodes need power attention." : "No block nodes match this filter.",
                emptyNote: activeSensorHealthFilter?.key === "focus"
                  ? `Every node in ${zone.name} is currently above the ${batteryThreshold}% watch threshold.`
                  : `Try another filter to inspect a different slice of the block power triage board.`
              });
        }
      }

      elements.metricsSectionKicker.textContent = isReadingsPage
        ? diagnosticText("Live readings", "Dabartiniai rodmenys")
        : isSiteView
        ? isSimpleExperienceMode
          ? "Location summary"
          : activeSiteDetailView === "zones"
            ? "Location hotspots"
            : "Location metrics"
        : isSimpleExperienceMode
          ? "Key readings"
          : "Metrics";
      elements.metricsSectionTitle.textContent = isReadingsPage
        ? diagnosticText(
            `All live parameters in ${isSiteView ? site.name : zone.name}`,
            `Visi dabartiniai rodmenys: ${isSiteView ? site.name : zone.name}`
          )
        : isSiteView
        ? isSimpleExperienceMode
          ? "The readings behind this location score"
          : activeSiteDetailView === "zones"
            ? "Which blocks deserve the first walk-through"
            : "Average sensor readings across location"
        : isSimpleExperienceMode
          ? "The readings behind this score"
          : "What drives the index most";
      elements.workbenchToolbar.hidden = isSimpleExperienceMode;
      elements.workbenchLensBar.innerHTML = renderWorkbenchLenses(currentWorkbenchLenses, activeWorkbenchLens?.key);
      elements.workbenchLensSummary.textContent = isReadingsPage
        ? diagnosticText(
            "Choose a metric group or open its trend for the full history.",
            "Pasirinkite rodiklių grupę arba atidarykite grafiką išsamiai istorijai."
          )
        : isSimpleExperienceMode
        ? "Only the most relevant live readings are shown here."
        : activeWorkbenchLens?.description || "Focus the workbench on the slice that matters most right now.";
      elements.zoneImpactSection.hidden = isManagementPage || !isDetailedExperienceMode || isDetailedOverview || isSiteHotspotsView || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "route");
      elements.zoneImpactKicker.textContent = "Inspection route";
      elements.zoneImpactTitle.textContent = isSiteView ? "How to walk this location" : "Where to look next";
      elements.zoneImpactMeta.textContent = activeInspectionRouteFilter?.description || "Follow the route in the order that reduces uncertainty fastest.";
      elements.zoneImpactFilters.innerHTML = renderInspectionRouteFilters(inspectionRouteState.filters, activeInspectionRouteFilter?.key || inspectionRouteState.defaultKey);
      zoneImpactAction = isSiteHotspotsView
        ? null
        : isSiteView
        ? weakestSiteSnapshot
          ? { type: "open-zone", siteId: site.id, zoneId: weakestSiteSnapshot.zone.id }
          : null
        : { type: "open-site", siteId: site.id };
      elements.zoneImpactActionButton.textContent = isSiteView
        ? weakestSiteSnapshot && weakestSiteSnapshot.overall.state !== "optimal"
          ? `Start with ${weakestSiteSnapshot.zone.name}`
          : weakestSiteSnapshot
            ? `Open ${weakestSiteSnapshot.zone.name}`
            : "Open block view"
        : "Open location hotspots";
      elements.zoneImpactActionButton.hidden = !isDetailedExperienceMode || !zoneImpactAction;
      elements.zoneImpactGrid.dataset.mode = isSiteView ? "site-route" : "zone-route";
      elements.zoneImpactGrid.classList.remove("space-y-4");
      elements.metricsGrid.dataset.mode = isSiteView
        ? activeSiteDetailView === "zones" ? "site-hotspots" : "site-averages"
        : "zone-metrics";
      const trendMetricOptions = isSiteHotspotsView
        ? []
        : buildTrendMetricOptions({
            isSiteView,
            site,
            zone,
            profile,
            growthResults,
            siteAverageSummaries
          });
      currentTrendMetricOptions = trendMetricOptions;

      if (!skipMetricsGrid) {
        elements.metricsGrid.dataset.display = isReadingsPage && !isSiteView ? "readings-board" : "cards";
        if (isSiteView) {
          if (isSiteHotspotsView) {
            const filteredHotspots = filterSiteHotspotsByWorkbenchLens(siteSnapshots, activeWorkbenchLens);
            elements.metricsGrid.innerHTML = filteredHotspots.length > 0
              ? renderSiteZoneCards(filteredHotspots)
              : renderWorkbenchEmptyState(
                  activeWorkbenchLens?.key === "focus" ? "No hotspot blocks in focus." : "No blocks match this lens.",
                  activeWorkbenchLens?.key === "focus"
                    ? `Every block in ${site.name} is currently stable. Switch to All blocks if you want the full ranked list anyway.`
                    : `Try another lens to inspect a different slice of ${site.name}.`,
                  "all"
                );
          } else {
            const filteredAverageSummaries = filterSiteAverageSummariesByWorkbenchLens(siteAverageSummaries, activeWorkbenchLens);
            elements.metricsGrid.innerHTML = filteredAverageSummaries.length > 0
              ? renderSiteAverageSummaryCards(filteredAverageSummaries)
              : renderWorkbenchEmptyState(
                  activeWorkbenchLens?.key === "coverage" ? "No coverage gaps in this lens." : "No averages match this lens.",
                  activeWorkbenchLens?.key === "coverage"
                    ? `Every location average in ${site.name} is currently backed by full block coverage.`
                    : `Try another lens to inspect a different slice of the location averages.`,
                  "all"
                );
          }
          elements.unavailableMetricsPanel.hidden = true;
          elements.unavailableMetricsGrid.innerHTML = "";
        } else {
          const filteredZoneResults = filterZoneGrowthResultsByWorkbenchLens(growthResults, activeWorkbenchLens);
          const filteredAvailableMetrics = filteredZoneResults.filter((result) => result.available !== false);
          const filteredUnavailableMetrics = filteredZoneResults.filter((result) => result.available === false);

          if (isReadingsPage) {
            elements.metricsGrid.innerHTML = filteredZoneResults.length > 0
              ? renderLiveReadingsBoard(filteredZoneResults, profile, site, zone)
              : renderWorkbenchEmptyState(
                  diagnosticText("No parameters match this filter.", "Šio filtro neatitinka nė vienas rodiklis."),
                  diagnosticText("Choose another parameter group.", "Pasirinkite kitą rodiklių grupę."),
                  "all"
                );
            elements.unavailableMetricsPanel.hidden = true;
            elements.unavailableMetricsGrid.innerHTML = "";
          } else if (activeWorkbenchLens?.key === "coverage") {
            elements.metricsGrid.innerHTML = filteredUnavailableMetrics.length > 0
              ? filteredUnavailableMetrics.map((result) => renderMetricCard(result.key, profile.metrics[result.key], result)).join("")
              : renderWorkbenchEmptyState(
                  "No coverage gaps in this block.",
                  `Every growth metric in ${zone.name} is currently installed.`,
                  "all"
                );
            elements.unavailableMetricsPanel.hidden = true;
            elements.unavailableMetricsGrid.innerHTML = "";
          } else {
            elements.metricsGrid.innerHTML = filteredAvailableMetrics.length > 0
              ? filteredAvailableMetrics.map((result) => renderMetricCard(result.key, profile.metrics[result.key], result)).join("")
              : renderWorkbenchEmptyState(
                  activeWorkbenchLens?.key === "focus" ? "No urgent metrics in focus." : "No live metrics match this lens.",
                  activeWorkbenchLens?.key === "focus"
                    ? `The live growth metrics in ${zone.name} are currently stable. Switch to All metrics for the full workbench.`
                    : `Try another lens to inspect a different slice of ${zone.name}.`,
                  "all"
                );

            const overflowUnavailableResults = activeWorkbenchLens?.key === "all" || activeWorkbenchLens?.kind === "group"
              ? filteredUnavailableMetrics
              : [];

            if (overflowUnavailableResults.length > 0) {
              const overflowLabel = activeWorkbenchLens?.kind === "group"
                ? `${activeWorkbenchLens.label} coverage gaps`
                : "Not installed on this block";

              elements.unavailableMetricsPanel.hidden = false;
              elements.unavailableMetricsTitle.textContent = overflowLabel;
              elements.unavailableMetricsCount.textContent = `${overflowUnavailableResults.length} metrics`;
              elements.unavailableMetricsGrid.innerHTML = overflowUnavailableResults.map((result) => renderMetricCard(result.key, profile.metrics[result.key], result)).join("");
            } else {
              elements.unavailableMetricsPanel.hidden = true;
              elements.unavailableMetricsGrid.innerHTML = "";
            }
          }
        }
      }

      if (isSimpleExperienceMode) {
        elements.unavailableMetricsPanel.hidden = true;
        elements.unavailableMetricsGrid.innerHTML = "";
      }

      const defaultTrendMetricKey = isSiteView
        ? topIndicatorDrivers[0]?.key || trendMetricOptions[0]?.key || ""
        : getPrimaryNonOptimalResult(nonOptimalResults)?.key || trendMetricOptions[0]?.key || "";
      const trendHistoryState = buildTrendHistoryState({
        isSiteView,
        site,
        zone,
        trendMetricOptions,
        defaultMetricKey: defaultTrendMetricKey
      });
      const shouldHideTrendHistory = !isHistoryPage
        || isManagementPage
        || isSiteHotspotsView
        || !isDetailedExperienceMode
        || !trendHistoryState
        || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "metrics");
      elements.historySection.hidden = shouldHideTrendHistory;

      if (!shouldHideTrendHistory && trendHistoryState) {
        elements.trendHistoryActiveAreaLabel.textContent = site.name;
        elements.trendHistoryActiveSectionLabel.textContent = zone.name;
        const historySiteScores = new Map(dashboardData.sites.map((historySite) => {
          const snapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === historySite.id);
          return [
            historySite.id,
            getContextScoreSummary(snapshots.length > 0 ? deriveSiteOverallState(snapshots) : null)
          ];
        }));
        const selectedHistorySiteScore = historySiteScores.get(site.id) || getContextScoreSummary(null);
        const selectedHistoryZoneScore = getContextScoreSummary(overallState);
        elements.historyLocationValue.textContent = site.name;
        elements.historyBlockValue.textContent = zone.name;
        applyHistorySelectedScore(elements.historyLocationScore, selectedHistorySiteScore);
        applyHistorySelectedScore(elements.historyBlockScore, selectedHistoryZoneScore);
        elements.historyLocationMenu.innerHTML = dashboardData.sites.map((historySite) =>
          renderHistoryScoreOption({
            id: historySite.id,
            name: historySite.name,
            score: historySiteScores.get(historySite.id) || getContextScoreSummary(null),
            isActive: historySite.id === site.id,
            type: "site"
          })
        ).join("");
        elements.historyBlockMenu.innerHTML = (site.zones || []).map((historyZone) => {
          const snapshot = globalSnapshots.find((item) =>
            item.site.id === site.id && item.zone.id === historyZone.id
          );
          return renderHistoryScoreOption({
            id: historyZone.id,
            name: historyZone.name,
            score: getContextScoreSummary(snapshot?.overall || null),
            isActive: historyZone.id === zone.id,
            type: "zone"
          });
        }).join("");
        elements.trendHistoryTitle.textContent = trendHistoryState.title;
        elements.trendHistorySummary.textContent = trendHistoryState.summary;
        applyStateChip(elements.trendHistoryStateChip, trendHistoryState.state, stateConfig[trendHistoryState.state].label);
        elements.trendHistoryRangeMeta.textContent = trendHistoryState.rangeMeta;
        elements.trendMetricBar.innerHTML = trendHistoryState.metricButtons;
        elements.trendRangeBar.innerHTML = trendHistoryState.rangeButtons;
        elements.trendHistoryMetricLabel.textContent = trendHistoryState.metricLabel;
        elements.trendHistoryMetricMeta.textContent = trendHistoryState.metricMeta;
        elements.trendHistoryReadout.innerHTML = trendHistoryState.readoutHtml;
        renderTrendEChart(trendHistoryState.chartOption);
        elements.trendHistoryStartLabel.textContent = trendHistoryState.axisLabels.start;
        elements.trendHistoryMidLabel.textContent = trendHistoryState.axisLabels.mid;
        elements.trendHistoryEndLabel.textContent = trendHistoryState.axisLabels.end;
        elements.trendHistoryCallout.textContent = trendHistoryState.callout;
        elements.trendHistoryBackendNote.textContent = trendHistoryState.backendNote;
      } else {
        currentTrendHistoryPoints = [];
        if (trendHistoryChartInstance) {
          trendHistoryChartInstance.dispose();
          trendHistoryChartInstance = null;
        }
      }

      if (!isSiteHotspotsView) {
        elements.zoneImpactGrid.innerHTML = renderInspectionRouteCards(filteredInspectionRouteItems, {
          emptyTitle: activeInspectionRouteFilter?.key === "focus"
            ? isSiteView
              ? `No urgent route stops in ${site.name}.`
              : `No urgent checks in ${zone.name}.`
            : "No inspection route items match this filter.",
          emptyNote: activeInspectionRouteFilter?.key === "focus"
            ? isSiteView
              ? `Every zone in ${site.name} is currently stable. Open the full route if you want the full ordered walkthrough anyway.`
              : `Every live metric in ${zone.name} is currently inside the target band. Open the full route to review the entire walkthrough anyway.`
            : `Try another route filter to inspect a different slice of the current walkthrough.`
        });
      }

      updateSidebarActionState();
      syncStickyOffsets();
      if (isCommandPaletteOpen) {
        commandPaletteItems = buildCommandPaletteItems();
        renderCommandPalette(false);
      }
      applyInterfaceLanguage();
      enhanceDashboardSelects(document);
    }

    elements.siteTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = elements.siteMenu.hidden;
      setHeaderBatteryDropdownOpen(false);
      closeContextMenus();
      setMenuState(elements.siteTrigger, elements.siteMenu, shouldOpen);
    });

    elements.zoneTrigger.addEventListener("click", (event) => {
      if (activeViewScope === "site") return;
      event.stopPropagation();
      const shouldOpen = elements.zoneMenu.hidden;
      setHeaderBatteryDropdownOpen(false);
      closeContextMenus();
      setMenuState(elements.zoneTrigger, elements.zoneMenu, shouldOpen);
    });

    elements.zoneScopeButton.addEventListener("click", () => {
      if (activeViewScope === "zone") return;
      sidebarActionOverride = null;
      activeViewScope = "zone";
      closeContextMenus();
      renderDashboard();
    });

    elements.siteScopeButton.addEventListener("click", () => {
      if (activeViewScope === "site") return;
      sidebarActionOverride = null;
      activeViewScope = "site";
      closeContextMenus();
      renderDashboard();
    });

    elements.siteAveragesButton.addEventListener("click", () => {
      if (activeSiteDetailView === "averages") return;
      sidebarActionOverride = null;
      activeSiteDetailView = "averages";
      renderDashboard();
    });

    elements.siteZonesButton.addEventListener("click", () => {
      if (activeSiteDetailView === "zones") return;
      sidebarActionOverride = null;
      activeSiteDetailView = "zones";
      renderDashboard();
    });

    elements.experienceModeControl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-experience-mode]");
      if (!button || button.disabled) return;
      const nextMode = button.dataset.experienceMode;
      if (!nextMode || nextMode === activeExperienceMode) return;
      setExperienceMode(nextMode, { scroll: true });
    });

    elements.siteMenu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-site-option]");
      if (!option) return;
      sidebarActionOverride = null;
      activeSiteId = option.dataset.siteId;
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      closeContextMenus();
      renderSiteOptions();
      scheduleDashboardRender();
    });

    elements.zoneMenu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-zone-option]");
      if (!option) return;
      sidebarActionOverride = null;
      activeZoneId = option.dataset.zoneId;
      resetCurrentReadingsFromActiveZone();
      closeContextMenus();
      renderZoneOptions();
      scheduleDashboardRender();
    });

    elements.locationsManagementSection.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.name === "locationName") {
        locationFormState.name = target.value;
      }
    });

    elements.locationsManagementSection.addEventListener("submit", (event) => {
      const form = event.target.closest('[data-management-form="location"]');
      if (!form) return;

      event.preventDefault();
      submitLocationForm();
    });

    elements.locationsManagementSection.addEventListener("click", (event) => {
      const openCreateButton = event.target.closest("[data-location-form-open]");
      if (openCreateButton) {
        resetLocationForm();
        clearManagementNotice("locations");
        renderDashboard();
        return;
      }

      const cancelButton = event.target.closest("[data-location-form-cancel]");
      if (cancelButton) {
        resetLocationForm();
        clearManagementNotice("locations");
        renderDashboard();
        return;
      }

      const editButton = event.target.closest("[data-location-edit]");
      if (editButton) {
        openLocationManagementModal(editButton.dataset.locationEdit);
        return;
      }

      const openLiveButton = event.target.closest("[data-location-open-live]");
      if (openLiveButton) {
        openSiteView(openLiveButton.dataset.locationOpenLive, "averages");
        return;
      }

      const manageBlocksButton = event.target.closest("[data-location-manage-blocks], [data-location-create-block]");
      if (manageBlocksButton) {
        const siteId = manageBlocksButton.dataset.locationManageBlocks || manageBlocksButton.dataset.locationCreateBlock;
        activePrimaryPage = "blocks";
        activeBlockFilterSiteId = siteId;
        resetBlockForm({ siteId });
        clearManagementNotice("blocks");
        renderDashboard();
        syncTopLevelRoute("/sections");
        scrollToSection("blocksManagementSection");
      }
    });

    function syncBlockFormField(target) {
      if (!(target instanceof HTMLElement)) return;

      if (target instanceof HTMLInputElement && target.name === "blockName") {
        blockFormState.name = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.name === "blockSensorCount") {
        blockFormState.sensorCount = target.value;
        return;
      }

      if (target instanceof HTMLSelectElement && target.name === "blockSiteId") {
        blockFormState.siteId = target.value;
        return;
      }

      if (target instanceof HTMLSelectElement && target.name === "blockProfile") {
        blockFormState.profile = target.value;
      }
    }

    elements.blocksManagementSection.addEventListener("input", (event) => {
      syncBlockFormField(event.target);
    });

    elements.blocksManagementSection.addEventListener("change", (event) => {
      if (event.target instanceof HTMLSelectElement && event.target.hasAttribute("data-block-filter-select")) {
        const nextSiteId = event.target.value || "all";
        if (nextSiteId !== activeBlockFilterSiteId) {
          activeBlockFilterSiteId = nextSiteId;
          if (blockFormState.mode === "create" && nextSiteId !== "all") {
            blockFormState.siteId = nextSiteId;
          }
          clearManagementNotice("blocks");
          renderDashboard();
        }
        return;
      }
      syncBlockFormField(event.target);
    });

    elements.blocksManagementSection.addEventListener("submit", (event) => {
      const form = event.target.closest('[data-management-form="block"]');
      if (!form) return;

      event.preventDefault();
      submitBlockForm();
    });

    elements.blocksManagementSection.addEventListener("click", (event) => {
      const filterButton = event.target.closest("[data-block-filter-site-id]");
      if (filterButton) {
        const nextSiteId = filterButton.dataset.blockFilterSiteId || "all";
        if (nextSiteId !== activeBlockFilterSiteId) {
          activeBlockFilterSiteId = nextSiteId;
          if (blockFormState.mode === "create" && nextSiteId !== "all") {
            blockFormState.siteId = nextSiteId;
          }
          clearManagementNotice("blocks");
          renderDashboard();
        }
        return;
      }

      const openCreateButton = event.target.closest("[data-block-form-open]");
      if (openCreateButton) {
        resetBlockForm();
        clearManagementNotice("blocks");
        renderDashboard();
        return;
      }

      const cancelButton = event.target.closest("[data-block-form-cancel]");
      if (cancelButton) {
        resetBlockForm();
        clearManagementNotice("blocks");
        renderDashboard();
        return;
      }

      const editButton = event.target.closest("[data-block-edit-site-id]");
      if (editButton) {
        openBlockManagementModal(editButton.dataset.blockEditSiteId, editButton.dataset.blockEditZoneId);
        return;
      }

      const openLiveButton = event.target.closest("[data-block-open-live-site-id]");
      if (openLiveButton) {
        openZoneDetail(openLiveButton.dataset.blockOpenLiveSiteId, openLiveButton.dataset.blockOpenLiveZoneId);
      }
    });

    elements.nodesManagementSection.addEventListener("input", (event) => {
      syncNodeFormField(event.target);
    });

    elements.nodesManagementSection.addEventListener("change", (event) => {
      if (event.target instanceof HTMLSelectElement && event.target.name === "nodeFilterSiteId") {
        activeNodeFilterSiteId = event.target.value || "all";
        activeNodeFilterZoneId = "all";
        renderDashboard();
        return;
      }

      if (event.target instanceof HTMLSelectElement && event.target.name === "nodeFilterZoneId") {
        activeNodeFilterZoneId = event.target.value || "all";
        renderDashboard();
        return;
      }

      syncNodeFormField(event.target);
      if (event.target instanceof HTMLSelectElement && event.target.name === "nodeSiteId") {
        clearManagementNotice("nodes");
        renderDashboard();
      }
    });

    elements.nodesManagementSection.addEventListener("submit", (event) => {
      const form = event.target.closest('[data-management-form="node"]');
      if (!form) return;

      event.preventDefault();
      submitNodeForm();
    });

    elements.nodesManagementSection.addEventListener("click", (event) => {
      const openBlockButton = event.target.closest("[data-node-open-block-site-id]");
      if (openBlockButton) {
        openZoneDetail(openBlockButton.dataset.nodeOpenBlockSiteId, openBlockButton.dataset.nodeOpenBlockZoneId);
        return;
      }

      const editNodeButton = event.target.closest("[data-node-edit-id]");
      if (editNodeButton) {
        openNodeManagementModal(
          editNodeButton.dataset.nodeEditSiteId,
          editNodeButton.dataset.nodeEditZoneId,
          editNodeButton.dataset.nodeEditId
        );
      }
    });

    elements.settingsManagementSection.addEventListener("input", (event) => {
      syncSettingsProfileFormField(event.target);
      updateSettingsField(event.target);
    });

    elements.settingsManagementSection.addEventListener("change", (event) => {
      if (event.target instanceof HTMLSelectElement && event.target.hasAttribute("data-profile-editor-select")) {
        activeSettingsProfileKey = event.target.value;
        clearManagementNotice("settings");
        renderDashboard();
        const profileEditor = elements.settingsManagementSection.querySelector('[data-settings-form="crop-profile-editor"]');
        profileEditor?.closest("details")?.setAttribute("open", "");
        return;
      }
      syncSettingsProfileFormField(event.target);
      updateSettingsField(event.target);
    });

    elements.settingsManagementSection.addEventListener("submit", (event) => {
      event.preventDefault();
      const profileForm = event.target.closest('[data-management-form="settings-profile"]');
      if (profileForm) {
        submitSettingsProfileForm();
        return;
      }

      const cropProfileEditor = event.target.closest('[data-settings-form="crop-profile-editor"]');
      if (cropProfileEditor) {
        submitCropProfileEditor(cropProfileEditor);
        return;
      }

      const settingsForm = event.target.closest("[data-settings-form]");
      if (!settingsForm) return;
      const formKey = settingsForm.dataset.settingsForm;
      if (formKey === "team") {
        const formData = new FormData(settingsForm);
        const name = String(formData.get("teamName") || "").trim();
        const email = String(formData.get("teamEmail") || "").trim();
        const role = String(formData.get("teamRole") || "Grower");
        if (!name || !email) {
          setManagementNotice("settings", "A team member needs both a name and an email address.", "warning");
          renderDashboard();
          return;
        }
        settingsState.team.push({ id: `team-${Date.now()}`, name, email, role });
        persistSettingsState(`${name} was added to the workspace.`);
      } else {
        persistSettingsState(`${formKey.charAt(0).toUpperCase() + formKey.slice(1)} settings saved.`);
      }
      renderDashboard();
    });

    elements.settingsManagementSection.addEventListener("click", (event) => {
      const profileViewButton = event.target.closest("[data-settings-profile-view]");
      if (profileViewButton) {
        activeCropProfileView = profileViewButton.dataset.settingsProfileView === "library" ? "library" : "mine";
        clearManagementNotice("settings");
        renderDashboard();
        return;
      }

      const createModeButton = event.target.closest("[data-settings-create-mode]");
      if (createModeButton) {
        settingsProfileFormState.mode = createModeButton.dataset.settingsCreateMode === "blank" ? "blank" : "template";
        renderDashboard();
        return;
      }

      const templateButton = event.target.closest("[data-settings-template-key]");
      if (templateButton) {
        const template = cropProfileTemplateLibrary.find((item) => item.key === templateButton.dataset.settingsTemplateKey);
        if (!template) return;
        settingsProfileFormState = {
          name: template.name,
          heroName: template.crop,
          stage: template.stage,
          sourceProfile: template.sourceProfile || activeSettingsProfileKey,
          mode: template.status === "available" ? "template" : "blank"
        };
        activeCropProfileView = "mine";
        clearManagementNotice("settings");
        renderDashboard();
        return;
      }

      const settingsPanelButton = event.target.closest("[data-settings-panel-key]");
      if (settingsPanelButton) {
        activeSettingsPanelKey = settingsPanelButton.dataset.settingsPanelKey || "profiles";
        clearManagementNotice("settings");
        renderDashboard();
        return;
      }

      const removeMemberButton = event.target.closest("[data-team-remove]");
      if (removeMemberButton) {
        const memberId = removeMemberButton.dataset.teamRemove;
        settingsState.team = settingsState.team.filter((member) => member.id !== memberId);
        persistSettingsState("Team member removed from the workspace.");
        renderDashboard();
        return;
      }

      const duplicateProfileButton = event.target.closest("[data-settings-profile-duplicate]");
      if (duplicateProfileButton) {
        const sourceProfileKey = duplicateProfileButton.dataset.settingsProfileDuplicate;
        const sourceProfile = cropProfiles[sourceProfileKey];
        if (!sourceProfile) return;
        settingsProfileFormState = {
          name: `${sourceProfile.name} copy`,
          heroName: sourceProfile.heroName,
          stage: sourceProfile.stage || "",
          sourceProfile: sourceProfileKey,
          mode: "template"
        };
        renderDashboard();
        return;
      }

      const profileButton = event.target.closest("[data-settings-profile-key]");
      if (!profileButton) return;

      activeSettingsProfileKey = profileButton.dataset.settingsProfileKey || activeSettingsProfileKey;
      clearManagementNotice("settings");
      renderDashboard();
    });

    elements.managementModalOverlay.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-management-modal-form]");
      if (!form) return;
      event.preventDefault();

      if (form.dataset.managementModalForm === "location") {
        saveLocationFromModal();
      }
      if (form.dataset.managementModalForm === "block") {
        saveBlockFromModal();
      }
      if (form.dataset.managementModalForm === "node") {
        saveNodeFromModal();
      }
    });

    elements.managementModalOverlay.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === "modalLocationLeaveUnassigned") {
        syncLocationUnassignedChoice();
      }
    });

    elements.managementModalOverlay.addEventListener("click", (event) => {
      if (event.target.closest("[data-management-modal-close]")) {
        closeManagementModal();
        return;
      }

      const openLocationButton = event.target.closest("[data-modal-location-open-live]");
      if (openLocationButton) {
        const siteId = openLocationButton.dataset.modalLocationOpenLive;
        closeManagementModal();
        openSiteView(siteId, "averages");
        return;
      }

      const manageBlocksButton = event.target.closest("[data-modal-location-blocks]");
      if (manageBlocksButton) {
        const siteId = manageBlocksButton.dataset.modalLocationBlocks;
        closeManagementModal();
        activePrimaryPage = "blocks";
        activeBlockFilterSiteId = siteId;
        resetBlockForm({ siteId });
        renderDashboard();
        syncTopLevelRoute("/sections");
        scrollToSection("blocksManagementSection");
        return;
      }

      const deleteLocationButton = event.target.closest("[data-modal-location-delete]");
      if (deleteLocationButton) {
        deleteLocationFromModal(deleteLocationButton.dataset.modalLocationDelete);
        return;
      }

      const openBlockButton = event.target.closest("[data-modal-block-open-live-site]");
      if (openBlockButton) {
        const siteId = openBlockButton.dataset.modalBlockOpenLiveSite;
        const zoneId = openBlockButton.dataset.modalBlockOpenLiveZone;
        closeManagementModal();
        openZoneDetail(siteId, zoneId);
        return;
      }

      const deleteBlockButton = event.target.closest("[data-modal-block-delete-site]");
      if (deleteBlockButton) {
        deleteBlockFromModal(deleteBlockButton.dataset.modalBlockDeleteSite, deleteBlockButton.dataset.modalBlockDeleteZone);
        return;
      }

      const openNodeBlockButton = event.target.closest("[data-modal-node-open-live-site]");
      if (openNodeBlockButton) {
        const siteId = openNodeBlockButton.dataset.modalNodeOpenLiveSite;
        const zoneId = openNodeBlockButton.dataset.modalNodeOpenLiveZone;
        closeManagementModal();
        openZoneDetail(siteId, zoneId);
        return;
      }

      const deleteNodeButton = event.target.closest("[data-modal-node-delete]");
      if (deleteNodeButton) {
        deleteNodeFromModal(deleteNodeButton.dataset.modalNodeDelete);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && managementModalState) {
        closeManagementModal();
      }
    });

    sidebarActionButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        const action = button.dataset.sidebarAction;
        if (!action) return;

        event.preventDefault();
        runDashboardAction(action);
      });
    });

    dashboardActionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        runDashboardAction(button.dataset.dashboardAction);
      });
    });

    mobileCommandButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.mobileCommand === "palette") {
          openCommandPalette();
        }
      });
    });

    elements.workbenchLensBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-workbench-lens]");
      if (!button) return;

      const nextLensKey = button.dataset.workbenchLens;
      if (!nextLensKey || nextLensKey === activeWorkbenchLensKey) return;
      activeWorkbenchLensKey = nextLensKey;
      renderDashboard();
    });

    elements.alertRailFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-alert-filter]");
      if (!button) return;

      event.stopPropagation();
      const nextFilterKey = button.dataset.alertFilter;
      if (!nextFilterKey || nextFilterKey === activeAlertRailFilterKey) return;
      activeAlertRailFilterKey = nextFilterKey;
      renderDashboard();
    });

    elements.sensorHealthFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sensor-health-filter]");
      if (!button) return;

      const nextFilterKey = button.dataset.sensorHealthFilter;
      if (!nextFilterKey || nextFilterKey === activeSensorHealthFilterKey) return;
      activeSensorHealthFilterKey = nextFilterKey;
      renderDashboard();
    });

    elements.zoneImpactFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-inspection-route-filter]");
      if (!button) return;

      const nextFilterKey = button.dataset.inspectionRouteFilter;
      if (!nextFilterKey || nextFilterKey === activeInspectionRouteFilterKey) return;
      activeInspectionRouteFilterKey = nextFilterKey;
      renderDashboard();
    });

    scenarioPresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyScenarioPreset(button.dataset.scenarioPreset);
      });
    });

    elements.manualOverrideResetButton.addEventListener("click", () => {
      resetManualTest();
    });

    elements.sensorHealthActionButton.addEventListener("click", () => {
      runDashboardAction("nodes");
    });

    elements.opsDockResetButton.addEventListener("click", () => {
      runOpsDockAction("reset-view");
    });

    elements.opsDockSecondaryButton.addEventListener("click", () => {
      runOpsDockAction("reset-test");
    });

    elements.opsDockCards.addEventListener("click", (event) => {
      const card = event.target.closest("[data-ops-action]");
      if (!card) return;

      runOpsDockAction(card.dataset.opsAction);
    });

    elements.workspaceFocusBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-workspace-focus]");
      if (!button) return;

      setWorkspaceFocus(button.dataset.workspaceFocus);
    });

    elements.impactBoardActionButton.addEventListener("click", () => {
      executeImpactBoardAction(impactBoardAction);
    });

    elements.impactBoardCards.addEventListener("click", (event) => {
      const card = event.target.closest("[data-impact-index]");
      if (!card) return;

      executeImpactBoardAction(currentImpactBoardCards[Number(card.dataset.impactIndex)]?.action);
    });

    elements.decisionBriefCopyShortButton.addEventListener("click", () => {
      copyDecisionBrief("short");
    });

    elements.decisionBriefCopyButton.addEventListener("click", () => {
      copyDecisionBrief("detailed");
    });

    elements.commandPaletteButton.addEventListener("click", () => {
      openCommandPalette();
    });

    elements.commandPaletteOverlay.addEventListener("click", (event) => {
      if (event.target.closest("[data-command-dismiss]")) {
        closeCommandPalette();
      }
    });

    elements.commandPaletteInput.addEventListener("input", () => {
      renderCommandPalette(true);
    });

    elements.commandPaletteInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (filteredCommandPaletteItems.length === 0) return;
        activeCommandPaletteIndex = (activeCommandPaletteIndex + 1) % filteredCommandPaletteItems.length;
        renderCommandPalette(false);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (filteredCommandPaletteItems.length === 0) return;
        activeCommandPaletteIndex = (activeCommandPaletteIndex - 1 + filteredCommandPaletteItems.length) % filteredCommandPaletteItems.length;
        renderCommandPalette(false);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        executeCommandPaletteItem(filteredCommandPaletteItems[activeCommandPaletteIndex]);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeCommandPalette();
      }
    });

    elements.commandPaletteResults.addEventListener("mousemove", (event) => {
      const option = event.target.closest("[data-command-result-index]");
      if (!option) return;

      const nextIndex = Number(option.dataset.commandResultIndex);
      if (Number.isNaN(nextIndex) || nextIndex === activeCommandPaletteIndex) return;
      activeCommandPaletteIndex = nextIndex;
      renderCommandPalette(false);
    });

    elements.commandPaletteResults.addEventListener("click", (event) => {
      const option = event.target.closest("[data-command-result-index]");
      if (!option) return;

      executeCommandPaletteItem(filteredCommandPaletteItems[Number(option.dataset.commandResultIndex)]);
    });

    document.addEventListener("click", (event) => {
      const enhancedSelectOption = event.target.closest?.("[data-nc-select-option]");
      if (enhancedSelectOption) {
        const select = document.querySelector(
          `select[data-nc-select-enhanced="${CSS.escape(enhancedSelectOption.dataset.selectId || "")}"]`
        );
        if (select instanceof HTMLSelectElement && !enhancedSelectOption.disabled) {
          select.value = enhancedSelectOption.dataset.value || "";
          syncEnhancedSelect(select);
          closeEnhancedSelectMenus();
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      const enhancedSelectTrigger = event.target.closest?.("[data-nc-select-trigger]");
      if (enhancedSelectTrigger) {
        const wrapper = enhancedSelectTrigger.closest(".nc-select");
        if (!wrapper || enhancedSelectTrigger.disabled) return;
        const shouldOpen = wrapper.dataset.open !== "true";
        closeEnhancedSelectMenus(wrapper);
        wrapper.dataset.open = String(shouldOpen);
        enhancedSelectTrigger.setAttribute("aria-expanded", String(shouldOpen));
        const menu = wrapper.querySelector("[data-nc-select-menu]");
        if (menu) menu.hidden = !shouldOpen;
        return;
      }

      if (!event.target.closest?.(".nc-select")) {
        closeEnhancedSelectMenus();
      }

      if (
        isHeaderBatteryDropdownOpen &&
        !event.target.closest("#headerBatteryDropdown") &&
        !event.target.closest("#headerBatteryIndicator")
      ) {
        setHeaderBatteryDropdownOpen(false);
      }

      if (
        isHeaderAccountMenuOpen &&
        !event.target.closest("#headerAccountMenu") &&
        !event.target.closest("#headerAccountButton")
      ) {
        setHeaderAccountMenuOpen(false);
      }

      if (event.target.closest(".context-card")) return;
      closeContextMenus();
    });

    window.addEventListener("storage", refreshDashboardDataFromStore);
    window.addEventListener("focus", refreshDashboardDataFromStore);
    window.addEventListener("resize", syncStickyOffsets);
    window.addEventListener("resize", () => trendHistoryChartInstance?.resize());

    elements.headerBatteryIndicator.addEventListener("click", (event) => {
      event.stopPropagation();
      closeContextMenus();
      setHeaderBatteryDropdownOpen(!isHeaderBatteryDropdownOpen);
    });

    elements.headerAccountButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setHeaderBatteryDropdownOpen(false);
      setHeaderAccountMenuOpen(!isHeaderAccountMenuOpen);
    });

    elements.signOutButton.addEventListener("click", signOut);

    elements.actionDeck.addEventListener("click", (event) => {
      const card = event.target.closest("[data-action-index]");
      if (!card) return;

      executeActionDeckAction(currentActionDeckCards[Number(card.dataset.actionIndex)]);
    });

    elements.overviewTriageSection.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-triage-action]");
      if (!actionButton) return;

      const action = actionButton.dataset.triageAction;
      if (action === "trend") {
        const metricKey = actionButton.dataset.metricKey;
        if (metricKey) {
          activeTrendMetricKey = metricKey;
          activeTrendMetricKeys = [metricKey];
        }
        runDashboardAction("history");
        return;
      }
      if (action === "nodes") {
        runDashboardAction("nodes");
        return;
      }
      if (action === "alerts") {
        runDashboardAction("alerts");
      }
    });

    elements.detailedDiagnosticsSection.addEventListener("click", (event) => {
      const evidenceOpenButton = event.target.closest("[data-diagnostic-evidence-open]");
      const evidenceCloseButton = event.target.closest("[data-diagnostic-evidence-close]");
      if (evidenceOpenButton || evidenceCloseButton) {
        const drawer = elements.detailedDiagnosticsSection.querySelector("#diagnosticEvidenceDrawer");
        const backdrop = elements.detailedDiagnosticsSection.querySelector(".diagnostic-drawer-backdrop");
        const shouldOpen = Boolean(evidenceOpenButton);

        if (drawer && backdrop) {
          drawer.hidden = !shouldOpen;
          backdrop.hidden = !shouldOpen;
          drawer.setAttribute("aria-hidden", String(!shouldOpen));
          elements.detailedDiagnosticsSection
            .querySelector("[data-diagnostic-evidence-open]")
            ?.setAttribute("aria-expanded", String(shouldOpen));
        }
        return;
      }

      const actionButton = event.target.closest("[data-triage-action]");
      if (!actionButton) return;

      const action = actionButton.dataset.triageAction;
      if (action === "trend") {
        const metricKey = actionButton.dataset.metricKey;
        if (metricKey) {
          activeTrendMetricKey = metricKey;
          activeTrendMetricKeys = [metricKey];
        }
        runDashboardAction("history");
        return;
      }
      if (action === "nodes") {
        runDashboardAction("nodes");
        return;
      }
      if (action === "alerts") {
        runDashboardAction("alerts");
      }
    });

    elements.todayPriorityPanel.addEventListener("click", (event) => {
      const whyButton = event.target.closest("[data-today-priority-why]");
      if (whyButton) {
        const whyPanel = document.getElementById("todayPriorityWhyPanel");
        if (whyPanel) {
          const nextHidden = !whyPanel.hidden ? true : false;
          whyPanel.hidden = nextHidden;
          whyButton.setAttribute("aria-expanded", String(!nextHidden));
        }
        return;
      }

      if (event.target.closest("[data-today-priority-action]")) {
        executeTodayPriorityAction(currentTodayPriorityAction);
        return;
      }

      const followUp = event.target.closest("[data-today-followup-index]");
      if (followUp) {
        executeTodayPriorityAction(currentTodayPriorityActions[Number(followUp.dataset.todayFollowupIndex)]);
        return;
      }

      if (event.target.closest("[data-today-alerts-page]")) {
        activePrimaryPage = "alerts";
        sidebarActionOverride = null;
        renderDashboard();
        syncTopLevelRoute("/alerts");
        scrollToSection("alertsManagementSection");
        return;
      }

      const alert = event.target.closest("[data-today-alert-site-id]");
      if (!alert) return;
      openZoneDetail(alert.dataset.todayAlertSiteId, alert.dataset.todayAlertZoneId);
    });

    elements.alertsManagementSection.addEventListener("click", (event) => {
      const filterButton = event.target.closest("[data-alert-page-filter]");
      if (filterButton) {
        activeAlertsPageFilter = filterButton.dataset.alertPageFilter || "active";
        renderDashboard();
        return;
      }

      const historyButton = event.target.closest("[data-alert-history]");
      if (historyButton) {
        const record = currentAlertRecords.find((item) => item.id === historyButton.dataset.alertHistory);
        if (record) openAlertHistory(record);
        return;
      }

      const actionButton = event.target.closest("[data-alert-action]");
      if (!actionButton) return;
      const id = actionButton.dataset.alertId;
      const status = actionButton.dataset.alertAction;
      if (!id || !status || !alertActionState[id]) return;
      alertActionState[id] = {
        ...alertActionState[id],
        status,
        updatedAt: new Date().toISOString(),
        updatedBy: "admin@neurocrop.com"
      };
      persistAlertActionState();
      renderDashboard();
    });

    elements.metricsGrid.addEventListener("click", (event) => {
      const expandButton = event.target.closest("[data-live-reading-expand]");
      if (expandButton) {
        const metricKey = expandButton.dataset.liveReadingExpand;
        expandedLiveMetricKey = expandedLiveMetricKey === metricKey ? "" : metricKey;
        renderDashboard();
        return;
      }

      const nodeButton = event.target.closest('[data-triage-action="nodes"]');
      if (nodeButton) {
        runDashboardAction("nodes");
        return;
      }

      const historyButton = event.target.closest("[data-history-metric]");
      if (historyButton) {
        event.preventDefault();
        openTrendHistory(historyButton.dataset.historyMetric);
        return;
      }

      const lensSwitch = event.target.closest("[data-workbench-switch]");
      if (!lensSwitch) return;

      const nextLensKey = lensSwitch.dataset.workbenchSwitch;
      if (!nextLensKey) return;
      activeWorkbenchLensKey = nextLensKey;
      renderDashboard();
    });

    elements.trendMetricBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-trend-metric]");
      if (!button) return;
      if (button.disabled) return;

      const nextMetricKey = button.dataset.trendMetric;
      if (!nextMetricKey) return;
      const activeKeys = activeTrendMetricKeys.length > 0
        ? [...activeTrendMetricKeys]
        : (activeTrendMetricKey ? [activeTrendMetricKey] : []);
      const existingIndex = activeKeys.indexOf(nextMetricKey);

      if (existingIndex >= 0) {
        if (activeKeys.length === 1) return;
        activeKeys.splice(existingIndex, 1);
      } else if (activeKeys.length >= 2) {
        activeKeys[1] = nextMetricKey;
      } else {
        activeKeys.push(nextMetricKey);
      }

      activeTrendMetricKeys = activeKeys.slice(0, 2);
      activeTrendMetricKey = activeTrendMetricKeys[0] || nextMetricKey;
      renderDashboard();
    });

    elements.trendRangeBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-trend-range]");
      if (!button) return;

      const nextRangeKey = button.dataset.trendRange;
      if (!trendRangeConfig[nextRangeKey] || nextRangeKey === activeTrendRangeKey) return;
      activeTrendRangeKey = nextRangeKey;
      renderDashboard();
    });

    elements.historyLocationTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = elements.historyLocationTrigger.getAttribute("aria-expanded") !== "true";
      closeContextMenus();
      setMenuState(elements.historyLocationTrigger, elements.historyLocationMenu, shouldOpen);
    });

    elements.historyBlockTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = elements.historyBlockTrigger.getAttribute("aria-expanded") !== "true";
      closeContextMenus();
      setMenuState(elements.historyBlockTrigger, elements.historyBlockMenu, shouldOpen);
    });

    elements.historyLocationMenu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-history-site-option]");
      if (!option) return;
      const nextSite = dashboardData.sites.find((item) => item.id === option.dataset.historyOptionId);
      const nextZone = nextSite?.zones?.[0];
      if (!nextSite || !nextZone) return;
      activeSiteId = nextSite.id;
      activeZoneId = nextZone.id;
      activeViewScope = "zone";
      activeTrendMetricKey = "";
      activeTrendMetricKeys = [];
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
    });

    elements.historyBlockMenu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-history-zone-option]");
      if (!option) return;
      const nextZone = getActiveSite()?.zones?.find((item) => item.id === option.dataset.historyOptionId);
      if (!nextZone) return;
      activeZoneId = nextZone.id;
      activeViewScope = "zone";
      activeTrendMetricKey = "";
      activeTrendMetricKeys = [];
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
    });

    elements.trendHistoryChart.addEventListener("pointermove", (event) => {
      const svg = elements.trendHistoryChart.querySelector("svg");
      const tooltip = elements.trendHistoryTooltip;
      if (!svg || !tooltip || currentTrendHistoryPoints.length === 0) return;

      const svgRect = svg.getBoundingClientRect();
      const chartRect = elements.trendHistoryChart.getBoundingClientRect();
      const viewBoxWidth = 980;
      const plotLeft = 88;
      const plotRight = 944;
      const pointerX = ((event.clientX - svgRect.left) / svgRect.width) * viewBoxWidth;
      if (pointerX < plotLeft || pointerX > plotRight) {
        tooltip.hidden = true;
        return;
      }

      const progress = (pointerX - plotLeft) / (plotRight - plotLeft);
      const pointIndex = Math.round(progress * (currentTrendHistoryPoints.length - 1));
      const point = currentTrendHistoryPoints[pointIndex];
      if (!point) return;

      const localX = Math.min(Math.max(event.clientX - chartRect.left, 82), chartRect.width - 82);
      const localY = Math.max(event.clientY - chartRect.top, 58);
      tooltip.innerHTML = Array.isArray(point.items) && point.items.length > 1
        ? `<span class="trend-history-tooltip-time">${escapeHtml(point.time)}</span>${point.items.map((item) => `<span class="trend-history-tooltip-value">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>`).join("")}`
        : `<span class="trend-history-tooltip-value">${escapeHtml(point.value)}</span><span class="trend-history-tooltip-time">${escapeHtml(point.time)}</span>`;
      tooltip.style.left = `${localX}px`;
      tooltip.style.top = `${localY}px`;
      tooltip.hidden = false;
    });

    elements.trendHistoryChart.addEventListener("pointerleave", () => {
      if (elements.trendHistoryTooltip) elements.trendHistoryTooltip.hidden = true;
    });

    elements.globalSystemList.addEventListener("click", (event) => {
      const filterButton = event.target.closest("[data-alert-filter]");
      if (filterButton) {
        event.stopPropagation();
        const nextFilterKey = filterButton.dataset.alertFilter;
        if (!nextFilterKey || nextFilterKey === activeAlertRailFilterKey) return;
        activeAlertRailFilterKey = nextFilterKey;
        renderDashboard();
        return;
      }

      const issueButton = event.target.closest("[data-alert-site-id]");
      if (!issueButton) return;

      event.stopPropagation();
      openZoneDetail(issueButton.dataset.alertSiteId, issueButton.dataset.alertZoneId);
    });

    elements.sensorHealthList.addEventListener("click", (event) => {
      const switchButton = event.target.closest("[data-sensor-health-switch]");
      if (!switchButton) return;

      const nextFilterKey = switchButton.dataset.sensorHealthSwitch;
      if (!nextFilterKey || nextFilterKey === activeSensorHealthFilterKey) return;
      activeSensorHealthFilterKey = nextFilterKey;
      renderDashboard();
    });

    elements.zoneImpactGrid.addEventListener("click", (event) => {
      const routeSwitch = event.target.closest("[data-inspection-route-switch]");
      if (routeSwitch) {
        const nextFilterKey = routeSwitch.dataset.inspectionRouteSwitch;
        if (!nextFilterKey || nextFilterKey === activeInspectionRouteFilterKey) return;
        activeInspectionRouteFilterKey = nextFilterKey;
        renderDashboard();
        return;
      }

      const routeCard = event.target.closest("[data-route-lens]");
      if (!routeCard) return;

      const nextLensKey = routeCard.dataset.routeLens || "all";
      const targetId = routeCard.dataset.routeTarget || "metricsSection";
      if (nextLensKey && nextLensKey !== activeWorkbenchLensKey) {
        activeWorkbenchLensKey = nextLensKey;
        renderDashboard();
      }
      scrollToSection(targetId);
    });

    function handleZoneDrill(event) {
      const card = event.target.closest("[data-zone-drill-id]");
      if (!card) return;

      openZoneDetail(card.dataset.zoneDrillSiteId, card.dataset.zoneDrillId);
    }

    elements.metricsGrid.addEventListener("click", handleZoneDrill);
    elements.zoneImpactGrid.addEventListener("click", handleZoneDrill);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isCommandPaletteOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
        return;
      }

      if (isCommandPaletteOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCommandPalette();
        }
        return;
      }

      if (event.key === "Escape" && isHeaderBatteryDropdownOpen) {
        setHeaderBatteryDropdownOpen(false);
        return;
      }

      if (event.key === "Escape" && isHeaderAccountMenuOpen) {
        setHeaderAccountMenuOpen(false);
        return;
      }

      if (event.key === "Escape" && activeWorkspaceFocus !== "all") {
        event.preventDefault();
        setWorkspaceFocus("all", { scroll: false });
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
      if (isTypingTarget) return;

      if (event.key.toLowerCase() === "r" && manualOverride) {
        event.preventDefault();
        resetManualTest();
        return;
      }

      if (event.key === "0" && activeWorkspaceFocus !== "all") {
        event.preventDefault();
        setWorkspaceFocus("all", { scroll: false });
        return;
      }

      const shortcutAction = actionDeckShortcutMap.get(event.key);
      if (shortcutAction) {
        event.preventDefault();
        executeActionDeckAction(shortcutAction);
      }
    });

    elements.globalSystemCard.addEventListener("click", (event) => {
      if (event.target.closest("[data-global-system-action]")) return;
      if (!globalSystemCollapsed && !event.target.closest("[data-global-system-toggle]")) return;

      globalSystemCollapsed = !globalSystemCollapsed;
      elements.globalSystemCard.dataset.collapsed = globalSystemCollapsed ? "true" : "false";
      elements.globalSystemExpanded.hidden = globalSystemCollapsed;
    });

    elements.zoneImpactActionButton.addEventListener("click", () => {
      if (!zoneImpactAction) return;

      if (zoneImpactAction.type === "open-zone") {
        openZoneDetail(zoneImpactAction.siteId, zoneImpactAction.zoneId);
        return;
      }

      if (zoneImpactAction.type === "open-site") {
        openSiteView(zoneImpactAction.siteId, "zones");
      }
    });

    elements.metricsGrid.addEventListener("input", (event) => {
      const slider = event.target.closest("[data-metric-slider]");
      if (!slider) return;

      const profile = cropProfiles[activeProfileKey];
      const key = slider.dataset.key;
      const zone = getActiveZone();
      if (!(zone.availableMetrics || []).includes(key)) return;
      const definition = profile.metrics[key];
      const nextValue = roundValue(Number(slider.value), definition.decimals);

      currentReadings = {
        ...currentReadings,
        [key]: nextValue
      };
      manualOverride = true;

      const nextResult = evaluateMetric(definition, nextValue);
      const card = slider.closest("[data-metric-card]");
      updateMetricCardElement(card, definition, nextResult);
      const metricGroupKey = getMetricWorkbenchGroup(key).key;
      const requiresWorkbenchReflow = activeWorkbenchLensKey === "focus" || activeWorkbenchLensKey === "coverage";
      const isOutsideSelectedGroup = activeWorkbenchLensKey.startsWith("group-") && activeWorkbenchLensKey !== `group-${metricGroupKey}`;
      renderDashboard({ skipMetricsGrid: !(requiresWorkbenchReflow || isOutsideSelectedGroup) });
    });

    document.addEventListener("click", (event) => {
      const languageButton = event.target.closest("[data-language-option]");
      if (!languageButton) return;
      setInterfaceLanguage(languageButton.dataset.languageOption);
    });

    window.addEventListener("online", updateClientConnectionStatus);
    window.addEventListener("offline", updateClientConnectionStatus);
    document.addEventListener("visibilitychange", updateClientConnectionStatus);
    window.setInterval(updateClientConnectionStatus, 15000);

    renderSiteOptions();
    renderZoneOptions();
    resetCurrentReadingsFromActiveZone();
    resetLocationForm();
    resetBlockForm();
    resetNodeForm();
    const initialDashboardRoute = resolveDashboardRoute(window.location.pathname);
    activePrimaryPage = initialDashboardRoute.page;
    if (initialDashboardRoute.page === "history") {
      setExperienceMode("detailed");
    }
    renderDashboard();
    initializeLoginGate();
