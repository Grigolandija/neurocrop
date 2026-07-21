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
          .map((node) => {
            const numericValue = (value) => value === null || value === undefined || value === "" ? NaN : Number(value);
            const batteryLevel = numericValue(node.level);
            const batteryMv = numericValue(node.batteryMv);
            const rssi = numericValue(node.rssi);
            const snr = numericValue(node.snr);
            const spreadingFactor = numericValue(node.spreadingFactor);
            return {
              id: sanitizeNodeId(node.id),
              name: sanitizeNodeName(node.name) || sanitizeNodeId(node.id),
              level: Number.isFinite(batteryLevel) ? Math.max(0, Math.min(batteryLevel, 100)) : null,
              devEui: sanitizeDevEui(node.devEui),
              active: node.active !== false,
              lastSeen: node.lastSeen || null,
              batteryMv: Number.isFinite(batteryMv) ? batteryMv : null,
              firmwareVersion: String(node.firmwareVersion || "").trim() || null,
              profile: String(node.profile || "").trim() || null,
              rssi: Number.isFinite(rssi) ? rssi : null,
              snr: Number.isFinite(snr) ? snr : null,
              spreadingFactor: Number.isFinite(spreadingFactor) ? spreadingFactor : null,
              sensorPresence: node.sensorPresence && typeof node.sensorPresence === "object" ? node.sensorPresence : null,
              errorFlags: node.errorFlags && typeof node.errorFlags === "object" ? node.errorFlags : null,
              errorCounters: node.errorCounters && typeof node.errorCounters === "object" ? node.errorCounters : null,
              health: node.health && typeof node.health === "object" ? node.health : null
            };
          })
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
      "Daily work": "Kasdienis darbas",
      "System setup": "Sistemos paruošimas",
      "Compare sections": "Palyginti sekcijas",
      "Compare": "Palyginti",
      "Sensor nodes": "Sensorių mazgai",
      "Sites": "Vietos",
      "Site": "Vieta",
      "Zones": "Zonos",
      "Zone": "Zona",
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
      "Inherited from zone": "Paveldėta iš zonos",
      "Select site": "Pasirinkite vietą",
      "Zone and node count": "Zonų ir mazgų skaičius",
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
      "Detail": "Detalė",
      "Target context": "Tikslo kontekstas",
      "away": "iki tikslo",
      "Active": "Aktyvūs",
      "Acknowledged": "Patvirtinti",
      "Snoozed": "Atidėti",
      "Resolved": "Išspręsti",
      "Acknowledge": "Patvirtinti",
      "Snooze": "Atidėti",
      "Resolve": "Išspręsti",
      "Current sites": "Esamos vietos",
      "Current zones": "Esamos zonos",
      "Areas": "Erdvės",
      "Sections": "Sekcijos",
      "Skip to main content": "Pereiti prie pagrindinio turinio",
      "Current areas": "Esamos erdvės",
      "Create your first area": "Sukurkite pirmąją erdvę",
      "Register section": "Registruoti sekciją",
      "Shown sections": "Rodomos sekcijos",
      "Section name": "Sekcijos pavadinimas",
      "No sections in this area": "Šioje erdvėje sekcijų nėra",
      "Current nodes": "Esami mazgai",
      "Filter by Site": "Filtruoti pagal vietą",
      "Filter by Zone": "Filtruoti pagal zoną",
      "All Sites": "Visos vietos",
      "All Zones": "Visos zonos",
      "No low-battery nodes in this view": "Šiame vaizde nėra mazgų su silpna baterija",
      "No nodes match these filters.": "Nė vienas mazgas neatitinka pasirinktų filtrų.",
      "Choose another Site or Zone to see its nodes.": "Pasirinkite kitą vietą arba zoną, kad pamatytumėte jos mazgus.",
      "Active alerts": "Aktyvūs perspėjimai",
      "Low battery": "Silpna baterija",
      "Shown zones": "Rodomos zonos",
      "Register site": "Registruoti vietą",
      "Register zone": "Registruoti zoną",
      "Register node": "Registruoti mazgą",
      "Create site": "Sukurti vietą",
      "Edit site": "Redaguoti vietą",
      "Save site": "Išsaugoti vietą",
      "Site name": "Vietos pavadinimas",
      "Create zone": "Sukurti zoną",
      "Edit zone": "Redaguoti zoną",
      "Save zone": "Išsaugoti zoną",
      "Zone name": "Zonos pavadinimas",
      "Connect a sensor to a zone": "Prijungti sensorių prie zonos",
      "All sites are stable": "Visos vietos stabilios",
      "Stable zones": "Stabilios zonos",
      "Warning zones": "Įspėjimo zonos",
      "Critical zones": "Kritinės zonos",
      "Showing the most urgent zones across the full system.": "Rodomos svarbiausios zonos visoje sistemoje.",
      "Change the site or zone when you want to inspect another place.": "Keiskite vietą arba zoną, kai norite peržiūrėti kitą objektą.",
      "Zone average · target band and recent trend": "Zonos vidurkis · tikslinės ribos ir naujausia tendencija",
      "Battery status by zone": "Baterijų būsena pagal zonas",
      "Search actions, sites, zones, or pages": "Ieškokite veiksmų, vietų, zonų ar puslapių",
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
      "Security": "Saugumas",
      "Change password": "Keisti slaptažodį",
      "Use at least 12 characters. Other signed-in devices will be signed out.": "Naudokite bent 12 simbolių. Kituose įrenginiuose paskyra bus atjungta.",
      "Current password": "Dabartinis slaptažodis",
      "New password": "Naujas slaptažodis",
      "Confirm new password": "Pakartokite naują slaptažodį",
      "Enter your current password": "Įveskite dabartinį slaptažodį",
      "At least 12 characters": "Bent 12 simbolių",
      "Repeat the new password": "Pakartokite naują slaptažodį",
      "Password changed. Other signed-in devices were signed out.": "Slaptažodis pakeistas. Kituose įrenginiuose paskyra atjungta.",
      "Enter your current password and a new password.": "Įveskite dabartinį ir naują slaptažodžius.",
      "The new password must contain at least 12 characters.": "Naujas slaptažodis turi būti bent 12 simbolių ilgio.",
      "The new passwords do not match.": "Nauji slaptažodžiai nesutampa.",
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
      document.querySelectorAll("[data-language-select]").forEach((select) => {
        select.value = interfaceLanguage;
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
      critical: { label: "Critical", shortLabel: "Critical", badge: "Red section", textClass: "text-ember", thumb: "#AF4D38", uplink: "11 min ago" },
      neutral: { label: "No data", shortLabel: "No data", badge: "No data", textClass: "text-ink/55", thumb: "#A0A59F", uplink: "Unavailable" },
      unknown: { label: "No data", shortLabel: "No data", badge: "No data", textClass: "text-ink/55", thumb: "#A0A59F", uplink: "Unavailable" }
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
    const cropProfileKeyAliases = {
      default: "default",
      numatytasis: "default",
      "tomatoes-vegetative": "tomato",
      "lettuce-intensive": "lettuce",
      "strawberries-fruiting": "strawberry"
    };

    cropProfiles.default = {
      ...JSON.parse(JSON.stringify(cropProfiles.tomato)),
      id: "default",
      name: "Default / Numatytasis",
      heroName: "Default",
      stage: "Default",
      hint: "Universal starter profile. Review target ranges before assigning it to production sections.",
      requiresReview: false
    };

    // Custom profiles are kept separately from the built-in templates so they
    // survive reloads now and can later map cleanly to backend profile records.
    const cropProfilesStorageKey = "neurocrop-dashboard-crop-profiles-v1";
    const cropProfileOverridesStorageKey = "neurocrop-dashboard-crop-profile-overrides-v1";
    const builtInCropProfileKeys = new Set(Object.keys(cropProfiles));
    const legacyStarterCropProfileKeys = new Set(["tomato", "lettuce", "strawberry"]);
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

    function normalizeCropProfileKey(profileKey) {
      const normalized = String(profileKey || "").trim();
      return cropProfileKeyAliases[normalized] || normalized;
    }

    function getDefaultCropProfileTemplate() {
      return cropProfiles.default || cropProfiles.tomato || Object.values(cropProfiles)[0] || { metrics: {} };
    }

    function getCompleteCropProfileMetrics(metrics = {}) {
      const completeMetrics = cloneDashboardValue(getDefaultCropProfileTemplate().metrics || {});
      Object.entries(metrics || {}).forEach(([metricKey, metric]) => {
        if (!metric || typeof metric !== "object") return;
        completeMetrics[metricKey] = {
          ...(completeMetrics[metricKey] || {}),
          ...cloneDashboardValue(metric)
        };
        ["optimal", "warning", "critical", "displayRange"].forEach((rangeKey) => {
          if (Array.isArray(metric[rangeKey])) completeMetrics[metricKey][rangeKey] = cloneDashboardValue(metric[rangeKey]);
        });
      });
      return completeMetrics;
    }

    function getCompleteCropProfile(profile = {}) {
      return {
        ...cloneDashboardValue(getDefaultCropProfileTemplate()),
        ...cloneDashboardValue(profile),
        metrics: getCompleteCropProfileMetrics(profile.metrics || {})
      };
    }

    function isVisibleSettingsCropProfile(profileKey) {
      return !(isApiDataMode() && legacyStarterCropProfileKeys.has(profileKey));
    }

    function getVisibleCropProfileEntries() {
      return Object.entries(cropProfiles).filter(([profileKey]) => isVisibleSettingsCropProfile(profileKey));
    }

    function applyApiCropProfiles(payload) {
      const apiProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
      Object.keys(cropProfiles).forEach((profileKey) => {
        if (!builtInCropProfileKeys.has(profileKey)) delete cropProfiles[profileKey];
      });

      apiProfiles.forEach((profile) => {
        const profileId = normalizeCropProfileKey(profile?.id || profile?.key || profile?.slug);
        if (!profileId || !profile?.metrics || typeof profile.metrics !== "object") return;
        cropProfiles[profileId] = {
          ...getCompleteCropProfile(cropProfiles[profileId] || {}),
          id: profileId,
          name: String(profile.name || cropProfiles[profileId]?.name || profileId),
          heroName: String(profile.heroName || profile.hero_name || cropProfiles[profileId]?.heroName || profile.name || profileId),
          stage: String(profile.stage || profile.growthStage || profile.growth_stage || cropProfiles[profileId]?.stage || ""),
          hint: String(profile.hint || cropProfiles[profileId]?.hint || ""),
          requiresReview: Boolean(profile.requiresReview ?? profile.requires_review ?? false),
          metrics: getCompleteCropProfileMetrics(profile.metrics)
        };
      });
    }

    async function hydrateCropProfilesFromApi(shouldApply = () => true) {
      if (!window.NeuroCropApi?.isConnected?.() || !window.NeuroCropApi?.getCropProfiles) return null;
      try {
        const response = await window.NeuroCropApi.getCropProfiles();
        if (!shouldApply()) return null;
        applyApiCropProfiles(response);
        return response;
      } catch (error) {
        console.warn("NeuroCrop API crop profiles load failed.", error);
        return null;
      }
    }

    function loadCustomCropProfiles() {
      if (window.NeuroCropApi?.isConnected?.()) return;
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
      if (window.NeuroCropApi?.isConnected?.()) return;
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
      if (window.NeuroCropApi?.isConnected?.()) return;
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
      if (window.NeuroCropApi?.isConnected?.()) return;
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

    let dashboardData = { sites: [], note: "Waiting for API dashboard data." };

    if (!window.NeuroCropApi?.isConnected?.() && window.NeuroCropStore) {
      dashboardData = window.NeuroCropStore.getDashboardData();
    }

    const elements = {
      loginScreen: document.getElementById("loginScreen"),
      dashboardShell: document.getElementById("dashboardShell"),
      loginForm: document.getElementById("loginForm"),
      loginEmail: document.getElementById("loginEmail"),
      loginPassword: document.getElementById("loginPassword"),
      loginSubmit: document.getElementById("loginSubmit"),
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
      trendHistoryExportButton: document.getElementById("trendHistoryExportButton"),
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
      trendPresentationBar: document.getElementById("trendPresentationBar"),
      trendScaleBar: document.getElementById("trendScaleBar"),
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
      trendAnalyticsPanel: document.getElementById("trendAnalyticsPanel"),
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

    function normalizeLoginSession(session) {
      if (!session || !session.email) return null;
      return {
        ...session,
        isPlatformAdmin: session.isPlatformAdmin === true,
        isSuperAdmin: session.isSuperAdmin === true
      };
    }

    function persistLoginSession(session) {
      const normalized = normalizeLoginSession(session);
      if (normalized) {
        window.sessionStorage.setItem(loginSessionKey, JSON.stringify(normalized));
      } else {
        window.sessionStorage.removeItem(loginSessionKey);
      }
      return normalized;
    }

    function setLoginState(session, options = {}) {
      const normalizedSession = normalizeLoginSession(session);
      const signedIn = Boolean(normalizedSession?.email);
      elements.loginScreen.hidden = signedIn;
      elements.dashboardShell.hidden = !signedIn;
      if (signedIn) {
        unauthorizedStateHandled = false;
        elements.headerAccountEmail.textContent = normalizedSession.email;
        if (options.resetWorkspace === true) resetWorkspaceForNewLogin();
        if (!normalizedSession.isPlatformAdmin && activePrimaryPage === "admin") {
          activePrimaryPage = "overview";
          activeSettingsPanelKey = "profiles";
          syncTopLevelRoute("/", { replace: true });
        }
        if (options.resetWorkspace !== true) restoreActiveContextForSession(normalizedSession);
        updateSidebarActionState();
        window.requestAnimationFrame(syncStickyOffsets);
        hydrateDashboardFromApi();
      } else {
        updateSidebarActionState();
      }
    }

    async function hydrateDashboardFromApi(options = {}) {
      const { preserveCurrentOnError = false, silent = false } = options;
      if (!window.NeuroCropApi?.isConnected()) return;
      const organizationId = getLoginSession()?.organizationId || "";
      if (dashboardHydrationInFlight && dashboardHydrationOrganizationId === organizationId) return;
      const hasCurrentWorkspace = Array.isArray(dashboardData.sites) && dashboardData.sites.length > 0;
      if (!hasCurrentWorkspace) {
        dashboardHydrationStatus = "loading";
        if (!silent) renderDashboard();
      }
      dashboardHydrationInFlight = true;
      const requestId = ++dashboardHydrationRequestId;
      dashboardHydrationOrganizationId = organizationId;
      dashboardHydrationInFlightRequestId = requestId;
      const isCurrentRequest = () => requestId === dashboardHydrationRequestId
        && organizationId === (getLoginSession()?.organizationId || "");
      if (!silent) elements.dashboardShell.setAttribute("aria-busy", "true");
      try {
        await hydrateCropProfilesFromApi(isCurrentRequest);
        if (!isCurrentRequest()) return;
        const nextDashboardData = await window.NeuroCropApi.getDashboard();
        if (!isCurrentRequest()) return;
        if (!nextDashboardData || !Array.isArray(nextDashboardData.sites) || nextDashboardData.sites.length === 0) {
          dashboardHydrationStatus = "empty";
          dashboardData = { sites: [], note: "API returned no dashboard structure." };
          currentReadings = {};
          lastDashboardHydratedAt = Date.now();
          renderDashboard();
          return;
        }
        dashboardData = normalizeApiDashboardData(nextDashboardData);
        dashboardHydrationStatus = dashboardData.sites.length > 0 ? "ready" : "empty";
        if (selectPriorityContextAfterLogin) {
          selectPriorityContextAfterLogin = false;
          selectLowestScoreContext();
        }
        const { site: nextSite, zone: nextZone } = normalizeActiveSelection();
        if (!nextSite) {
          currentReadings = {};
          renderDashboard();
          return;
        }
        persistActiveContext();
        renderSiteOptions();
        renderZoneOptions();
        if (!nextZone) {
          currentReadings = {};
          renderDashboard();
          return;
        }
        const [latestReadings, todayActionsResponse, actionHistoryResponse] = await Promise.all([
          fetchLatestReadingsForZone(nextZone.id, {
            onlyActive: false,
            renderOnComplete: false
          }),
          window.NeuroCropApi.getTodayActions().catch((error) => {
            console.warn("NeuroCrop API today actions load failed; using the local fallback.", error);
            return null;
          }),
          window.NeuroCropApi.getActionHistory(12).catch((error) => {
            console.warn("NeuroCrop API action history load failed.", error);
            return null;
          })
        ]);
        if (!isCurrentRequest() || nextZone.id !== getActiveZone()?.id) return;
        if (Array.isArray(todayActionsResponse?.actions)) backendTodayActions = todayActionsResponse.actions;
        if (Array.isArray(actionHistoryResponse?.items)) backendActionHistory = actionHistoryResponse.items;
        currentReadings = latestReadings ? readingsFromApiObservations(latestReadings) : {};
        manualOverride = false;
        dashboardHydrationStatus = "ready";
        lastDashboardHydratedAt = Date.now();
        renderDashboard();
      } catch (error) {
        console.warn("NeuroCrop API dashboard load failed.", error);
        if (isCurrentRequest()) {
          const hasUsableWorkspace = Array.isArray(dashboardData.sites) && dashboardData.sites.length > 0;
          dashboardHydrationStatus = hasUsableWorkspace ? "ready" : "error";
          if (!preserveCurrentOnError || !hasUsableWorkspace) {
            if (!hasUsableWorkspace) {
              dashboardData = { sites: [], note: "API dashboard load failed." };
              currentReadings = {};
            }
            renderDashboard();
          }
        }
      } finally {
        if (dashboardHydrationInFlightRequestId === requestId) {
          dashboardHydrationInFlight = false;
          dashboardHydrationOrganizationId = "";
        }
        if (!silent) elements.dashboardShell.removeAttribute("aria-busy");
      }
    }

    function refreshLiveDashboardData() {
      const livePage = ["overview", "readings", "history", "alerts"].includes(activePrimaryPage);
      const signedIn = Boolean(getLoginSession()?.email);
      if (document.hidden || !signedIn || !livePage || !isApiDataMode()) return;
      hydrateDashboardFromApi({ preserveCurrentOnError: true, silent: true });
    }

    function refreshDataForActivePage() {
      const dataPage = ["overview", "readings", "history"].includes(activePrimaryPage);
      const signedIn = Boolean(getLoginSession()?.email);
      const isStale = Date.now() - lastDashboardHydratedAt >= dashboardRefreshTtlMs;
      if (!dataPage || !signedIn || !isApiDataMode() || !isStale) return;
      hydrateDashboardFromApi({ preserveCurrentOnError: true, silent: true });
    }

    async function initializeLoginGate() {
      if (window.NeuroCropApi?.isConnected()) {
        try {
          const response = await window.NeuroCropApi.getCurrentUser();
          const session = normalizeLoginSession(response?.user || { email: "" });
          if (!session.email) throw new Error("Authenticated user email is missing.");
          persistLoginSession(session);
          // Opening an authenticated workspace is a new entry point: always begin
          // on Overview with the backend-selected priority zone, never a stale site scope.
          setLoginState(session, { resetWorkspace: true });
          return;
        } catch (error) {
          window.sessionStorage.removeItem(loginSessionKey);
          resetTeamAccessState();
          resetPlatformOrganizationState();
          setLoginState(null);
          elements.loginError.hidden = true;
          elements.loginEmail.focus();
          return;
        }
      }

      const session = normalizeLoginSession(getLoginSession());
      persistLoginSession(session);
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
        resetTeamAccessState();
        resetPlatformOrganizationState();
        setHeaderAccountMenuOpen(false);
        setLoginState(null);
        elements.loginPassword.value = "";
        elements.loginError.hidden = true;
        elements.loginEmail.focus();
      }
    }

    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (elements.loginSubmit.disabled) return;
      const email = elements.loginEmail.value.trim();
      const password = elements.loginPassword.value;
      if (!elements.loginEmail.validity.valid || password.length < 4) {
        elements.loginError.textContent = diagnosticText(
          "Enter a valid email address and a password of at least 4 characters.",
          "Įveskite teisingą el. pašto adresą ir bent 4 simbolių slaptažodį."
        );
        elements.loginError.hidden = false;
        return;
      }

      let session = { email };
      elements.loginError.hidden = true;
      elements.loginSubmit.disabled = true;
      if (window.NeuroCropApi?.isConnected()) {
        try {
          const response = await window.NeuroCropApi.login(email, password);
          session = normalizeLoginSession(response?.user || { email });
        } catch (error) {
          const message = String(error?.message || "");
          elements.loginError.textContent = message.includes("Too many login attempts")
            ? diagnosticText(
                "Too many sign-in attempts. Wait 15 minutes before trying again.",
                "Per daug prisijungimo bandymų. Prieš bandydami dar kartą palaukite 15 minučių."
              )
            : diagnosticText(
                "We could not sign you in. Check your email and password, then try again.",
                "Prisijungti nepavyko. Patikrinkite el. paštą ir slaptažodį, tada bandykite dar kartą."
              );
          elements.loginError.hidden = false;
          elements.loginSubmit.disabled = false;
          return;
        }
      }

      session = persistLoginSession(session);
      resetTeamAccessState();
      resetPlatformOrganizationState();
      elements.loginError.hidden = true;
      setLoginState(session, { resetWorkspace: true });
      syncStickyOffsets();
      elements.loginSubmit.disabled = false;
    });
    elements.loginSubmit.disabled = false;

    const activeContextStorageKey = "neurocrop-active-context-v1";

    function getActiveContextScopeKey(session = getLoginSession()) {
      if (session?.organizationId) return `org:${session.organizationId}`;
      if (session?.email) return `user:${session.email}`;
      return "anonymous";
    }

    function readActiveContextStore() {
      try {
        return JSON.parse(window.localStorage.getItem(activeContextStorageKey) || "null") || {};
      } catch {
        return {};
      }
    }

    function loadActiveContext(session = getLoginSession()) {
      const stored = readActiveContextStore();
      const scopeKey = getActiveContextScopeKey(session);
      const scoped = stored?.contexts?.[scopeKey];
      const legacy = stored && !stored.contexts ? stored : null;
      const context = scoped || legacy || {};
      return {
        siteId: typeof context?.siteId === "string" ? context.siteId : "",
        zoneId: typeof context?.zoneId === "string" ? context.zoneId : ""
      };
    }

    function persistActiveContext() {
      try {
        const stored = readActiveContextStore();
        const scopeKey = getActiveContextScopeKey();
        const contexts = stored.contexts && typeof stored.contexts === "object" ? stored.contexts : {};
        contexts[scopeKey] = {
          siteId: activeSiteId,
          zoneId: activeZoneId
        };
        window.localStorage.setItem(activeContextStorageKey, JSON.stringify({
          version: 2,
          lastScopeKey: scopeKey,
          contexts
        }));
      } catch {
        // Context persistence is optional when browser storage is unavailable.
      }
    }

    function restoreActiveContextForSession(session = getLoginSession()) {
      const context = loadActiveContext(session);
      if (context.siteId) activeSiteId = context.siteId;
      if (context.zoneId) activeZoneId = context.zoneId;
    }

    function resetWorkspaceForNewLogin() {
      activePrimaryPage = "overview";
      activeViewScope = "zone";
      activeSiteDetailView = "averages";
      activeWorkspaceFocus = "all";
      activeWorkbenchLensKey = "all";
      activeSiteId = "";
      activeZoneId = "";
      if (isApiDataMode()) dashboardData = { sites: [], note: "Waiting for API dashboard data." };
      dashboardHydrationStatus = "idle";
      currentReadings = {};
      manualOverride = false;
      latestReadingsBySectionId = {};
      latestReadingsStatusBySectionId = {};
      latestReadingsRequestIdBySectionId = {};
      latestReadingsAreaInFlight.clear();
      backendTodayActions = null;
      backendActionHistory = [];
      todayPriorityFeedbackState = { actionId: "", saving: false, error: false, message: "" };
      resetTrendSelectionForContextChange();
      syncTopLevelRoute("/", { replace: true });
      selectPriorityContextAfterLogin = true;
    }

    const savedActiveContext = loadActiveContext();
    let activeSiteId = savedActiveContext.siteId || "greenhouse-1";
    let activeZoneId = savedActiveContext.zoneId || "tomato-a-back";
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
    let activeTrendMetricKey = "";
    let activeTrendMetricKeys = [];
    let activeTrendRangeKey = "24h";
    let activeTrendPresentation = "smoothed";
    let activeTrendScaleMode = "detail";
    let expandedLiveMetricKey = "";
    let currentTrendHistoryPoints = [];
    let trendHistoryChartInstance = null;
    let trendComparisonChartInstance = null;
    let trendHistoryRequestId = 0;
    let trendHistoryByKey = {};
    let trendHistoryStatusByKey = {};
    let trendAnalyticsByKey = {};
    let trendAnalyticsStatusByKey = {};
    let trendComparisonByKey = {};
    let trendComparisonStatusByKey = {};
    let dynamicsBySectionId = {};
    let dynamicsStatusBySectionId = {};
    let trendComparisonZoneIds = [];
    const trendHistoryCacheTtlMs = 60 * 1000;
    const trendHistoryRetryDelayMs = 10 * 1000;
    let latestReadingsRequestIdBySectionId = {};
    let latestReadingsBySectionId = {};
    let latestReadingsStatusBySectionId = {};
    const latestReadingsCacheTtlMs = 60 * 1000;
    const latestReadingsRetryDelayMs = 10 * 1000;
    const latestReadingsAreaInFlight = new Set();
    let backendTodayActions = null;
    let backendActionHistory = [];
    let todayPriorityFeedbackState = { actionId: "", saving: false, error: false, message: "" };
    let dashboardHydrationRequestId = 0;
    let dashboardHydrationInFlight = false;
    let dashboardHydrationOrganizationId = "";
    let dashboardHydrationInFlightRequestId = 0;
    let dashboardHydrationStatus = isApiDataMode() ? "idle" : "ready";
    let lastDashboardHydratedAt = 0;
    const dashboardRefreshTtlMs = 60 * 1000;
    const dashboardRefreshIntervalMs = 60 * 1000;
    let unauthorizedStateHandled = false;
    let selectPriorityContextAfterLogin = false;
    let activeBlockFilterSiteId = "all";
    let activeNodeFilterSiteId = "all";
    let activeNodeFilterZoneId = "all";
    let activeNodeStateFilter = "all";
    let activeNodeSearchQuery = "";
    let activeNodeDetailId = null;
    let expandedCropProfileMetricId = null;
    let activeSettingsProfileKey = activeProfileKey;
    let activeSettingsPanelKey = "profiles";
    let settingsProfileEditorDrafts = {};
    let profileSaveFeedback = { profileKey: "", profileName: "", tone: "optimal" };
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
      settings: { page: "settings", route: "/settings" },
      admin: { page: "admin", route: "/admin" },
      "crop-profiles": { page: "settings", route: "/crop-profiles" }
    };
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
    let teamAccessState = {
      members: [],
      invitations: [],
      status: "idle",
      error: "",
      latestInviteUrl: "",
      latestInviteEmailSent: false
    };
    let platformOrganizationState = {
      organizations: [],
      users: [],
      organizationRequests: [],
      status: "idle",
      error: "",
      latestInviteUrl: "",
      latestInviteEmailSent: false,
      latestInviteEmail: "",
      latestOrganizationName: "",
      nodeDiagnostics: { organizationId: "", organizationName: "", nodes: [], status: "idle", error: "" }
    };

    function resetTeamAccessState() {
      teamAccessState = {
        members: [],
        invitations: [],
        status: "idle",
        error: "",
        latestInviteUrl: "",
        latestInviteEmailSent: false
      };
    }

    function resetPlatformOrganizationState() {
      platformOrganizationState = {
        organizations: [],
        users: [],
        organizationRequests: [],
        status: "idle",
        error: "",
        latestInviteUrl: "",
        latestInviteEmailSent: false,
        latestInviteEmail: "",
        latestOrganizationName: "",
        nodeDiagnostics: { organizationId: "", organizationName: "", nodes: [], status: "idle", error: "" }
      };
    }

    async function hydrateTeamAccess() {
      if (!window.NeuroCropApi?.isConnected() || teamAccessState.status === "loading") return;
      teamAccessState.status = "loading";
      teamAccessState.error = "";
      renderDashboard();
      try {
        const teamResponse = await window.NeuroCropApi.getTeam();
        let invitationResponse = { invitations: [] };
        try {
          invitationResponse = await window.NeuroCropApi.getInvitations();
        } catch (error) {
          invitationResponse = { invitations: [] };
        }
        teamAccessState.members = Array.isArray(teamResponse?.members) ? teamResponse.members : [];
        teamAccessState.invitations = Array.isArray(invitationResponse?.invitations) ? invitationResponse.invitations : [];
        teamAccessState.status = "ready";
      } catch (error) {
        teamAccessState.status = "error";
        teamAccessState.error = error?.message || "Team access could not be loaded.";
      }
      renderDashboard();
    }

    function hasOrganizationFaultCount(value) {
      return value !== null && value !== undefined && Number.isFinite(Number(value));
    }

    async function hydratePlatformOrganizations() {
      if (!window.NeuroCropApi?.isConnected() || platformOrganizationState.status === "loading") return;
      const session = getLoginSession();
      if (!session?.isPlatformAdmin) return;
      platformOrganizationState.status = "loading";
      platformOrganizationState.error = "";
      renderDashboard();
      try {
        const [response, userResponse, requestResponse] = await Promise.all([
          window.NeuroCropApi.getPlatformOrganizations(),
          window.NeuroCropApi.getPlatformUsers(),
          window.NeuroCropApi.getOrganizationRequests("pending")
        ]);
        const organizations = Array.isArray(response?.organizations) ? response.organizations : [];
        const organizationsMissingFaultCounts = organizations.filter((organization) => !hasOrganizationFaultCount(organization.faultNodeCount));
        const fallbackFaultCounts = await Promise.all(organizationsMissingFaultCounts.map(async (organization) => {
          try {
            const diagnostics = await window.NeuroCropApi.getPlatformOrganizationNodes(organization.id);
            const nodes = Array.isArray(diagnostics?.nodes) ? diagnostics.nodes : [];
            return [organization.id, nodes.filter((node) => Object.values(node.errorFlags || {}).some(Boolean)).length];
          } catch {
            return [organization.id, null];
          }
        }));
        const fallbackFaultCountByOrganization = new Map(fallbackFaultCounts);
        platformOrganizationState.organizations = organizations.map((organization) => ({
          ...organization,
          faultNodeCount: hasOrganizationFaultCount(organization.faultNodeCount)
            ? Number(organization.faultNodeCount)
            : fallbackFaultCountByOrganization.get(organization.id)
        }));
        platformOrganizationState.users = Array.isArray(userResponse?.users) ? userResponse.users : [];
        platformOrganizationState.organizationRequests = Array.isArray(requestResponse?.requests) ? requestResponse.requests : [];
        platformOrganizationState.status = "ready";
      } catch (error) {
        platformOrganizationState.status = "error";
        platformOrganizationState.error = error?.message || "Customer organizations could not be loaded.";
      }
      renderDashboard();
    }

    async function hydratePlatformNodeDiagnostics(organizationId, organizationName) {
      if (!window.NeuroCropApi?.isConnected() || !getLoginSession()?.isPlatformAdmin) return;
      const current = platformOrganizationState.nodeDiagnostics;
      if (current.status === "loading" && current.organizationId === organizationId) return;
      platformOrganizationState.nodeDiagnostics = {
        organizationId,
        organizationName,
        nodes: [],
        status: "loading",
        error: ""
      };
      renderDashboard();
      try {
        const response = await window.NeuroCropApi.getPlatformOrganizationNodes(organizationId);
        platformOrganizationState.nodeDiagnostics = {
          organizationId,
          organizationName,
          nodes: Array.isArray(response?.nodes) ? response.nodes : [],
          status: "ready",
          error: ""
        };
      } catch (error) {
        platformOrganizationState.nodeDiagnostics = {
          organizationId,
          organizationName,
          nodes: [],
          status: "error",
          error: error?.message || "Node diagnostics could not be loaded."
        };
      }
      renderDashboard();
    }
    const scenarioPresetButtons = [...document.querySelectorAll("[data-scenario-preset]")];
    const sidebarActionButtons = [...document.querySelectorAll("[data-sidebar-action]")];
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
        .replace(/^\/+/, "");
      const nodeDetailMatch = normalizedValue.match(/^nodes\/([^/]+)$/i);
      if (nodeDetailMatch) {
        return {
          page: "nodes",
          route: `/${normalizedValue}`,
          nodeId: decodeURIComponent(nodeDetailMatch[1])
        };
      }
      return dashboardRouteMap[normalizedValue.toLowerCase()] || dashboardRouteMap.overview;
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
      const pageAlreadyActive = nextRoute.page === activePrimaryPage
        && (nextRoute.page !== "nodes" || (nextRoute.nodeId || null) === activeNodeDetailId);

      if (nextRoute.page === "admin" && !getLoginSession()?.isPlatformAdmin) {
        activePrimaryPage = "overview";
        syncTopLevelRoute("/", { replace: true });
        return;
      }

      activePrimaryPage = nextRoute.page;
      activeNodeDetailId = activePrimaryPage === "nodes" ? nextRoute.nodeId || null : null;
      if (activePrimaryPage === "admin") activeSettingsPanelKey = "platform";
      if (activePrimaryPage === "blocks") syncBlocksManagementContext();
      if (activePrimaryPage === "settings" && !pageAlreadyActive && cropProfiles[activeProfileKey]) {
        activeSettingsProfileKey = activeProfileKey;
      }
      sidebarActionOverride = null;
      closeContextMenus();

      if (activePrimaryPage === "history" || activePrimaryPage === "readings") {
        activeViewScope = activePrimaryPage === "readings" ? "site" : "zone";
        activeWorkspaceFocus = "all";
        if (activePrimaryPage === "readings") activeWorkbenchLensKey = "essential";
        setExperienceMode("detailed", { render: false, force: true });
      }

      if (pageAlreadyActive && activePrimaryPage !== "history" && activePrimaryPage !== "readings") {
        refreshDataForActivePage();
        return;
      }

      renderDashboard();
      if (activePrimaryPage === "readings") fetchLatestReadingsForArea(getActiveSite()?.id);
      refreshDataForActivePage();

      const targetByPage = {
        overview: "heroStatusPanel",
        locations: "locationsManagementSection",
        blocks: "blocksManagementSection",
        nodes: "nodesManagementSection",
        readings: "metricsSection",
        history: "historySection",
        settings: "settingsManagementSection",
        admin: "settingsManagementSection"
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

    function getTrendDecimalPlaces(definition, metricKey) {
      if (["airTemp", "humidity"].includes(metricKey)) return Math.max(2, Number(definition.decimals) || 0);
      return Number(definition.decimals) || 0;
    }

    function formatTrendValue(value, definition, metricKey) {
      return `${formatNumber(value, getTrendDecimalPlaces(definition, metricKey))} ${formatUnit(definition.unit)}`;
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

    function persistDashboardData(nextData, options = {}) {
      if (isApiDataMode()) {
        const noticePage = activePrimaryPage === "locations"
          ? "locations"
          : activePrimaryPage === "blocks"
            ? "blocks"
            : "settings";
        setManagementNotice(noticePage, "Structure editing is API-only now. Backend CRUD endpoints are required before saving changes.", "warning");
        return dashboardData;
      }

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

    // The Zones workspace follows the Site selected in the global header.
    // Keeping a separate stale filter here made the page show another site's data.
    function syncBlocksManagementContext() {
      const site = getActiveSite();
      if (!site) return;
      activeBlockFilterSiteId = site.id;
      if (blockFormState.mode === "create") blockFormState.siteId = site.id;
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

    function getActionExecutionTypeLabel(type) {
      return {
        ventilation_increased: diagnosticText("Increased ventilation", "Padidintas vėdinimas"),
        ventilation_reduced: diagnosticText("Reduced ventilation", "Sumažintas vėdinimas"),
        vents_opened: diagnosticText("Opened vents or doors", "Atidarytos orlaidės arba durys"),
        heating_increased: diagnosticText("Increased heating", "Padidintas šildymas"),
        heating_reduced: diagnosticText("Reduced heating", "Sumažintas šildymas"),
        cooling_increased: diagnosticText("Increased cooling", "Padidintas vėsinimas"),
        cooling_reduced: diagnosticText("Reduced cooling", "Sumažintas vėsinimas"),
        humidification_increased: diagnosticText("Increased humidification", "Padidintas drėkinimas"),
        humidification_reduced: diagnosticText("Reduced humidification", "Sumažintas drėkinimas"),
        irrigation_adjusted: diagnosticText("Adjusted irrigation", "Pakoreguotas laistymas"),
        shading_adjusted: diagnosticText("Adjusted shading", "Pakoreguotas šešėliavimas"),
        equipment_checked: diagnosticText("Checked equipment", "Patikrinta įranga"),
        other: diagnosticText("Other action", "Kitas veiksmas")
      }[type] || diagnosticText("Other action", "Kitas veiksmas");
    }

    function getActionExecutionTypes(action) {
      const climateTypes = [
        "ventilation_increased", "ventilation_reduced", "vents_opened",
        "heating_increased", "heating_reduced", "cooling_increased", "cooling_reduced",
        "humidification_increased", "humidification_reduced", "shading_adjusted"
      ];
      const rootZoneTypes = ["irrigation_adjusted", "equipment_checked"];
      const metricTypes = ["soilTemp", "soilMoisture", "ec", "ph", "soilEc", "waterTemp"].includes(action?.metricId)
        ? rootZoneTypes
        : climateTypes;
      return [...metricTypes, "equipment_checked", "other"].filter((type, index, values) => values.indexOf(type) === index);
    }

    function openActionCompletionModal(action) {
      if (!action) return;
      managementModalState = { type: "action-completion", action };
      const typeOptions = getActionExecutionTypes(action)
        .map((type) => `<option value="${escapeAttribute(type)}">${escapeHtml(getActionExecutionTypeLabel(type))}</option>`)
        .join("");
      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop" data-management-modal-close></div>
        <section class="management-modal-shell action-completion-modal" role="dialog" aria-modal="true" aria-labelledby="actionCompletionTitle">
          <header class="management-modal-header">
            <div>
              <span class="action-completion-eyebrow">${diagnosticText("Record completed action", "Užregistruoti atliktą veiksmą")}</span>
              <h2 id="actionCompletionTitle">${escapeHtml(action.title || diagnosticText("Completed action", "Atliktas veiksmas"))}</h2>
              <p>${diagnosticText("Tell us what actually changed so sensor results can be linked to the right intervention.", "Nurodykite, kas realiai pakeista, kad sensorių rezultatą galėtume susieti su tinkamu veiksmu.")}</p>
            </div>
            <button type="button" class="management-modal-close" data-management-modal-close aria-label="${diagnosticText("Close", "Uždaryti")}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <form class="management-modal-body action-completion-form" data-management-modal-form="action-completion">
            <label class="action-completion-field">
              <span>${diagnosticText("What did you do?", "Ką padarėte?")} *</span>
              <select name="actionExecutionType" required>
                <option value="">${diagnosticText("Select an action", "Pasirinkite veiksmą")}</option>
                ${typeOptions}
              </select>
            </label>
            <label class="action-completion-field">
              <span>${diagnosticText("What exactly changed?", "Kas konkrečiai pakeista?")}</span>
              <input name="actionExecutionAdjustment" maxlength="160" placeholder="${diagnosticText("Example: vents opened to 30%", "Pavyzdžiui: orlaidės atidarytos iki 30 %")}">
            </label>
            <label class="action-completion-field action-completion-duration">
              <span>${diagnosticText("Planned duration", "Planuojama trukmė")}</span>
              <span class="action-completion-duration-control"><input name="actionExecutionDuration" type="number" min="1" max="1440" inputmode="numeric" placeholder="60"><small>${diagnosticText("minutes", "minučių")}</small></span>
            </label>
            <label class="action-completion-field">
              <span>${diagnosticText("Optional note", "Papildoma pastaba")}</span>
              <textarea name="actionExecutionNote" maxlength="500" rows="3" placeholder="${diagnosticText("Anything the next shift should know", "Ką turėtų žinoti kita pamaina")}"></textarea>
            </label>
            <p class="management-modal-error" role="alert" hidden></p>
            <footer class="action-completion-footer">
              <button type="button" data-management-modal-close>${diagnosticText("Cancel", "Atšaukti")}</button>
              <button type="submit" data-action-completion-save><i class="fa-solid fa-check" aria-hidden="true"></i>${diagnosticText("Save as done", "Išsaugoti kaip atliktą")}</button>
            </footer>
          </form>
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      elements.managementModalOverlay.querySelector('[name="actionExecutionType"]')?.focus();
    }

    async function submitActionCompletionModal() {
      const action = managementModalState?.type === "action-completion" ? managementModalState.action : null;
      const form = elements.managementModalOverlay.querySelector('[data-management-modal-form="action-completion"]');
      if (!action || !(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const type = String(formData.get("actionExecutionType") || "").trim();
      const adjustment = String(formData.get("actionExecutionAdjustment") || "").trim();
      const durationValue = String(formData.get("actionExecutionDuration") || "").trim();
      const note = String(formData.get("actionExecutionNote") || "").trim();
      if (!type) {
        setManagementModalError(diagnosticText("Select what was actually done.", "Pasirinkite, kas realiai buvo padaryta."));
        return;
      }
      if (type === "other" && !adjustment) {
        setManagementModalError(diagnosticText("Briefly describe the other action.", "Trumpai aprašykite kitą atliktą veiksmą."));
        return;
      }

      const saveButton = form.querySelector("[data-action-completion-save]");
      if (saveButton instanceof HTMLButtonElement) saveButton.disabled = true;
      setManagementModalError("");
      const saved = await submitTodayPriorityFeedback("completed", action, {
        note,
        executionDetails: {
          type,
          adjustment,
          durationMinutes: durationValue ? Number(durationValue) : null
        }
      });
      if (saved) {
        closeManagementModal();
      } else {
        setManagementModalError(todayPriorityFeedbackState.message || diagnosticText("Could not save the action.", "Veiksmo išsaugoti nepavyko."));
        if (saveButton instanceof HTMLButtonElement) saveButton.disabled = false;
      }
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
                  <p class="mt-1 text-xs leading-5 text-ink/60">${blockCount > 0 ? `By default this will delete ${blockCount} section${blockCount === 1 ? "" : "s"} in this area.` : "No sections in this area."}</p>
                  ${blockCount > 0 ? `<label class="mt-2 flex items-center gap-2 text-xs text-ink/70"><input name="modalLocationLeaveUnassigned" type="checkbox" class="h-4 w-4 accent-[#21473b]"><span>Keep sections and mark them as unassigned</span></label>` : ""}
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
      const profileOptions = getVisibleCropProfileEntries().map(([profileKey, profile]) => `<option value="${escapeAttribute(profileKey)}" ${zone.profile === profileKey ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("");

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

    async function saveLocationFromModal() {
      const siteId = managementModalState?.siteId;
      const input = elements.managementModalOverlay.querySelector('[name="modalLocationName"]');
      const nextName = String(input?.value || "").trim();
      if (!siteId || !nextName) return setManagementModalError("Location name is required before saving.");

      if (isApiDataMode()) {
        if (!window.NeuroCropApi?.updateArea) return setManagementModalError("Area update API is not available yet.");
        try {
          await window.NeuroCropApi.updateArea(siteId, { name: nextName });
          await hydrateDashboardFromApi();
          closeManagementModal();
          setManagementNotice("locations", `${nextName} updated.`);
          renderDashboard();
        } catch (error) {
          setManagementModalError(error instanceof Error ? error.message : "The area could not be saved.");
        }
        return;
      }

      const nextData = cloneDashboardValue(dashboardData);
      const site = nextData.sites.find((item) => item.id === siteId);
      if (!site) return setManagementModalError("This location could not be found anymore.");
      site.name = nextName;
      persistDashboardData(nextData);
      closeManagementModal();
      setManagementNotice("locations", `${nextName} updated.`);
      renderDashboard();
    }

    async function deleteLocationFromModal(siteId) {
      const confirmation = elements.managementModalOverlay.querySelector('[name="modalLocationDeleteConfirm"]');
      if (!confirmation?.checked) return setManagementModalError("Confirm that you want to delete this location.");

      if (isApiDataMode()) {
        if (!window.NeuroCropApi?.deleteArea) return setManagementModalError("Area deletion API is not available yet.");
        try {
          const keepSections = Boolean(elements.managementModalOverlay.querySelector('[name="modalLocationLeaveUnassigned"]')?.checked);
          await window.NeuroCropApi.deleteArea(siteId, { keepSections });
          const hasAnotherArea = (dashboardData.sites || []).some((site) => site.id !== siteId && !isUnassignedLocation(site));
          if (!hasAnotherArea) {
            activePrimaryPage = "locations";
            sidebarActionOverride = null;
            syncTopLevelRoute("/areas", { replace: true });
          }
          await hydrateDashboardFromApi();
          closeManagementModal();
          resetLocationForm();
          resetBlockForm();
          resetNodeForm();
          setManagementNotice("locations", keepSections ? "Area deleted. Its sections were kept as unassigned." : "Area and its sections deleted.");
          renderDashboard();
        } catch (error) {
          setManagementModalError(error instanceof Error ? error.message : "The area could not be deleted.");
        }
        return;
      }

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

    async function saveBlockFromModal() {
      const { siteId, zoneId } = managementModalState || {};
      const form = elements.managementModalOverlay.querySelector('[data-management-modal-form="block"]');
      const formData = new FormData(form);
      const nextName = String(formData.get("modalBlockName") || "").trim();
      const targetSiteId = String(formData.get("modalBlockSiteId") || "");
      const nextProfile = String(formData.get("modalBlockProfile") || "");
      if (!nextName) return setManagementModalError("Block name is required before saving.");
      if (!cropProfiles[nextProfile]) return setManagementModalError("Choose a valid crop profile.");

      if (isApiDataMode()) {
        if (!window.NeuroCropApi?.updateSection) return setManagementModalError("Section update API is not available yet.");
        try {
          await window.NeuroCropApi.updateSection(zoneId, {
            areaId: targetSiteId,
            name: nextName,
            cropProfile: nextProfile
          });
          await hydrateDashboardFromApi();
          activeBlockFilterSiteId = targetSiteId;
          closeManagementModal();
          setManagementNotice("blocks", `${nextName} updated.`);
          renderDashboard();
        } catch (error) {
          setManagementModalError(error instanceof Error ? error.message : "The section could not be saved.");
        }
        return;
      }

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

    async function deleteBlockFromModal(siteId, zoneId) {
      const confirmation = elements.managementModalOverlay.querySelector('[name="modalBlockDeleteConfirm"]');
      if (!confirmation?.checked) return setManagementModalError("Confirm that you want to delete this block.");

      if (isApiDataMode()) {
        if (!window.NeuroCropApi?.deleteSection) return setManagementModalError("Section deletion API is not available yet.");
        try {
          await window.NeuroCropApi.deleteSection(zoneId);
          await hydrateDashboardFromApi();
          activeBlockFilterSiteId = siteId;
          closeManagementModal();
          resetBlockForm({ siteId });
          resetNodeForm();
          setManagementNotice("blocks", "Section deleted.");
          renderDashboard();
        } catch (error) {
          setManagementModalError(error instanceof Error ? error.message : "The section could not be deleted.");
        }
        return;
      }

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

    function getNodeSectionOptions(siteId, selectedZoneId = "") {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      const zones = Array.isArray(site?.zones) ? site.zones : [];
      if (!zones.length) return `<option value="">No sections in this area</option>`;
      return zones.map((block) => `
        <option value="${escapeAttribute(block.id)}" ${block.id === selectedZoneId ? "selected" : ""}>${escapeHtml(block.name)}</option>
      `).join("");
    }

    function openNodeRegistrationModal() {
      const locations = dashboardData.sites.filter((site) => !isUnassignedLocation(site));
      const selectedSite = locations.find((site) => site.id === nodeFormState.siteId)
        || locations.find((site) => (site.zones || []).length > 0)
        || locations[0]
        || null;
      const selectedZone = selectedSite?.zones?.find((zone) => zone.id === nodeFormState.zoneId)
        || selectedSite?.zones?.[0]
        || null;

      nodeFormState.siteId = selectedSite?.id || "";
      nodeFormState.zoneId = selectedZone?.id || "";
      managementModalState = { type: "node-register" };

      const areaOptions = locations.map((site) => `
        <option value="${escapeAttribute(site.id)}" ${site.id === nodeFormState.siteId ? "selected" : ""}>${escapeHtml(site.name)}</option>
      `).join("");
      const sectionOptions = selectedSite
        ? getNodeSectionOptions(selectedSite.id, nodeFormState.zoneId)
        : `<option value="">No sections available</option>`;

      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop node-edit-backdrop-surface" data-management-modal-close></div>
        <section class="management-modal-shell node-edit-modal node-register-modal" role="dialog" aria-modal="true" aria-labelledby="nodeRegistrationTitle">
          <header class="node-edit-modal-head">
            <div>
              <p class="eyebrow">Register hardware</p>
              <h2 id="nodeRegistrationTitle">Connect a sensor node</h2>
              <span>Assign its DevEUI to the monitored section that will receive incoming readings.</span>
            </div>
            <button type="button" class="node-edit-close" data-management-modal-close aria-label="Close register node dialog"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          ${locations.length > 0 ? `
            <form class="node-edit-form node-register-modal-form" data-management-modal-form="node-register">
              <label class="node-edit-field"><span>Area</span><select name="nodeSiteId">${areaOptions}</select></label>
              <label class="node-edit-field"><span>Section</span><select name="nodeZoneId" ${selectedSite?.zones?.length ? "" : "disabled"}>${sectionOptions}</select></label>
              <label class="node-edit-field field-wide"><span>DevEUI</span><input name="nodeDevEui" value="${escapeAttribute(nodeFormState.devEui)}" placeholder="70B3D57ED006ABCD" minlength="16" maxlength="16" pattern="[0-9A-Fa-f]{16}" title="Enter exactly 16 hexadecimal characters" autocomplete="off" required></label>
              <p class="management-modal-error field-wide" role="alert" hidden></p>
              <footer class="node-edit-footer field-wide"><button type="button" class="button-new secondary" data-management-modal-close>Cancel</button><button type="submit" class="button-new primary"><i class="fa-solid fa-plus" aria-hidden="true"></i>Register node</button></footer>
            </form>
          ` : `
            <div class="node-register-empty"><p>Create an Area and its first Section before registering a node.</p><button type="button" class="button-new secondary" data-management-modal-close>Close</button></div>
          `}
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      enhanceDashboardSelects(elements.managementModalOverlay);
      elements.managementModalOverlay.querySelector('[name="nodeDevEui"]')?.focus();
    }

    function openNodeManagementModal(siteId, zoneId, nodeId) {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      const zone = (site?.zones || []).find((item) => item.id === zoneId);
      const node = (zone?.batteryNodes || []).find((item) => item.id === nodeId);
      if (!site || !zone || !node) return;

      managementModalState = { type: "node", siteId, zoneId, nodeId };
      const areaOptions = dashboardData.sites.map((location) => `
        <option value="${escapeAttribute(location.id)}" ${location.id === site.id ? "selected" : ""}>${escapeHtml(location.name)}</option>
      `).join("");
      const sectionOptions = getNodeSectionOptions(site.id, zone.id);
      const nodeName = node.name || node.id;

      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop node-edit-backdrop-surface" data-management-modal-close></div>
        <section class="management-modal-shell node-edit-modal" role="dialog" aria-modal="true" aria-labelledby="nodeManagementTitle">
          <header class="node-edit-modal-head">
            <div>
              <p class="eyebrow">Node configuration</p>
              <h2 id="nodeManagementTitle">Edit node</h2>
              <span>Update its identity and assignment.</span>
            </div>
            <button type="button" class="node-edit-close" data-management-modal-close aria-label="Close edit node dialog"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <form class="node-edit-form" data-management-modal-form="node">
            <label class="node-edit-field"><span>Node display name</span><input name="modalNodeName" value="${escapeAttribute(nodeName)}" required></label>
            <label class="node-edit-field"><span>DevEUI</span><input name="modalNodeDevEui" value="${escapeAttribute(node.devEui || "")}" minlength="16" maxlength="16" pattern="[0-9A-Fa-f]{16}" title="Enter exactly 16 hexadecimal characters" required></label>
            <label class="node-edit-field"><span>Assigned area</span><select name="modalNodeSiteId">${areaOptions}</select></label>
            <label class="node-edit-field"><span>Assigned section</span><select name="modalNodeSectionId" required>${sectionOptions}</select></label>
            <p class="node-move-note field-wide">Moving a node keeps its Node ID. Future readings will belong to the selected area and section.</p>
            <p class="management-modal-error field-wide" role="alert" hidden></p>
            <section class="node-remove-zone field-wide" aria-labelledby="remove-node-title">
              <div><h3 id="remove-node-title">Remove node</h3><p>Removes it from this workspace. This action cannot be undone.</p></div>
              <div class="node-remove-actions"><label><input name="modalNodeDeleteConfirm" type="checkbox"><span>Confirm removal</span></label><button type="button" data-modal-node-delete="${escapeAttribute(node.id)}" disabled><i class="fa-solid fa-trash-can" aria-hidden="true"></i>Remove</button></div>
            </section>
            <footer class="node-edit-footer field-wide"><button type="button" class="button-new secondary" data-management-modal-close>Cancel</button><button type="submit" class="button-new primary" data-node-save><i class="fa-solid fa-check" aria-hidden="true"></i>Save changes</button></footer>
          </form>
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      enhanceDashboardSelects(elements.managementModalOverlay);
      elements.managementModalOverlay.querySelector('[name="modalNodeName"]')?.focus();
    }

    function getNodeSensorRoleLabel(role) {
      return {
        unassigned_temperature: "Choose purpose",
        substrate_temperature: "Substrate temperature",
        water_temperature: "Water temperature",
        pipe_temperature: "Pipe temperature",
        custom_temperature: "Other temperature"
      }[role] || "Choose purpose";
    }

    function renderNodeSensorPanel(payload, errorMessage = "") {
      const panel = elements.managementModalOverlay.querySelector("[data-node-sensors-panel]");
      if (!panel) return;
      if (!payload) {
        panel.textContent = errorMessage || "Sensor information is unavailable.";
        return;
      }

      const detectedSensors = (payload.sensors || []).flatMap((sensor) => {
        if (!sensor.detected) return [];
        if (sensor.port === "internal") {
          return [
            { label: "Temperature sensor" },
            { label: "Humidity sensor" }
          ];
        }
        if (sensor.port === "i2c") {
          return (sensor.metrics || []).map((metric) => ({
            label: metric === "co2" ? "CO2 sensor" : metric === "lux" ? "Light sensor" : "I2C sensor"
          }));
        }
        if (sensor.port === "onewire") {
          return [{ label: sensor.label || "Temperature probe", configurable: true, sensor }];
        }
        if (sensor.port === "aux") {
          return [{ label: sensor.label || "Detected sensor" }];
        }
        return [];
      });

      const sensorRows = detectedSensors.map((item) => {
        const sensor = item.sensor;
        return `<article class="node-sensor-row"${item.configurable ? " data-configurable" : ""}>
          <div class="node-sensor-row-main">
            <span class="node-sensor-detected-dot" aria-hidden="true"></span>
            <span class="node-sensor-row-label">${escapeHtml(item.label)}</span>
            <span class="node-sensor-status" data-detected="true">Detected</span>
          </div>
          ${item.configurable ? `<div class="node-sensor-config">
            <label><span>Purpose</span><select name="nodeSensorRole" data-node-sensor-role>
              ${["unassigned_temperature", "substrate_temperature", "water_temperature", "pipe_temperature", "custom_temperature"].map((role) => `<option value="${role}" ${sensor.role === role ? "selected" : ""}>${getNodeSensorRoleLabel(role)}</option>`).join("")}
            </select></label>
            <label><span>Label</span><input name="nodeSensorLabel" value="${escapeAttribute(sensor.label || "Temperature probe")}" maxlength="80" placeholder="e.g. Tank return"></label>
            <button type="button" class="inline-action" data-node-sensor-save data-dev-eui="${escapeAttribute(payload.node.devEui)}">Save purpose</button>
          </div>` : ""}
        </article>`;
      }).join("");

      panel.innerHTML = sensorRows
        ? `<div class="node-sensor-list">${sensorRows}</div>`
        : `<span class="node-sensor-empty">No sensors detected in the latest uplink.</span>`;
    }



    async function saveNodeSensorPurpose(button) {
      const card = button.closest(".node-sensor-card");
      const devEui = button.dataset.devEui;
      const role = card?.querySelector('[data-node-sensor-role]')?.value || "unassigned_temperature";
      const label = card?.querySelector('[name="nodeSensorLabel"]')?.value?.trim() || "Temperature probe";
      if (!devEui || !window.NeuroCropApi?.updateNodeSensor) return;

      button.disabled = true;
      button.textContent = "Saving...";
      try {
        const payload = await window.NeuroCropApi.updateNodeSensor(devEui, "onewire", { role, label });
        renderNodeSensorPanel(payload);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Save purpose";
        setManagementModalError(error instanceof Error ? error.message : "Sensor purpose could not be saved.");
      }
    }

    async function saveNodeFromModal() {
      const { nodeId } = managementModalState || {};
      const form = elements.managementModalOverlay.querySelector('[data-management-modal-form="node"]');
      const formData = new FormData(form);
      const targetSiteId = String(formData.get("modalNodeSiteId") || "");
      const targetZoneId = String(formData.get("modalNodeSectionId") || "");
      const nodeName = String(formData.get("modalNodeName") || "").trim();
      const devEui = String(formData.get("modalNodeDevEui") || "").trim().toUpperCase();
      if (!nodeId || !targetSiteId || !targetZoneId) return setManagementModalError("Choose both an area and a section for this node.");
      if (!nodeName) return setManagementModalError("Enter a node display name.");
      if (!/^[0-9A-F]{16}$/.test(devEui)) return setManagementModalError("DevEUI must be 16 hexadecimal characters.");
      if (isApiDataMode()) {
        const record = findNodeRecordById(nodeId);
        const currentDevEui = record?.node?.devEui || nodeId;
        if (!window.NeuroCropApi?.updateNode) return setManagementModalError("Node update API is not available yet.");
        try {
          await window.NeuroCropApi.updateNode(currentDevEui, {
            name: nodeName,
            devEui,
            sectionId: targetZoneId
          });
          await hydrateDashboardFromApi();
          activeSiteId = targetSiteId;
          activeZoneId = targetZoneId;
          resetCurrentReadingsFromActiveZone();
          resetNodeForm({ siteId: targetSiteId, zoneId: targetZoneId });
          const targetSite = dashboardData.sites.find((item) => item.id === targetSiteId);
          const targetZone = (targetSite?.zones || []).find((item) => item.id === targetZoneId);
          const updatedNode = (targetZone?.batteryNodes || []).find((item) => normalizeDevEuiForCompare(item.devEui) === normalizeDevEuiForCompare(devEui));
          closeManagementModal();
          setManagementNotice("nodes", `${nodeName} saved${targetZone ? ` and assigned to ${targetZone.name}` : ""}.`);
          renderDashboard();
          if (activeNodeDetailId && updatedNode) {
            activeNodeDetailId = updatedNode.id;
            syncTopLevelRoute(`/nodes/${encodeURIComponent(updatedNode.id)}`, { replace: true });
          }
        } catch (error) {
          setManagementModalError(error instanceof Error ? error.message : "The node could not be saved.");
        }
        return;
      }
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

    function findNodeRecordById(nodeId) {
      for (const site of dashboardData.sites || []) {
        for (const zone of site.zones || []) {
          const node = (zone.batteryNodes || []).find((item) => item.id === nodeId);
          if (node) return { site, zone, node };
        }
      }
      return null;
    }

    function normalizeDevEuiForCompare(devEui) {
      return String(devEui || "").trim().toLowerCase().replace(/[^0-9a-f]/g, "");
    }

    async function deleteNodeFromModal(nodeId) {
      const confirmation = elements.managementModalOverlay.querySelector('[name="modalNodeDeleteConfirm"]');
      if (!confirmation?.checked) return setManagementModalError("Confirm that you want to remove this node.");
      if (isApiDataMode()) {
        const record = findNodeRecordById(nodeId);
        const devEui = record?.node?.devEui || nodeId;
        if (!window.NeuroCropApi?.deleteNode) return setManagementModalError("Node deletion API is not available yet.");
        try {
          await window.NeuroCropApi.deleteNode(devEui);
          await hydrateDashboardFromApi();
          resetNodeForm();
          activeNodeDetailId = null;
          closeManagementModal();
          setManagementNotice("nodes", `${nodeId} removed from the workspace.`);
          renderDashboard();
          syncTopLevelRoute("/nodes", { replace: true });
        } catch (error) {
          setManagementModalError(error instanceof Error ? error.message : "The node could not be removed.");
        }
        return;
      }
      if (!window.NeuroCropStore?.deleteNode) return setManagementModalError("Node deletion is not available in this browser context.");

      try {
        window.NeuroCropStore.deleteNode(nodeId);
        dashboardData = window.NeuroCropStore.getDashboardData();
        resetNodeForm();
        activeNodeDetailId = null;
        closeManagementModal();
        setManagementNotice("nodes", `${nodeId} removed from the workspace.`);
        renderDashboard();
        syncTopLevelRoute("/nodes", { replace: true });
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

    function isScoreMetricKey(key) {
      return !["batteryLevel", "lux", "airPressure"].includes(key);
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
    let apiTransportConnected = true;

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
      const fallbackReceivedAt = isApiDataMode()
        ? null
        : new Date(now - getDemoFreshnessOffsetSec(node) * 1000).toISOString();
      const lastReceivedAt = node?.lastReceivedAt || node?.lastSeen || fallbackReceivedAt;
      const observations = node?.observations && typeof node.observations === "object"
        ? node.observations
        : lastReceivedAt
          ? Object.fromEntries((zone?.availableMetrics || []).map((metricId) => [
              metricId,
              {
                lastObservedAt: lastReceivedAt,
                expectedIntervalSec: metricId === "batteryLevel" ? 21600 : 600
              }
            ]))
          : {};

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
      const nodeReceivedAt = node?.lastReceivedAt || node?.lastSeen;
      const sourceVersion = nodeReceivedAt
        ? `${nodeReceivedAt}:${Object.values(node.observations || {}).map((observation) => observation.lastObservedAt || "").join("|")}`
        : isApiDataMode() ? "no-uplink-yet" : `demo:${getDemoFreshnessOffsetSec(node)}`;
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

    function formatFreshnessAge(ageSec) {
      return window.NeuroCropFeatures.nodes.formatFreshnessAge(ageSec, diagnosticText);
    }

    function formatNodeLastPayload(node, freshness = null) {
      return window.NeuroCropFeatures.nodes.formatLastPayload(node, freshness || {}, diagnosticText);
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

      const source = zone?.observationStates?.[metricKey]
        || (isApiDataMode() ? null : getDemoObservationState(zone, metricKey));
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
        airTemp: "Air climate",
        humidity: "Air climate",
        vpd: "Calculated from air climate",
        co2: "CO2 measurement",
        lux: "Light measurement",
        soilTemp: "Temperature probe",
        waterTemp: "Temperature probe",
        soilMoisture: "Substrate measurement",
        airPressure: "Air measurement",
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
      const evaluateNodeValue = (value) => metricKey === "lux"
        ? evaluateCurrentLightReading(definition, value)
        : evaluateMetric(definition, value);
      const apiObservation = isApiDataMode()
        ? latestReadingsBySectionId[zone?.id]?.observations?.[metricKey]
        : null;

      if (apiObservation && Array.isArray(apiObservation.nodes)) {
        const readings = apiObservation.nodes.map((source, index) => {
          const node = nodes.find((item) => normalizeDevEuiForCompare(item.devEui) === normalizeDevEuiForCompare(source.devEui)) || {
            id: source.devEui,
            name: source.nodeName || source.devEui,
            devEui: source.devEui,
            active: true
          };
          const freshness = getNodeFreshness(node, zone);
          const freshnessStatus = freshness.observations?.[metricKey]?.status || freshness.transportStatus;
          return {
            node,
            position: getNodePositionLabel(index, apiObservation.nodes.length),
            source: getMetricSensorSource(metricKey),
            value: Number(source.value),
            metricResult: evaluateNodeValue(Number(source.value)),
            observation: getObservationPresentation(zone, metricKey, result, freshnessStatus)
          };
        });
        const values = readings.map((reading) => reading.value).filter(Number.isFinite);
        const medianResult = Number.isFinite(Number(apiObservation.value))
          ? evaluateNodeValue(Number(apiObservation.value))
          : { value: null, state: "unavailable", severity: 0 };
        const outsideReadings = readings.filter((reading) => reading.metricResult.state !== "optimal");

        return {
          installedCount: Number(apiObservation.reportingSensors) || readings.length,
          reportingCount: readings.length,
          readings,
          medianValue: Number(apiObservation.value),
          medianResult,
          min: Number.isFinite(Number(apiObservation.range?.min)) ? Number(apiObservation.range.min) : Math.min(...values),
          max: Number.isFinite(Number(apiObservation.range?.max)) ? Number(apiObservation.range.max) : Math.max(...values),
          outsideCount: outsideReadings.length,
          localOutliers: medianResult.state === "optimal" ? outsideReadings : []
        };
      }

      // In API mode the backend is the only source of per-node readings.
      // Never infer installed sensors or fabricate values from a section median.
      if (isApiDataMode()) {
        return {
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
      }

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
        const metricResult = evaluateNodeValue(value);
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
        : evaluateNodeValue(roundValue(medianValue, definition.decimals));
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

    function updateClientConnectionStatus() {
      if (!elements.headerConnectionStatus || !elements.headerConnectionLabel) return;
      const apiConfigured = Boolean(window.NeuroCropApi?.isConnected?.());
      const connected = navigator.onLine && (!apiConfigured || apiTransportConnected);
      elements.headerConnectionStatus.dataset.connection = connected ? "online" : "lost";
      elements.headerConnectionLabel.textContent = connected
        ? "Online"
        : diagnosticText("Connection lost", "Ryšys nutrūko");
      elements.headerConnectionStatus.title = connected
        ? diagnosticText("Dashboard connection is active.", "Sistemos ryšys aktyvus.")
        : navigator.onLine
          ? diagnosticText("The API could not be reached.", "Nepavyko pasiekti API.")
          : diagnosticText("The browser is offline.", "Naršyklė neprisijungusi.");
    }

    function getLowBatteryNodes(zone, definition) {
      const threshold = getBatteryAlertThreshold(definition);
      return (zone?.batteryNodes || [])
        .filter((node) => Number.isFinite(node.level) && node.level < threshold)
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

    function detectedMetricKeysFromNodes(nodes) {
      const detected = new Set();

      (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        const presence = node?.sensorPresence;
        if (!presence || typeof presence !== "object") return;

        if (presence.sht45 === true) {
          detected.add("airTemp");
          detected.add("humidity");
          detected.add("vpd");
        }
        if (presence.scd41 === true) detected.add("co2");
        if (presence.bh1750 === true) detected.add("lux");
      });

      return [...detected];
    }

    function normalizeApiDashboardData(data) {
      const nextData = cloneDashboardValue(data || {});
      nextData.sites = Array.isArray(nextData.sites) ? nextData.sites : [];
      nextData.sites = nextData.sites.map((site) => ({
        ...site,
        zones: (Array.isArray(site.zones) ? site.zones : []).map((zone) => {
          const batteryNodes = (Array.isArray(zone.batteryNodes) ? zone.batteryNodes : []).map((node) => {
            const id = String(node.id || node.name || node.devEui || "").trim();
            const rawBatteryLevel = node.level ?? node.batteryPercent;
            const batteryLevel = rawBatteryLevel === null || rawBatteryLevel === undefined || rawBatteryLevel === ""
              ? null
              : Number(rawBatteryLevel);
            return {
              ...node,
              id,
              name: String(node.name || id || node.devEui || "").trim(),
              devEui: String(node.devEui || "").trim(),
              level: Number.isFinite(batteryLevel) ? Math.max(0, Math.min(batteryLevel, 100)) : null,
              active: node.active !== false
            };
          });
          const configuredMetrics = Array.isArray(zone.configuredMetrics) ? zone.configuredMetrics.slice() : [];
          const availableMetrics = [...new Set([
            ...(Array.isArray(zone.availableMetrics) ? zone.availableMetrics : []),
            ...configuredMetrics,
            ...detectedMetricKeysFromNodes(batteryNodes)
          ])];
          if (batteryNodes.length > 0 && !availableMetrics.includes("batteryLevel")) {
            availableMetrics.push("batteryLevel");
          }
          const backendState = zone.state || zone.farmState || zone.scopeState || zone.summary || null;
          const normalizedProfileKey = normalizeCropProfileKey(zone.profile);
          return {
            ...zone,
            profile: cropProfiles[normalizedProfileKey]
              ? normalizedProfileKey
              : cropProfiles.default
                ? "default"
                : Object.keys(cropProfiles)[0] || "default",
            batteryNodes,
            sensorCount: Number(zone.sensorCount) || batteryNodes.length,
            availableMetrics,
            configuredMetrics,
            backendState,
            backendScore: zone.score ?? zone.indexScore ?? backendState?.score ?? backendState?.indexScore ?? null,
            backendScoreModelVersion: zone.scoreModelVersion ?? backendState?.scoreModelVersion ?? null,
            backendScoreGroups: Array.isArray(zone.scoreGroups)
              ? zone.scoreGroups
              : Array.isArray(backendState?.scoreGroups) ? backendState.scoreGroups : [],
            backendConditionStatus: zone.conditionStatus ?? backendState?.conditionStatus ?? backendState?.status ?? null,
            backendMainDriver: zone.mainDriver ?? backendState?.mainDriver ?? null,
            backendCoverage: zone.coverage ?? backendState?.coverage ?? null,
            backendNodeSummary: zone.nodeSummary ?? backendState?.nodeSummary ?? null,
            backendComputedAt: zone.computedAt ?? backendState?.computedAt ?? null
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
      if (metricKey === "lux") return evaluateCurrentLightReading(definition, Number(rawValue));
      return evaluateMetric(definition, Number(rawValue));
    }

    function evaluateCurrentLightReading(definition, value) {
      const schedule = definition?.lightingSchedule || {};
      if (schedule.enabled !== true || !/^\d{2}:\d{2}$/.test(schedule.start || "") || !/^\d{2}:\d{2}$/.test(schedule.end || "")) {
        return { ...evaluateMetric(definition, value), state: "optimal", severity: 0, statusLabel: diagnosticText("Monitoring only", "Tik stebėjimas"), deviationText: diagnosticText("Configure a lighting schedule to evaluate this reading.", "Norėdami vertinti šį rodmenį, nustatykite apšvietimo grafiką.") };
      }
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: schedule.timeZone || "Europe/Vilnius", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const clock = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const nowMinutes = Number(clock.hour) * 60 + Number(clock.minute);
      const toMinutes = (clockValue) => Number(clockValue.slice(0, 2)) * 60 + Number(clockValue.slice(3, 5));
      const start = toMinutes(schedule.start);
      const end = toMinutes(schedule.end);
      const expectedLight = start === end || (start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end);
      const darkThreshold = Math.max(0, Number(schedule.darkThresholdLux) || 100);
      if (!expectedLight) {
        return value <= darkThreshold
          ? { ...evaluateMetric(definition, value), state: "optimal", severity: 0, statusLabel: diagnosticText("Expected darkness", "Numatyta tamsa"), deviationText: diagnosticText("Darkness matches the lighting schedule.", "Tamsa atitinka apšvietimo grafiką.") }
          : { ...evaluateMetric(definition, value), state: "warning", severity: 0.5, statusLabel: diagnosticText("Unexpected night light", "Netikėta šviesa naktį"), deviationText: diagnosticText("Light is present outside the scheduled photoperiod.", "Šviesa aptikta už numatyto fotoperiodo ribų.") };
      }
      if (value <= darkThreshold) {
        return { ...evaluateMetric(definition, value), state: "critical", severity: 1, statusLabel: diagnosticText("Scheduled light missing", "Trūksta numatytos šviesos"), deviationText: diagnosticText("The lighting period is active, but the measured light is near zero.", "Apšvietimo periodas aktyvus, bet išmatuota šviesa beveik lygi nuliui.") };
      }
      return evaluateMetric(definition, value);
    }

    function isMetricConfiguredForReadings(metricKey, availableMetrics, readings) {
      return availableMetrics.has(metricKey) || Number.isFinite(Number(readings?.[metricKey]));
    }

    async function fetchLatestReadingsForZone(zoneId, options = {}) {
      if (!isApiDataMode() || !zoneId) return;
      const requestId = (latestReadingsRequestIdBySectionId[zoneId] || 0) + 1;
      latestReadingsRequestIdBySectionId[zoneId] = requestId;
      latestReadingsStatusBySectionId[zoneId] = { status: "loading", error: "" };

      try {
        const response = await window.NeuroCropApi.getLatestReadings(zoneId);
        if (requestId !== latestReadingsRequestIdBySectionId[zoneId]) return;
        latestReadingsBySectionId[zoneId] = response;
        latestReadingsStatusBySectionId[zoneId] = { status: "ready", error: "", fetchedAt: Date.now() };
        if (zoneId === getActiveZone()?.id) {
          currentReadings = readingsFromApiObservations(response);
          manualOverride = false;
          if (options.renderOnComplete !== false) renderDashboard();
        }
        return response;
      } catch (error) {
        latestReadingsStatusBySectionId[zoneId] = {
          status: "error",
          error: error instanceof Error ? error.message : "Latest readings could not be loaded.",
          failedAt: Date.now()
        };
        if (zoneId === getActiveZone()?.id) {
          currentReadings = {};
          manualOverride = false;
          if (options.renderOnComplete !== false) renderDashboard();
        }
        return null;
      }
    }

    async function fetchLatestReadingsForArea(siteId, options = {}) {
      if (!isApiDataMode() || !siteId || latestReadingsAreaInFlight.has(siteId)) return;
      const site = dashboardData.sites.find((item) => item.id === siteId);
      if (!site) return;
      const now = Date.now();
      const zonesToFetch = (site.zones || []).filter((zone) => {
        const status = latestReadingsStatusBySectionId[zone.id];
        if (status?.status === "loading") return false;
        if (options.force === true) return true;
        if (status?.status === "ready" && now - (status.fetchedAt || 0) < latestReadingsCacheTtlMs) return false;
        if (status?.status === "error" && now - (status.failedAt || 0) < latestReadingsRetryDelayMs) return false;
        return true;
      });
      if (zonesToFetch.length === 0) return;

      latestReadingsAreaInFlight.add(siteId);
      try {
        await Promise.all(zonesToFetch.map((zone) => fetchLatestReadingsForZone(zone.id, {
          onlyActive: false,
          renderOnComplete: false
        })));
      } finally {
        latestReadingsAreaInFlight.delete(siteId);
      }

      if (options.renderOnComplete !== false
        && activePrimaryPage === "readings"
        && activeViewScope === "site"
        && getActiveSite()?.id === siteId) {
        renderDashboard();
      }
    }

    function getTrendHistoryCacheKey(sectionId, metricKey, rangeKey) {
      return `${sectionId || "none"}:${metricKey || "none"}:${rangeKey || "24h"}`;
    }

    function getTrendHistoryWindow(rangeConfig) {
      const to = new Date();
      const from = new Date(to.getTime() - ((rangeConfig?.totalHours || 24) * 60 * 60 * 1000));
      return { from, to };
    }

    async function fetchTrendHistoryForMetric(sectionId, metricKey, rangeKey) {
      if (!isApiDataMode() || !sectionId || !metricKey) return;
      const rangeConfig = trendRangeConfig[rangeKey] || trendRangeConfig["24h"];
      const cacheKey = getTrendHistoryCacheKey(sectionId, metricKey, rangeKey);
      const existingStatus = trendHistoryStatusByKey[cacheKey];
      const now = Date.now();
      if (existingStatus?.status === "loading") return;
      if (existingStatus?.status === "ready" && now - (existingStatus.fetchedAt || 0) < trendHistoryCacheTtlMs) return;
      if (existingStatus?.status === "error" && now - (existingStatus.failedAt || 0) < trendHistoryRetryDelayMs) return;

      const { from, to } = getTrendHistoryWindow(rangeConfig);
      const requestId = ++trendHistoryRequestId;
      trendHistoryStatusByKey[cacheKey] = { status: "loading", error: "" };

      try {
        const response = await window.NeuroCropApi.getHistory({
          sectionId,
          metric: metricKey,
          from: from.toISOString(),
          to: to.toISOString(),
          stepMinutes: rangeConfig.intervalMinutes
        });
        trendHistoryByKey[cacheKey] = response;
        trendHistoryStatusByKey[cacheKey] = { status: "ready", error: "", fetchedAt: Date.now() };
        if (activePrimaryPage === "readings" || (requestId >= trendHistoryRequestId - 2 && activePrimaryPage === "history")) {
          renderDashboard();
        }
      } catch (error) {
        trendHistoryStatusByKey[cacheKey] = {
          status: "error",
          error: error instanceof Error ? error.message : "History could not be loaded.",
          failedAt: Date.now()
        };
        if (activePrimaryPage === "history" || activePrimaryPage === "readings") renderDashboard();
      }
    }

    function getTrendAnalyticsCacheKey(sectionId, metricKey, rangeKey) {
      return `${sectionId || "none"}:${metricKey || "none"}:${rangeKey || "24h"}`;
    }

    async function fetchTrendSectionAnalytics(sectionId, metricKey, rangeKey) {
      if (!isApiDataMode() || !sectionId || !metricKey || !window.NeuroCropApi?.getSectionAnalytics) return;
      const cacheKey = getTrendAnalyticsCacheKey(sectionId, metricKey, rangeKey);
      const status = trendAnalyticsStatusByKey[cacheKey];
      if (status?.status === "loading" || (status?.status === "ready" && Date.now() - status.fetchedAt < trendHistoryCacheTtlMs)) return;
      const range = trendRangeConfig[rangeKey] || trendRangeConfig["24h"];
      const { from, to } = getTrendHistoryWindow(range);
      trendAnalyticsStatusByKey[cacheKey] = { status: "loading", error: "" };
      try {
        const response = await window.NeuroCropApi.getSectionAnalytics({
          sectionId,
          metric: metricKey,
          from: from.toISOString(),
          to: to.toISOString(),
          stepMinutes: range.intervalMinutes
        });
        trendAnalyticsByKey[cacheKey] = response;
        trendAnalyticsStatusByKey[cacheKey] = { status: "ready", error: "", fetchedAt: Date.now() };
        if (activePrimaryPage === "history" && getActiveZone()?.id === sectionId) renderDashboard();
      } catch (error) {
        trendAnalyticsStatusByKey[cacheKey] = { status: "error", error: error instanceof Error ? error.message : "Analytics could not be loaded." };
      }
    }

    async function fetchTrendSiteComparison(site, metricKey, rangeKey, sectionIds) {
      if (!isApiDataMode() || !site?.id || !metricKey || sectionIds.length < 2 || !window.NeuroCropApi?.getSiteComparison) return;
      const cacheKey = `${site.id}:${metricKey}:${rangeKey}:${[...sectionIds].sort().join(",")}`;
      if (trendComparisonStatusByKey[cacheKey]?.status === "loading" || trendComparisonStatusByKey[cacheKey]?.status === "ready") return;
      const range = trendRangeConfig[rangeKey] || trendRangeConfig["24h"];
      const { from, to } = getTrendHistoryWindow(range);
      trendComparisonStatusByKey[cacheKey] = { status: "loading", error: "" };
      try {
        const response = await window.NeuroCropApi.getSiteComparison({
          areaId: site.id,
          metric: metricKey,
          sectionIds: sectionIds.join(","),
          from: from.toISOString(),
          to: to.toISOString(),
          stepMinutes: range.intervalMinutes
        });
        trendComparisonByKey[cacheKey] = response;
        trendComparisonStatusByKey[cacheKey] = { status: "ready", error: "" };
        if (activePrimaryPage === "history" && getActiveSite()?.id === site.id) renderDashboard();
      } catch (error) {
        trendComparisonStatusByKey[cacheKey] = { status: "error", error: error instanceof Error ? error.message : "Comparison could not be loaded." };
      }
    }

    async function fetchSectionDynamics(sectionId) {
      if (!isApiDataMode() || !sectionId || !window.NeuroCropApi?.getSectionDynamics) return;
      const status = dynamicsStatusBySectionId[sectionId];
      if (status?.status === "loading" || (status?.status === "ready" && Date.now() - status.fetchedAt < trendHistoryCacheTtlMs)) return;
      dynamicsStatusBySectionId[sectionId] = { status: "loading", error: "" };
      try {
        dynamicsBySectionId[sectionId] = await window.NeuroCropApi.getSectionDynamics(sectionId);
        dynamicsStatusBySectionId[sectionId] = { status: "ready", error: "", fetchedAt: Date.now() };
        if (activePrimaryPage === "overview") renderDashboard();
      } catch (error) {
        dynamicsStatusBySectionId[sectionId] = { status: "error", error: error instanceof Error ? error.message : "24-hour dynamics could not be loaded." };
        if (activePrimaryPage === "overview") renderDashboard();
      }
    }

    function invalidateProfileAnalytics(profileKey) {
      const affectedSectionIds = new Set(
        dashboardData.sites.flatMap((site) =>
          site.zones
            .filter((zone) => normalizeCropProfileKey(zone.profile) === normalizeCropProfileKey(profileKey))
            .map((zone) => zone.id)
        )
      );
      for (const sectionId of affectedSectionIds) {
        delete dynamicsBySectionId[sectionId];
        delete dynamicsStatusBySectionId[sectionId];
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
      // An Area score describes the typical condition across reporting Sections.
      // Its status stays conservative: one critical Section makes the Area critical.
      const reportingSnapshots = siteSnapshots.filter(snapshotHasLiveGrowthData);
      if (reportingSnapshots.length === 0) {
        return {
          state: "unknown",
          stableCount: 0,
          warningCount: 0,
          criticalCount: 0,
          unknownCount: siteSnapshots.length,
          indexScore: null
        };
      }

      const indexScore = Math.round(
        reportingSnapshots.reduce((sum, snapshot) => sum + snapshot.overall.indexScore, 0)
        / reportingSnapshots.length
      );
      const criticalCount = reportingSnapshots.filter((snapshot) => snapshot.overall.state === "critical").length;
      const warningCount = reportingSnapshots.filter((snapshot) => snapshot.overall.state === "warning").length;
      const stableCount = reportingSnapshots.filter((snapshot) => snapshot.overall.state === "optimal").length;
      const state = criticalCount > 0
        ? "critical"
        : warningCount > 0
          ? "warning"
          : "optimal";

      return {
        state,
        stableCount,
        warningCount,
        criticalCount,
        unknownCount: siteSnapshots.length - reportingSnapshots.length,
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
      const growthResults = results.filter((item) => isGrowthMetricKey(item.key) && item.configured !== false);
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
        .filter(snapshotHasLiveGrowthData)
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
      if (state === "unknown") return "No data";
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
      const persistedFeedback = action?.backendAction?.feedback || null;
      const localFeedback = action && todayPriorityFeedbackState.actionId === action.backendAction?.id
        ? todayPriorityFeedbackState
        : null;
      const feedbackStatusLabels = {
        completed: diagnosticText("Done", "Atlikta"),
        deferred: diagnosticText("Deferred", "Atidėta"),
        failed: diagnosticText("Could not complete", "Nepavyko atlikti")
      };
      const feedbackControls = action?.backendAction ? `
        <div class="today-priority-feedback" data-saving="${localFeedback?.saving === true}">
          <span class="today-priority-feedback-label">${diagnosticText("Was this action carried out?", "Ar šis veiksmas atliktas?")}</span>
          <div class="today-priority-feedback-actions" role="group" aria-label="${diagnosticText("Record action outcome", "Išsaugoti veiksmo rezultatą")}">
            <button type="button" data-today-feedback="completed" ${localFeedback?.saving || persistedFeedback?.status === "completed" ? "disabled" : ""}><i class="fa-solid fa-check" aria-hidden="true"></i>${diagnosticText("Done", "Atlikta")}</button>
            <button type="button" data-today-feedback="deferred" ${localFeedback?.saving || persistedFeedback?.status === "deferred" ? "disabled" : ""}><i class="fa-regular fa-clock" aria-hidden="true"></i>${diagnosticText("Defer", "Atidėti")}</button>
            <button type="button" data-today-feedback="failed" ${localFeedback?.saving || persistedFeedback?.status === "failed" ? "disabled" : ""}><i class="fa-solid fa-xmark" aria-hidden="true"></i>${diagnosticText("Could not complete", "Nepavyko")}</button>
          </div>
          ${(localFeedback?.message || persistedFeedback) ? `
            <div class="today-priority-feedback-status" data-error="${localFeedback?.error === true}" role="${localFeedback?.error ? "alert" : "status"}" aria-live="polite">
              <i class="fa-solid ${localFeedback?.error ? "fa-triangle-exclamation" : localFeedback?.saving ? "fa-circle-notch fa-spin" : "fa-circle-check"}" aria-hidden="true"></i>
              ${escapeHtml(localFeedback?.message || `${feedbackStatusLabels[persistedFeedback.status] || persistedFeedback.status} · ${new Date(persistedFeedback.createdAt).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}`)}
            </div>
          ` : ""}
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
          ${feedbackControls}
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
            <button type="button" data-today-compare-page>${diagnosticText("Compare sections", "Palyginti sekcijas")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
          </div>
        `);
      }
      const recentActionHistory = (backendActionHistory || []).slice(0, 4);
      if (recentActionHistory.length > 0) {
        elements.todayPriorityMain.insertAdjacentHTML("beforeend", `
          <section class="today-priority-history" aria-label="${diagnosticText("Recent action results", "Naujausi veiksmų rezultatai")}">
            <div class="today-priority-history-head">
              <strong>${diagnosticText("What happened after your actions", "Kas įvyko po jūsų veiksmų")}</strong>
              <span>${diagnosticText("Result uses at least 3 readings after the response delay", "Rezultatas vertinamas bent iš 3 matavimų po laukimo intervalo")}</span>
            </div>
            <div class="today-priority-history-list">
              ${recentActionHistory.map((item) => {
                const presentation = getActionHistoryPresentation(item);
                const actor = item.createdByName || diagnosticText("Team member", "Komandos narys");
                const createdAt = new Date(item.createdAt).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
                return `
                  <article class="today-priority-history-row" data-outcome="${escapeAttribute(presentation.outcomeState)}" data-feedback-status="${escapeAttribute(presentation.status)}">
                    <span class="today-priority-history-icon"><i class="fa-solid ${presentation.icon}" aria-hidden="true"></i></span>
                    <span class="today-priority-history-copy">
                      <strong>${escapeHtml(item.title)}</strong>
                      <small>${escapeHtml(`${item.areaName || diagnosticText("Area", "Area")} · ${item.sectionName} · ${actor} · ${createdAt}`)}</small>
                      <span class="today-priority-history-feedback" data-status="${escapeAttribute(presentation.status)}">${escapeHtml(`${diagnosticText("Recorded", "Užregistruota")}: ${presentation.feedbackSummary}`)}</span>
                    </span>
                    <span class="today-priority-history-outcome" data-outcome="${escapeAttribute(presentation.outcomeState)}">${escapeHtml(presentation.sensorLabel)}</span>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
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
      } else if (activePrimaryPage === "settings") {
        activeAction = "settings";
      } else if (activePrimaryPage === "admin") {
        activeAction = "admin";
      } else if (sidebarActionOverride) {
        activeAction = sidebarActionOverride;
      }

      sidebarActionButtons.forEach((button) => {
        if (button.dataset.sidebarAction === "admin") {
          const showAdmin = getLoginSession()?.isPlatformAdmin === true;
          button.hidden = !showAdmin;
          button.style.display = showAdmin ? "" : "none";
        }
        if (button.dataset.sidebarAction === "zones") {
          const hasAreas = (dashboardData.sites || []).some((site) => !isUnassignedLocation(site));
          button.disabled = !hasAreas;
          button.setAttribute("aria-disabled", String(!hasAreas));
          button.style.opacity = hasAreas ? "" : "0.42";
          button.style.pointerEvents = hasAreas ? "" : "none";
          button.title = hasAreas ? "" : "Create an area before adding sections.";
        }
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
            runDashboardAction("sites");
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
          if (!(dashboardData.sites || []).some((existingSite) => !isUnassignedLocation(existingSite))) return;
          activePrimaryPage = "blocks";
          syncBlocksManagementContext();
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
          activeViewScope = "site";
          activeWorkspaceFocus = "all";
          activeWorkbenchLensKey = "essential";
          setExperienceMode("detailed", { render: false });
          closeContextMenus();
          renderDashboard();
          fetchLatestReadingsForArea(site?.id);
          syncTopLevelRoute("/readings");
          scrollToSection("metricsSection", { behavior: "auto", highlight: false });
          return;
        case "history":
          activePrimaryPage = "history";
          sidebarActionOverride = null;
          activeViewScope = "zone";
          activeWorkspaceFocus = "all";
          setExperienceMode("detailed", { render: false, force: true });
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/history");
          scrollToSection("historySection", { behavior: "auto", highlight: false });
          return;
        case "settings":
          activePrimaryPage = "settings";
          if (cropProfiles[activeProfileKey]) activeSettingsProfileKey = activeProfileKey;
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/settings");
          scrollToSection("settingsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "admin":
          if (!getLoginSession()?.isPlatformAdmin) return;
          activePrimaryPage = "admin";
          activeSettingsPanelKey = "platform";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/admin");
          scrollToSection("settingsManagementSection", { behavior: "auto", highlight: false });
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

    async function submitTodayPriorityFeedback(status, selectedAction = null, options = {}) {
      const action = selectedAction || currentTodayPriorityAction?.backendAction;
      if (!action || !window.NeuroCropApi?.submitTodayActionFeedback) return false;
      if (todayPriorityFeedbackState.actionId === action.id && todayPriorityFeedbackState.saving) return false;

      todayPriorityFeedbackState = {
        actionId: action.id,
        saving: true,
        error: false,
        message: diagnosticText("Saving action status…", "Saugoma veiksmo būsena…")
      };
      renderDashboard();

      try {
        const response = await window.NeuroCropApi.submitTodayActionFeedback(action.id, {
          status,
          action,
          note: options.note || "",
          ...(options.executionDetails ? { executionDetails: options.executionDetails } : {})
        });
        backendTodayActions = (backendTodayActions || []).map((item) =>
          item.id === action.id ? { ...item, feedback: response.feedback } : item
        );
        const historyResponse = await window.NeuroCropApi.getActionHistory(12).catch((error) => {
          console.warn("Action was saved, but action history refresh failed.", error);
          return null;
        });
        if (Array.isArray(historyResponse?.items)) backendActionHistory = historyResponse.items;
        const statusLabel = {
          completed: diagnosticText("Done", "Atlikta"),
          deferred: diagnosticText("Deferred", "Atidėta"),
          failed: diagnosticText("Could not complete", "Nepavyko atlikti")
        }[status] || status;
        todayPriorityFeedbackState = {
          actionId: action.id,
          saving: false,
          error: false,
          message: diagnosticText(`${statusLabel} and saved to the activity history.`, `${statusLabel} ir išsaugota veiksmų istorijoje.`)
        };
        renderDashboard();
        return true;
      } catch (error) {
        todayPriorityFeedbackState = {
          actionId: action.id,
          saving: false,
          error: true,
          message: error instanceof Error ? error.message : diagnosticText("Action status could not be saved.", "Veiksmo būsenos išsaugoti nepavyko.")
        };
        renderDashboard();
        return false;
      }
    }

    function requestTodayPriorityFeedback(status, selectedAction = null) {
      const action = selectedAction || currentTodayPriorityAction?.backendAction;
      if (!action) return;
      if (status === "completed") {
        openActionCompletionModal(action);
        return;
      }
      submitTodayPriorityFeedback(status, action);
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
        if (stateKey === "unknown") return "No data";
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
      const { emptyTitle, emptyNote, isLoading = false } = options;
      if (items.length === 0) {
        if (isLoading) {
          return `
            <div class="workbench-empty-card">
              <div class="workbench-empty-title">Loading live readings…</div>
              <p class="workbench-empty-note">Waiting for the latest measurements before deciding whether this section needs attention.</p>
            </div>
          `;
        }
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

    let viewportSyncFrame = 0;

    function scheduleViewportSync() {
      if (viewportSyncFrame) return;
      viewportSyncFrame = window.requestAnimationFrame(() => {
        viewportSyncFrame = 0;
        syncStickyOffsets();
        trendHistoryChartInstance?.resize();
      });
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



function buildSiteAverageSummaries(siteSnapshots, options = {}) {
  const includeNonGrowthMetrics = options.includeNonGrowthMetrics === true;
  const metricKeys = [...new Set(siteSnapshots.flatMap((snapshot) =>
    Object.keys(snapshot.profile.metrics).filter((key) =>
      key !== "batteryLevel" && (includeNonGrowthMetrics || isGrowthMetricKey(key))
    )
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
            label: "Incomplete coverage",
            icon: "fa-wave-square",
            tone: "warning",
            count: coverageCount,
            description: `${coverageCount} location averages are based on only part of the available sections.`
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
      const unavailableCount = unavailableResults.length;

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

      if (unavailableCount > 0) {
        lenses.push({
          key: "coverage",
          label: "Unavailable metrics",
          icon: "fa-sensor",
          tone: "neutral",
          count: unavailableCount,
          description: `${unavailableCount} profile metric${unavailableCount === 1 ? " is" : "s are"} not reported by sensors in ${zone.name}.`
        });
      }

      groupKeys.forEach((groupKey) => {
        const group = getMetricWorkbenchGroup(groupKey === "climate" ? "airTemp" : groupKey === "root" ? "soilTemp" : "ec");
        const count = availableResults.filter((item) => getMetricWorkbenchGroup(item.key).key === groupKey).length;

        lenses.push({
          key: `group-${group.key}`,
          kind: "group",
          groupKey: group.key,
          label: group.label,
          icon: group.icon,
          tone: "neutral",
          count,
          disabled: count === 0,
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

    function normalizeActiveSelection(options = {}) {
      // Area is primary context; a stale section must not restore another area.
      const { preferCurrentZone = false } = options;
      const sites = Array.isArray(dashboardData.sites) ? dashboardData.sites : [];
      if (sites.length === 0) {
        activeSiteId = "";
        activeZoneId = "";
        return { site: null, zone: null };
      }

      const siteContainingActiveZone = preferCurrentZone && activeZoneId
        ? sites.find((site) => (site.zones || []).some((zone) => zone.id === activeZoneId))
        : null;
      const selectedSite = sites.find((site) => site.id === activeSiteId) || null;
      const fallbackSite = sites.find((site) => (site.zones || []).length > 0) || sites[0] || null;
      const site = siteContainingActiveZone || selectedSite || fallbackSite;

      if (!site) {
        activeSiteId = "";
        activeZoneId = "";
        return { site: null, zone: null };
      }

      activeSiteId = site.id;
      const zones = Array.isArray(site.zones) ? site.zones : [];
      if (zones.length === 0) {
        activeZoneId = "";
        return { site, zone: null };
      }

      const zone = zones.find((item) => item.id === activeZoneId) || zones[0];
      activeZoneId = zone.id;
      return { site, zone };
    }

    function selectLowestScoreContext() {
      const snapshots = getContextMenuSnapshots();
      const siteCandidates = dashboardData.sites
        .filter((site) => Array.isArray(site.zones) && site.zones.length > 0)
        .map((site) => {
          const siteSnapshots = snapshots.filter((snapshot) => snapshot.site.id === site.id);
          const score = deriveSiteOverallState(siteSnapshots).indexScore;
          return { site, score: Number.isFinite(score) ? score : Number.POSITIVE_INFINITY, siteSnapshots };
        })
        .sort((left, right) => left.score - right.score || left.site.name.localeCompare(right.site.name));

      const selectedSite = siteCandidates[0]?.site || null;
      if (!selectedSite) {
        activeSiteId = "";
        activeZoneId = "";
        return;
      }

      const selectedZone = [...siteCandidates[0].siteSnapshots]
        .filter((snapshot) => Number.isFinite(snapshot.overall?.indexScore))
        .sort((left, right) => left.overall.indexScore - right.overall.indexScore || left.zone.name.localeCompare(right.zone.name))[0]?.zone
        || selectedSite.zones[0];

      activeSiteId = selectedSite.id;
      activeZoneId = selectedZone?.id || "";
      activeProfileKey = selectedZone?.profile || activeProfileKey;
      activeViewScope = "zone";
    }

    function getActiveSite() {
      return normalizeActiveSelection().site;
    }

    function getActiveZone(site = getActiveSite()) {
      if (!site || !Array.isArray(site.zones) || site.zones.length === 0) return null;

      const zone = site.zones.find((item) => item.id === activeZoneId) || site.zones[0];
      activeZoneId = zone.id;
      return zone;
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
      if (isApiDataMode()) {
        hydrateDashboardFromApi();
        return;
      }

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

    function snapshotHasLiveGrowthData(snapshot) {
      // The dashboard endpoint already provides the canonical score for every
      // Section, even when only the active Section has fetched live readings.
      if (snapshot?.overall?.source === "backend" && Number.isFinite(snapshot.overall.indexScore)) {
        return true;
      }
      return Boolean(snapshot?.results?.some((result) =>
        result.available !== false && isGrowthMetricKey(result.key)
      ));
    }

    let enhancedSelectId = 0;

    function getEnhancedSelectOptionScore(select, value, snapshots) {
      if (!value || value === "all") return null;

      const areaSelectNames = new Set([
        "blockSiteId",
        "nodeSiteId",
        "nodeFilterSiteId",
        "modalNodeSiteId",
        "modalLocationMoveTarget",
        "modalBlockSiteId"
      ]);
      const sectionSelectNames = new Set([
        "nodeZoneId",
        "nodeFilterZoneId",
        "modalNodeSectionId"
      ]);
      const isAreaSelect = areaSelectNames.has(select.name) || select.hasAttribute("data-block-filter-select");

      if (isAreaSelect) {
        const site = dashboardData.sites.find((item) => item.id === value);
        if (!site) return null;
        const siteSnapshots = snapshots.filter((snapshot) => snapshot.site.id === site.id);
        const liveSiteSnapshots = siteSnapshots.filter(snapshotHasLiveGrowthData);
        return getContextScoreSummary(
          liveSiteSnapshots.length > 0 ? deriveSiteOverallState(liveSiteSnapshots) : null
        );
      }

      let zoneId = value;
      let siteId = "";
      if (!sectionSelectNames.has(select.name)) {
        return null;
      }

      const snapshot = snapshots.find((item) =>
        item.zone.id === zoneId && (!siteId || item.site.id === siteId)
      );
      return getContextScoreSummary(snapshotHasLiveGrowthData(snapshot) ? snapshot?.overall : null);
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

    function setEnhancedSelectOpen(wrapper, isOpen, { restoreFocus = false } = {}) {
      if (!wrapper) return;
      const trigger = wrapper.querySelector("[data-nc-select-trigger]");
      const menu = wrapper.querySelector("[data-nc-select-menu]");
      wrapper.dataset.open = String(Boolean(isOpen));
      if (trigger) trigger.setAttribute("aria-expanded", String(Boolean(isOpen)));
      if (menu) menu.hidden = !isOpen;
      if (!isOpen && restoreFocus && trigger instanceof HTMLElement) trigger.focus();
    }

    function focusEnhancedSelectOption(wrapper, direction = "selected") {
      const options = Array.from(wrapper?.querySelectorAll("[data-nc-select-option]:not(:disabled)") || []);
      if (options.length === 0) return;
      const selectedIndex = Math.max(0, options.findIndex((option) => option.getAttribute("aria-selected") === "true"));
      const targetIndex = direction === "first"
        ? 0
        : direction === "last"
          ? options.length - 1
          : direction === "next"
            ? Math.min(options.length - 1, selectedIndex + 1)
            : direction === "previous"
              ? Math.max(0, selectedIndex - 1)
              : selectedIndex;
      options[targetIndex]?.focus();
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
      if (trigger) {
        trigger.disabled = select.disabled;
        trigger.setAttribute("aria-label", selectedOption?.textContent?.trim() || "Select option");
      }
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
            aria-controls="${escapeAttribute(selectId)}-menu"
            aria-label="${escapeAttribute(selectedOption?.textContent?.trim() || "Select option") }"
            ${select.disabled ? "disabled" : ""}
          >
            <span class="nc-select-trigger-label" data-nc-select-label>${escapeHtml(selectedOption?.textContent?.trim() || "")}</span>
            <span class="nc-select-trigger-end">
              <span data-nc-select-trigger-score>${renderEnhancedSelectScore(selectedScore)}</span>
              <i class="fa-solid fa-chevron-down nc-select-chevron" aria-hidden="true"></i>
            </span>
          </button>
          <span id="${escapeAttribute(selectId)}-menu" class="context-menu nc-select-menu" data-nc-select-menu role="listbox" hidden>
            ${menuOptions}
          </span>
        `);
      });

      root.querySelectorAll("select[data-nc-select-enhanced]").forEach((select) => {
        if (select instanceof HTMLSelectElement) syncEnhancedSelect(select, snapshots);
      });
    }

    function rebuildEnhancedSelect(select) {
      const wrapper = select?.closest(".nc-select");
      if (wrapper?.parentNode) {
        wrapper.parentNode.insertBefore(select, wrapper);
        wrapper.remove();
      }

      select.removeAttribute("data-nc-select-enhanced");
      select.classList.remove("nc-select-native");
      enhanceDashboardSelects(select.parentElement || elements.managementModalOverlay);
    }

    function renderSiteOptions(snapshots = null) {
      normalizeActiveSelection();
      const contextSnapshots = snapshots || getContextMenuSnapshots();

      elements.siteMenu.innerHTML = dashboardData.sites.map((site) => {
        const siteSnapshots = contextSnapshots.filter((snapshot) => snapshot.site.id === site.id);
        const liveSiteSnapshots = siteSnapshots.filter(snapshotHasLiveGrowthData);
        const score = getContextScoreSummary(
          liveSiteSnapshots.length > 0 ? deriveSiteOverallState(liveSiteSnapshots) : null
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
      const { site } = normalizeActiveSelection();
      if (!site || !Array.isArray(site.zones) || site.zones.length === 0) {
        activeZoneId = "";
        elements.zoneMenu.innerHTML = "";
        return;
      }

      const contextSnapshots = snapshots || getContextMenuSnapshots();
      elements.zoneMenu.innerHTML = site.zones.map((zone) => {
        const snapshot = contextSnapshots.find((item) =>
          item.site.id === site.id && item.zone.id === zone.id
        );
        const score = getContextScoreSummary(snapshotHasLiveGrowthData(snapshot) ? snapshot?.overall : null);
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
      const icon = managementNotice.tone === "warning" ? "fa-triangle-exclamation" : "fa-circle-check";

      return `
        <div class="management-feedback mt-4 rounded-[22px] px-4 py-3 text-sm font-semibold ${toneClass}" role="${managementNotice.tone === "warning" ? "alert" : "status"}" aria-live="polite">
          <i class="fa-solid ${icon}" aria-hidden="true"></i>
          <span>${escapeHtml(managementNotice.text)}</span>
        </div>
      `;
    }

    function renderLocationsManagementPage(globalSnapshots) {
      const locations = dashboardData.sites.filter((site) => !isUnassignedLocation(site));
      const areaFeature = window.NeuroCropFeatures.areas;
      const areaSummary = areaFeature.buildAreasSummary(locations, globalSnapshots);
      const totalLocations = areaSummary.areaCount;
      if (totalLocations === 0) {
        const emptyCopy = areaFeature.emptyAreasCopy;
        locationFormState = {
          ...locationFormState,
          mode: "create",
          editingId: null
        };
        elements.locationsManagementShell.innerHTML = `
          <div class="surface rounded-[34px] p-6 md:p-8">
            <form data-management-form="location" class="max-w-5xl">
              <p class="text-[11px] uppercase tracking-[0.28em] text-pine/56">${escapeHtml(emptyCopy.eyebrow)}</p>
              <h2 class="mt-2 font-display text-3xl font-bold text-ink">${escapeHtml(emptyCopy.title)}</h2>
              <p class="mt-3 max-w-2xl text-sm leading-7 text-ink/66">${escapeHtml(emptyCopy.description)}</p>
              <div class="mt-6 flex flex-col gap-3 md:flex-row">
                <input name="locationName" value="${escapeAttribute(locationFormState.name)}" placeholder="Greenhouse No. 1" class="min-h-[58px] flex-1 rounded-[22px] border border-black/10 bg-white px-5 text-base font-semibold outline-none transition focus:border-pine/45 focus:ring-4 focus:ring-pine/10">
                <button type="submit" class="inline-flex min-h-[58px] items-center justify-center rounded-[22px] bg-pine px-6 text-base font-bold text-white shadow-soft transition hover:-translate-y-0.5">
                  <i class="fa-solid fa-location-dot mr-2" aria-hidden="true"></i>
                  Create area
                </button>
              </div>
            </form>
          </div>
        `;
        return;
      }
      const totalBlocks = areaSummary.sectionCount;
      const totalNodes = areaSummary.nodeCount;
      const activeAlertCount = areaSummary.attentionCount;
      const locationRows = locations.map((site) => {
        const siteSnapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === site.id);
        const siteState = siteSnapshots.length > 0 ? deriveSiteOverallState(siteSnapshots) : null;
        const stateKey = siteState?.state || "neutral";
        const rowStateKey = (site.zones || []).length === 0 ? "neutral" : stateKey;
        const blockCount = (site.zones || []).length;
        const nodeCount = getSiteNodeCount(site);
        const lowBatteryCount = (site.zones || []).reduce((sum, zone) => {
          const definition = cropProfiles[zone.profile]?.metrics?.batteryLevel;
          return definition ? sum + getLowBatteryNodes(zone, definition).length : sum;
        }, 0);
        const profiles = getSiteProfileNames(site);
        const activeSiteIssueCount = siteSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;
        const summary = blockCount === 0
          ? "No sections exist yet. Create the first monitored section before opening live monitoring."
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
              <span class="management-chip" data-tone="${blockCount > 0 ? stateKey : "neutral"}">
                ${escapeHtml(blockCount > 0 ? stateConfig[stateKey].label : "No sections yet")}
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

      const areaFormCopy = areaFeature.getAreaFormCopy(locationFormState.mode);
      const locationFormButtonLabel = areaFormCopy.buttonLabel;
      const locationFormTitle = areaFormCopy.title;
      const locationFormSummary = areaFormCopy.summary;

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
              Sections are created inside a saved area, so the next step is the Sections page.
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
      const sectionFeature = window.NeuroCropFeatures.sections;
      const locationOptions = dashboardData.sites.filter((site) => !isUnassignedLocation(site));
      const unassignedSite = dashboardData.sites.find((site) => isUnassignedLocation(site)) || null;
      const blockSites = unassignedSite ? [...locationOptions, unassignedSite] : locationOptions;
      const filteredSites = blockSites.filter((site) => site.id === activeSiteId);
      const scopedSections = sectionFeature.getSectionsForArea(blockSites, activeSiteId, globalSnapshots);
      const blockEntries = scopedSections.map(({ area: site, section: zone, snapshot }) => {
          const profile = cropProfiles[zone.profile];
          const batteryDefinition = profile?.metrics?.batteryLevel || null;
          const lowBatteryCount = batteryDefinition ? getLowBatteryNodes(zone, batteryDefinition).length : 0;
          const installedGrowthCount = (zone.availableMetrics || []).filter((key) => isGrowthMetricKey(key)).length;
          const totalGrowthCount = (zone.configuredMetrics || zone.availableMetrics || []).filter((key) => isGrowthMetricKey(key)).length;

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
        });

      const sectionSummary = sectionFeature.summarizeSections(scopedSections);
      const filteredBlockCount = sectionSummary.sectionCount;
      const filteredNodeCount = sectionSummary.nodeCount;
      const filteredAlertCount = sectionSummary.attentionCount;
      const filteredLowBatteryCount = blockEntries.reduce((sum, row) => sum + row.lowBatteryCount, 0);
      const sectionFormCopy = sectionFeature.getSectionFormCopy(blockFormState.mode);
      const blockFormTitle = sectionFormCopy.title;
      const blockFormSummary = sectionFormCopy.summary;
      const blockFormButtonLabel = sectionFormCopy.buttonLabel;
      const emptyState = sectionFeature.getEmptySectionsTitle(filteredSites[0]?.name);
      const activeFilterLabel = filteredSites[0]?.name || "Selected area";

      const blockList = filteredBlockCount > 0
        ? blockEntries.map((row) => {
            const score = row.snapshot ? `${row.snapshot.overall.indexScore}%` : "--";
            const stateKey = row.isUnassigned ? "warning" : (row.snapshot?.overall.state || "optimal");
            const summary = row.lowBatteryCount > 0
              ? `${row.lowBatteryCount} node${row.lowBatteryCount === 1 ? " is" : "s are"} below the battery watch threshold.`
              : row.installedGrowthCount < row.totalGrowthCount
                ? `${row.installedGrowthCount}/${row.totalGrowthCount} configured metrics are reporting.`
                : (row.zone.batteryNodes || []).length === 0
                  ? "Structure is ready, but no nodes are attached yet."
                  : "Ready for live monitoring.";
            const coverageLabel = row.totalGrowthCount > 0
              ? `${row.installedGrowthCount}/${row.totalGrowthCount} reporting`
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
              <p class="mt-3 max-w-2xl text-sm leading-7 text-ink/66">Create the first section using the form above, then assign its nodes on the Nodes page.</p>
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
                  Create an area first. After that, this becomes the main form for registering monitored sections.
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
                      <span class="text-sm font-semibold text-ink/72">Site</span>
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
                        ${getVisibleCropProfileEntries().map(([profileKey, profile]) => `
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

            <div class="mt-3 rounded-[20px] bg-[#f8f3ea] px-4 py-2.5 text-sm leading-6 text-ink/66">
              Showing zones in <strong>${escapeHtml(activeFilterLabel)}</strong>. Change the Site in the global header to manage another site.
            </div>
          </div>

          <div class="surface rounded-[34px] p-6 md:p-7">
            <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.24em] text-pine/56">Current zones</p>
                <h3 class="mt-2 font-display text-2xl font-bold text-ink">${filteredBlockCount} zone${filteredBlockCount === 1 ? "" : "s"} in this view</h3>
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

    function getNodeDetectedSensorNames(node) {
      return window.NeuroCropFeatures.nodes.getDetectedSensorNames(node);
    }

    function getNodeHealthSummary(node, freshness) {
      return window.NeuroCropFeatures.nodes.getHealthSummary(node, freshness || {});
    }

    function getNodeFaultDiagnostics(node) {
      const flagLabels = {
        tx_timeout: "TX timeout flag active",
        last_tx_failed: "Last transmission failed",
        watchdog_reset: "Watchdog reset reported",
        join_backoff: "Network join backoff active",
        boot_fault: "Boot fault reported"
      };
      const counterLabels = {
        tx_fail: "transmission failures",
        read_fail: "sensor read failures",
        reinit: "sensor reinitialisations"
      };
      const flags = Object.entries(node.errorFlags || {})
        .filter(([, active]) => active)
        .map(([key]) => flagLabels[key] || key);
      const hasCounters = Boolean(node.errorCounters && typeof node.errorCounters === "object");
      const counters = Object.entries(node.errorCounters || {})
        .filter(([, value]) => Number(value) > 0)
        .map(([key, value]) => `${value} ${counterLabels[key] || key}`);
      const txFailures = Number(node.errorCounters?.tx_fail);
      return {
        flags,
        counters,
        hasCounters,
        txFailures: Number.isFinite(txFailures) ? txFailures : null
      };
    }

    function getNodeDiagnosticsNextCheck(diagnostics) {
      if (diagnostics.flags.includes("TX timeout flag active")) {
        return "Check LoRaWAN TX completion, duty-cycle queue and radio logs.";
      }
      if (diagnostics.counters.some((item) => item.endsWith("sensor reinitialisations"))) {
        return "Check sensor connection, I2C bus and power stability.";
      }
      if (diagnostics.flags.length || diagnostics.counters.length) {
        return "Review firmware logs and the next uplink.";
      }
      return "No diagnostic action required.";
    }

    function formatNodeSignal(node) {
      return window.NeuroCropFeatures.nodes.formatSignal(node);
    }

    function getNodeReportingModeLabel(profile) {
      return window.NeuroCropFeatures.nodes.getReportingModeLabel(profile);
    }

    function renderNodeDetailPage(record) {
      if (!record) {
        elements.nodesManagementShell.innerHTML = `
          <div class="node-detail-page">
            <button type="button" class="node-detail-back" data-node-list-back><i class="fa-solid fa-chevron-left" aria-hidden="true"></i>Nodes</button>
            <section class="node-detail-empty"><h2>Node not found</h2><p>This node is no longer available in the current workspace.</p></section>
          </div>
        `;
        return;
      }

      const { node, site, zone } = record;
      const nodeName = node.name && node.name !== node.id ? node.name : node.id;
      const freshness = getNodeFreshness(node, zone) || { transportStatus: "offline", ageSec: null };
      const health = getNodeHealthSummary(node, freshness);
      const sensors = getNodeDetectedSensorNames(node);
      const diagnostics = getNodeFaultDiagnostics(node);
      const lastPayload = formatNodeLastPayload(node, freshness);
      const battery = Number.isFinite(node.level) ? Number(node.level) : null;
      const statusLabel = freshness.transportStatus === "offline"
        ? "Offline"
        : health.tone === "critical"
          ? "Fault"
          : health.tone === "warning"
            ? "Watch"
            : "Healthy";
      const statusTone = freshness.transportStatus === "offline" ? "offline" : health.tone;
      const statusTitle = freshness.transportStatus === "offline"
        ? "No recent uplink"
        : health.tone === "optimal"
          ? "Reporting normally"
          : "Device diagnostics require review";
      const readFailures = Number.isFinite(Number(node.errorCounters?.read_fail)) ? Number(node.errorCounters.read_fail) : "Unavailable";
      const transmitFailures = Number.isFinite(Number(node.errorCounters?.tx_fail)) ? Number(node.errorCounters.tx_fail) : "Unavailable";
      const resetFlags = node.errorFlags || {};
      const resetReasons = [];
      if (resetFlags.watchdog_reset) resetReasons.push("Watchdog reset");
      if (resetFlags.tx_timeout) resetReasons.push("Transmission timeout recovery");
      if (resetFlags.boot_fault) resetReasons.push("Boot initialization fault");
      const resetReason = resetReasons.join(" · ");

      elements.nodesManagementShell.innerHTML = `
        <div class="node-detail-page">
          <nav class="node-detail-breadcrumbs" aria-label="Breadcrumb">
            <button type="button" data-node-list-back>Nodes</button><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span>${escapeHtml(nodeName)}</span>
          </nav>
          <header class="node-detail-head">
            <div><p>${escapeHtml(node.devEui || node.id)}</p><h2>${escapeHtml(nodeName)}</h2><span>${escapeHtml(`${site.name} · ${zone.name}`)}</span></div>
            <div class="node-detail-actions">
              <button type="button" class="node-detail-secondary-action actionable" data-node-edit-site-id="${escapeAttribute(site.id)}" data-node-edit-zone-id="${escapeAttribute(zone.id)}" data-node-edit-id="${escapeAttribute(node.id)}"><i class="fa-solid fa-pen" aria-hidden="true"></i>Edit node</button>
            </div>
          </header>
          <section class="node-detail-overview">
            <div class="node-detail-health">
              <span class="node-detail-orbit" data-tone="${escapeAttribute(statusTone)}"><i class="fa-solid fa-microchip" aria-hidden="true"></i></span>
              <div><span class="node-detail-status" data-tone="${escapeAttribute(statusTone)}"><i class="fa-solid fa-circle" aria-hidden="true"></i>${escapeHtml(statusLabel)}</span><h3>${escapeHtml(statusTitle)}</h3><p>Last payload ${escapeHtml(lastPayload.relative)}</p></div>
            </div>
            <div class="node-detail-facts">
              <div><small>Battery</small><strong>${battery === null ? "—" : `${battery}%`}</strong><span class="node-detail-track"><i style="width:${battery === null ? 0 : battery}%"></i></span>${Number.isFinite(node.batteryMv) ? `<p>${escapeHtml((node.batteryMv / 1000).toFixed(2))} V</p>` : ""}</div>
              <div><small>Signal</small><strong>${Number.isFinite(node.rssi) ? `${escapeHtml(String(node.rssi))} dBm` : "—"}</strong><p>${Number.isFinite(node.snr) ? `SNR ${escapeHtml(String(node.snr))}` : "SNR unavailable"}${Number.isFinite(node.spreadingFactor) ? ` · SF${escapeHtml(String(node.spreadingFactor))}` : ""}</p></div>
              <div><small>Reporting mode</small><strong>${escapeHtml(getNodeReportingModeLabel(node.profile))}</strong><p>${escapeHtml(freshness.transportStatus === "live" ? "Live uplink" : statusLabel)}</p></div>
            </div>
          </section>
          <div class="node-detail-columns">
            <section class="node-detail-section">
              <header><p>Hardware</p><h3>Installed sensors</h3></header>
              <div class="node-detail-sensors">
                ${sensors.length ? sensors.map((sensor, index) => `<div><span><i class="fa-solid ${index % 2 ? "fa-temperature-half" : "fa-wave-square"}" aria-hidden="true"></i></span><div><strong>${escapeHtml(sensor)}</strong><small>Detected · Port ${index + 1}</small></div><span class="node-detail-status" data-tone="optimal"><i class="fa-solid fa-circle" aria-hidden="true"></i>Active</span></div>`).join("") : `<p class="node-detail-muted">No sensor presence information was reported.</p>`}
              </div>
            </section>
            <section class="node-detail-section">
              <header><p>Diagnostics</p><h3>Latest device report</h3></header>
              <dl class="node-detail-diagnostics">
                <div><dt>Firmware</dt><dd>${escapeHtml(node.firmwareVersion || "Unavailable")}</dd></div>
                ${resetReason ? `<div><dt>Reset status</dt><dd>${escapeHtml(resetReason)}</dd></div>` : ""}
                <div><dt>Read failures</dt><dd>${escapeHtml(String(readFailures))}</dd></div>
                <div><dt>Transmit failures</dt><dd>${escapeHtml(String(transmitFailures))}</dd></div>
                <div><dt>Last payload</dt><dd>${escapeHtml(lastPayload.absolute)}</dd></div>
                ${diagnostics.flags.length ? `<div><dt>Fault flags</dt><dd>${escapeHtml(diagnostics.flags.join(" · "))}</dd></div>` : ""}
              </dl>
            </section>
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
      if (activeNodeDetailId) {
        const detailRecord = nodes.find(({ node }) =>
          [node.id, node.devEui].some((value) => String(value || "").toLowerCase() === String(activeNodeDetailId).toLowerCase())
        );
        renderNodeDetailPage(detailRecord);
        return;
      }
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
      const filteredNodes = nodes.filter(({ node, site, zone }) => {
        const matchesScope = (activeNodeFilterSiteId === "all" || site.id === activeNodeFilterSiteId)
          && (activeNodeFilterZoneId === "all" || zone.id === activeNodeFilterZoneId);
        const searchValue = [node.name, node.id, node.devEui, site.name, zone.name].filter(Boolean).join(" ").toLowerCase();
        const freshness = getNodeFreshness(node, zone);
        const health = getNodeHealthSummary(node, freshness);
        const nodeState = freshness.transportStatus === "offline"
          ? "offline"
          : health.tone === "critical" || health.tone === "warning"
            ? "fault"
            : "healthy";
        const matchesState = activeNodeStateFilter === "all" || activeNodeStateFilter === nodeState;
        return matchesScope && matchesState && (!activeNodeSearchQuery || searchValue.includes(activeNodeSearchQuery));
      });
      const lowBatteryNodes = getSystemLowBatteryNodes();

      const reportingNodes = nodes.filter(({ node }) =>
        freshnessByNodeId.get(node.id)?.transportStatus === "live"
      ).length;
      const offlineNodes = nodes.filter(({ node }) =>
        freshnessByNodeId.get(node.id)?.transportStatus === "offline"
      ).length;
      const faultNodes = nodes.filter(({ node }) => {
        const health = getNodeHealthSummary(node, freshnessByNodeId.get(node.id));
        return health.tone === "critical" || health.tone === "warning";
      }).length;

      const nodeRows = filteredNodes.length > 0
        ? filteredNodes.map(({ node, site, zone }) => {
            const definition = cropProfiles[zone.profile]?.metrics?.batteryLevel;
            const state = Number.isFinite(node.level) && definition ? getBatteryNodeState(node.level, definition) : "neutral";
            const nodeName = node.name && node.name !== node.id ? node.name : node.id;
            const freshness = freshnessByNodeId.get(node.id) || { transportStatus: "offline", ageSec: null };
            const lastPayload = formatNodeLastPayload(node, freshness);
            const health = getNodeHealthSummary(node, freshness);
            const batteryText = Number.isFinite(node.level)
              ? `${freshness.transportStatus === "offline" ? "Last " : ""}${node.level}%`
              : "Battery unknown";
            const statusLabel = freshness.transportStatus === "offline"
              ? "Offline"
              : health.tone === "critical"
                ? "Fault"
                : health.tone === "warning"
                  ? "Watch"
                  : "Healthy";
            const statusTone = freshness.transportStatus === "offline" ? "offline" : health.tone;
            const tableTone = statusTone === "optimal" ? "good" : statusTone === "warning" ? "watch" : statusTone;

            return `
              <tr data-node-search-value="${escapeAttribute([nodeName, node.id, node.devEui, site.name, zone.name].filter(Boolean).join(" ").toLowerCase())}">
                <td><button type="button" class="nc-node-identity" data-node-open-id="${escapeAttribute(node.id)}"><strong>${escapeHtml(nodeName)}</strong><small>${escapeHtml(node.devEui || node.id)}</small></button></td>
                <td><strong>${escapeHtml(zone.name)}</strong><small>${escapeHtml(site.name)}</small></td>
                <td><span class="nc-status-new ${escapeAttribute(tableTone)}"><span class="nc-state-dot ${escapeAttribute(tableTone)}"></span>${escapeHtml(statusLabel)}</span></td>
                <td><span class="nc-node-battery ${state === "critical" || state === "warning" ? "is-low" : ""}"><i class="fa-solid ${Number(node.level) < 25 ? "fa-battery-quarter" : "fa-battery-three-quarters"}" aria-hidden="true"></i>${escapeHtml(batteryText)}</span></td>
                <td>${Number.isFinite(node.rssi) ? `${escapeHtml(String(node.rssi))} dBm` : "—"}</td>
                <td>${escapeHtml(lastPayload.relative)}</td>
                <td><button type="button" class="nc-row-arrow" data-node-open-id="${escapeAttribute(node.id)}" aria-label="Open ${escapeAttribute(nodeName)} details"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></td>
              </tr>
            `;
          }).join("")
        : `
            <tr><td colspan="7" class="nc-node-empty">${nodes.length > 0 ? "No nodes match these filters." : "No nodes registered yet."}</td></tr>
          `;

      elements.nodesManagementShell.innerHTML = `
        <div class="node-fleet-page">
          <header class="node-fleet-page-head">
            <div><p>Device fleet</p><h2>Sensor nodes</h2><span>Hardware availability, battery, signal, installed sensors, and latest uplink freshness.</span></div>
            <button type="button" class="node-fleet-primary-action actionable" data-node-register-jump><i class="fa-solid fa-plus" aria-hidden="true"></i>Register node</button>
          </header>

          <section class="node-fleet-stats" aria-label="Node fleet status">
            <div><span data-tone="optimal"><i class="fa-solid fa-signal" aria-hidden="true"></i></span><strong>${reportingNodes}</strong><small>Online</small></div>
            <div><span data-tone="warning"><i class="fa-solid fa-battery-quarter" aria-hidden="true"></i></span><strong>${lowBatteryNodes.length}</strong><small>Low battery</small></div>
            <div><span data-tone="critical"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span><strong>${faultNodes}</strong><small>Faults</small></div>
            <div><span data-tone="offline"><i class="fa-solid fa-link-slash" aria-hidden="true"></i></span><strong>${offlineNodes}</strong><small>Offline</small></div>
          </section>

          ${renderManagementNotice("nodes")}

          <section class="nc-node-list">
            <div class="nc-list-toolbar">
              <label class="nc-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input name="nodeSearch" value="${escapeAttribute(activeNodeSearchQuery)}" placeholder="Search name, DevEUI or section"></label>
              <div class="nc-toolbar-selects">
                <label class="block">
                  <span class="sr-only">Filter by area</span>
                  <select name="nodeFilterSiteId">
                    <option value="all" ${activeNodeFilterSiteId === "all" ? "selected" : ""}>All areas</option>
                    ${filterLocations.map((site) => `<option value="${escapeAttribute(site.id)}" ${activeNodeFilterSiteId === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("")}
                  </select>
                </label>
                <label class="block">
                  <span class="sr-only">Filter by state</span>
                  <select name="nodeStateFilter">
                    <option value="all" ${activeNodeStateFilter === "all" ? "selected" : ""}>All states</option>
                    <option value="healthy" ${activeNodeStateFilter === "healthy" ? "selected" : ""}>Healthy</option>
                    <option value="fault" ${activeNodeStateFilter === "fault" ? "selected" : ""}>Fault</option>
                    <option value="offline" ${activeNodeStateFilter === "offline" ? "selected" : ""}>Offline</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="nc-data-table-wrap">
              <table class="nc-data-table nc-node-table">
                <thead><tr><th>Node</th><th>Location</th><th>State</th><th>Battery</th><th>Signal</th><th>Last payload</th><th></th></tr></thead>
                <tbody>${nodeRows}</tbody>
              </table>
            </div>
          </section>
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
        const form = target.closest('[data-management-modal-form="node-register"], [data-management-form="node"]');
        const sectionSelect = form?.querySelector('[name="nodeZoneId"]');
        if (sectionSelect instanceof HTMLSelectElement) {
          const sections = site?.zones || [];
          sectionSelect.innerHTML = sections.length > 0
            ? sections.map((zone) => `<option value="${escapeAttribute(zone.id)}">${escapeHtml(zone.name)}</option>`).join("")
            : `<option value="">No sections in this area</option>`;
          sectionSelect.disabled = sections.length === 0;
          rebuildEnhancedSelect(sectionSelect);
        }
        return;
      }

      if (target instanceof HTMLSelectElement && target.name === "nodeZoneId") {
        nodeFormState.zoneId = target.value;
      }
    }

    async function submitNodeForm() {
      const site = dashboardData.sites.find((item) => item.id === nodeFormState.siteId);
      const zone = (site?.zones || []).find((item) => item.id === nodeFormState.zoneId);
      const registeredDevEui = nodeFormState.devEui;
      if (!site || !zone) {
        setManagementModalError("Choose the Area and Section where this node is installed.");
        return;
      }

      if (!isApiDataMode() && !window.NeuroCropStore?.registerNode) {
        setManagementModalError("Node registration is unavailable until the data store is connected.");
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
        closeManagementModal();
        setManagementNotice("nodes", `Node ${registeredDevEui} registered in ${zone.name}. It will appear here when sensor readings begin arriving.`);
        renderDashboard();
      } catch (error) {
        const message = error instanceof Error ? error.message : "The node could not be registered.";
        const friendlyMessage = /Cannot POST \/nodes\/register/i.test(message)
          ? "Node registration API is not deployed yet. Backend needs POST /nodes/register before this can save to the database."
          : message;
        setManagementModalError(friendlyMessage);
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

    const CROP_PROFILE_METRIC_GROUPS = [
      { id: "climate", label: "Climate", note: "Air environment and light", metrics: ["airTemp", "humidity", "co2", "lux", "airPressure"] },
      { id: "root-zone", label: "Root zone", note: "Substrate and nutrient solution", metrics: ["soilTemp", "soilMoisture", "ec", "soilEc", "ph"] },
      { id: "plant-irrigation", label: "Plant & irrigation", note: "Plant response and water circuit", metrics: ["vpd", "leafTemp", "waterTemp"] }
    ];

    function getProfileAssignments(profileKey) {
      return dashboardData.sites.flatMap((site) => (site.zones || [])
        .filter((zone) => zone.profile === profileKey)
        .map((zone) => ({ areaName: site.name, sectionName: zone.name })));
    }



    function getProfileSaveFeedbackText(feedback) {
      const profileName = feedback.profileKey === "default"
        ? diagnosticText("Default", "Numatytasis")
        : feedback.profileName;
      return diagnosticText(
        `${profileName} targets saved. Scores, alerts, and history now use these ranges.`,
        `Profilio „${profileName}“ ribos išsaugotos. Augimo įvertis, įspėjimai ir istorija dabar naudoja šias ribas.`
      );
    }

    function renderCropProfileEditor(profileKey, profile) {
      profile = getCompleteCropProfile(profile);
      const draft = settingsProfileEditorDrafts[profileKey] || null;
      const draftMetrics = draft?.metrics || {};
      const profileUsageCount = getProfileUsageCounts()[profileKey] || 0;
      const assignments = getProfileAssignments(profileKey);
      const saveFeedback = profileSaveFeedback.profileKey === profileKey
        ? profileSaveFeedback
        : null;
      const metricRows = (metricKeys) => metricKeys
        .filter((metricKey) => metricKey !== "batteryLevel" && profile.metrics[metricKey])
        .map((metricKey) => {
          const metric = profile.metrics[metricKey];
          const metricDraft = draftMetrics[metricKey];
          const rangeValues = getProfileEditorRangeValues(metricDraft || metric);
          const automaticRanges = deriveAutomaticAlertRanges({ ...(metricDraft || metric), metricKey }, [rangeValues.optimalMin, rangeValues.optimalMax]);
          const step = metric.decimals === 0 ? "1" : "0.01";
          const optimalInput = (label, value, bound) => `
            <label class="block min-w-0">
              <span class="sr-only">${escapeHtml(`${metric.label} ${label}`)}</span>
              <input type="number" step="${step}" value="${escapeAttribute(value)}" data-profile-range data-metric-key="${escapeAttribute(metricKey)}" data-range-key="optimal" data-bound="${bound}" aria-label="${escapeAttribute(`${metric.label} ${label}`)}" class="profile-target-input">
            </label>
          `;
          const lightingSchedule = (metricDraft || metric).lightingSchedule || {};
          const lightingScheduleMarkup = metricKey === "lux" ? `
            <div class="crop-profile-lighting-schedule">
              <label><input type="checkbox" data-lighting-schedule="enabled" ${lightingSchedule.enabled === true ? "checked" : ""}> <span>${diagnosticText("Use lighting schedule", "Naudoti apšvietimo grafiką")}</span></label>
              <label><span>${diagnosticText("Lights on", "Šviesos pradžia")}</span><input type="time" value="${escapeAttribute(lightingSchedule.start || "06:00")}" data-lighting-schedule="start"></label>
              <label><span>${diagnosticText("Lights off", "Šviesos pabaiga")}</span><input type="time" value="${escapeAttribute(lightingSchedule.end || "22:00")}" data-lighting-schedule="end"></label>
              <label><span>${diagnosticText("Dark threshold", "Tamsos riba")}</span><input type="number" min="0" step="10" value="${escapeAttribute(lightingSchedule.darkThresholdLux ?? 100)}" data-lighting-schedule="darkThresholdLux"><small>lx</small></label>
            </div>
          ` : "";
          return `
          <div class="crop-profile-metric-row" data-profile-metric-row="${escapeAttribute(metricKey)}">
            <div class="crop-profile-metric-name"><strong>${escapeHtml(metric.label)}</strong><span>${escapeHtml(formatUnit(metric.unit))}</span></div>
            <div class="crop-profile-optimal-inputs">
              ${optimalInput("Optimal minimum", rangeValues.optimalMin, 0)}
              <span>to</span>
              ${optimalInput("Optimal maximum", rangeValues.optimalMax, 1)}
            </div>
            <div class="crop-profile-metric-boundary crop-profile-metric-warning" data-profile-alert-limit="warning" data-metric-key="${escapeAttribute(metricKey)}"><b>Warning</b>${escapeHtml(formatRange(automaticRanges.warning, metric))}</div>
            <div class="crop-profile-metric-boundary crop-profile-metric-critical" data-profile-alert-limit="critical" data-metric-key="${escapeAttribute(metricKey)}"><b>Critical</b>${escapeHtml(formatRange(automaticRanges.critical, metric))}</div>
            ${lightingScheduleMarkup}
          </div>
        `;
        }).join("");

      const groupMarkup = CROP_PROFILE_METRIC_GROUPS.map((group) => {
        const rows = metricRows(group.metrics);
        if (!rows) return "";
        return `<section class="crop-profile-metric-group" aria-labelledby="profileGroup-${group.id}">
          <header><div><h4 id="profileGroup-${group.id}">${group.label}</h4><p>${group.note}</p></div><span>${group.metrics.filter((key) => profile.metrics[key]).length} metrics</span></header>
          <div class="crop-profile-metric-heading"><span>Parameter</span><span>Set target</span><span>Warning limits</span><span>Critical limits</span></div>
          ${rows}
        </section>`;
      }).join("");

      return `
        <form class="crop-profile-editor" data-settings-form="crop-profile-editor" data-profile-key="${escapeAttribute(profileKey)}" data-dirty="false">
          <div class="crop-profile-editor-grid">
            <main class="crop-profile-editor-main">
              <header class="crop-profile-editor-section-head"><div><p>Environment targets</p><h3>Set the optimal growing interval</h3></div><span>Warning and critical limits are calculated automatically</span></header>
              ${groupMarkup}
            </main>
            <aside class="crop-profile-editor-aside">
              <section class="crop-profile-side-section">
                <header><p>Profile details</p><span>Edit the profile identity</span></header>
                <div class="crop-profile-detail-fields">
                  <label><span>Profile name</span><input name="profileEditorName" value="${escapeAttribute(draft?.name ?? profile.name)}"></label>
                  <label><span>Crop</span><input name="profileEditorHeroName" value="${escapeAttribute(draft?.heroName ?? profile.heroName)}"></label>
                  <label><span>Growth stage</span><input name="profileEditorStage" value="${escapeAttribute((draft?.stage ?? profile.stage) || "")}" placeholder="Vegetative"></label>
                </div>
              </section>
              <section class="crop-profile-side-section">
                <header><p>Assignments</p><span>${profileUsageCount} assigned section${profileUsageCount === 1 ? "" : "s"}</span></header>
                ${assignments.length ? `<ul class="crop-profile-assignment-list">${assignments.slice(0, 4).map((assignment) => `<li><span>${escapeHtml(assignment.sectionName)}</span><small>${escapeHtml(assignment.areaName)}</small></li>`).join("")}${assignments.length > 4 ? `<li class="crop-profile-more-assignments">+${assignments.length - 4} more sections</li>` : ""}</ul>` : '<p class="crop-profile-side-empty">This profile is not assigned to a section yet.</p>'}
                <p class="crop-profile-side-note">Saved target changes apply to every assigned section.</p>
              </section>
              <section class="crop-profile-side-section">
                <header><p>Alert calculation</p><span>${Object.keys(profile.metrics).filter(isGrowthMetricKey).length} active metrics</span></header>
                <p class="crop-profile-side-copy">NeuroCrop evaluates each reading against this profile’s optimal range, then derives warning and critical boundaries from the approved target logic.</p>
              </section>
              <section class="crop-profile-side-section crop-profile-management">
                <header><p>Profile management</p><span>${profileKey === "default" ? "Protected default" : "Custom profile"}</span></header>
                <button type="button" class="settings-secondary-button" data-settings-profile-duplicate="${escapeAttribute(profileKey)}"><i class="fa-regular fa-copy" aria-hidden="true"></i> Duplicate profile</button>
                <button type="button" class="crop-profile-delete-button" data-settings-profile-delete="${escapeAttribute(profileKey)}" ${profileUsageCount > 0 || profileKey === "default" ? "disabled" : ""}>Delete profile</button>
                <p>${profileKey === "default" ? "The default profile remains available as a safe starting point." : profileUsageCount > 0 ? "Move assigned sections before deleting this profile." : "Deletion cannot be undone."}</p>
              </section>
            </aside>
          </div>
          <footer class="crop-profile-save-bar">
            <div><strong data-profile-save-state>${diagnosticText("All changes saved", "Visi pakeitimai išsaugoti")}</strong><span>${diagnosticText("Targets are stored in the workspace and used for scoring.", "Ribos saugomos darbo erdvėje ir naudojamos auginimo įverčiui.")}</span></div>
            <div class="crop-profile-save-feedback-slot">${saveFeedback ? `<p class="crop-profile-save-feedback" data-tone="${escapeAttribute(saveFeedback.tone)}" role="status">${escapeHtml(getProfileSaveFeedbackText(saveFeedback))}</p>` : ""}</div>
            <div class="crop-profile-save-actions">
              <div><button type="button" class="crop-profile-discard-button" data-settings-profile-discard="${escapeAttribute(profileKey)}" disabled>Discard changes</button><button type="submit" class="settings-primary-button" data-profile-save disabled>Save changes</button></div>
            </div>
          </footer>
        </form>
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



    function renderSettingsManagementPage(globalSnapshots) {
      const currentSession = getLoginSession();
      const isPlatformAdmin = Boolean(currentSession?.isPlatformAdmin);
      const isAdminPage = activePrimaryPage === "admin";
      if (isAdminPage) activeSettingsPanelKey = "platform";
      const profileEntries = Object.entries(cropProfiles).filter(([profileKey]) => isVisibleSettingsCropProfile(profileKey));
      if (!cropProfiles[activeSettingsProfileKey] || !isVisibleSettingsCropProfile(activeSettingsProfileKey)) {
        activeSettingsProfileKey = profileEntries[0]?.[0] || activeProfileKey;
      }

      const validPanels = new Set(["profiles", "alerts", "team", "workspace", "data", ...(isPlatformAdmin && isAdminPage ? ["platform"] : [])]);
      if (!validPanels.has(activeSettingsPanelKey)) activeSettingsPanelKey = "profiles";
      const apiBackedTeam = Boolean(window.NeuroCropApi?.isConnected());
      if (activeSettingsPanelKey === "team" && apiBackedTeam && teamAccessState.status === "idle") {
        window.setTimeout(hydrateTeamAccess, 0);
      }
      if (activeSettingsPanelKey === "platform" && isPlatformAdmin && platformOrganizationState.status === "idle") {
        window.setTimeout(hydratePlatformOrganizations, 0);
      }
      const teamMembers = apiBackedTeam ? teamAccessState.members : settingsState.team;
      const teamMemberCount = teamMembers.length;
      const canManageTeam = Boolean(["owner", "admin"].includes(currentSession?.role));

      const activeSettingsProfile = cropProfiles[activeSettingsProfileKey]
        ? getCompleteCropProfile(cropProfiles[activeSettingsProfileKey])
        : getCompleteCropProfile(cropProfiles[activeProfileKey]);
      const profileUsageCounts = getProfileUsageCounts();
      const totalSections = dashboardData.sites.reduce((sum, site) => sum + (site.zones || []).length, 0);
      const activeAlertCount = globalSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal").length;

      if (!isVisibleSettingsCropProfile(settingsProfileFormState.sourceProfile)) {
        settingsProfileFormState.sourceProfile = activeSettingsProfileKey;
      }
      const sourceProfileOptions = profileEntries.map(([profileKey, profile]) => `
        <option value="${escapeAttribute(profileKey)}" ${settingsProfileFormState.sourceProfile === profileKey ? "selected" : ""}>${escapeHtml(profile.name)}</option>
      `).join("");
      const settingsPanels = [
        { key: "profiles", icon: "fa-seedling", label: "Crop profiles", note: "Targets and growth stages", count: profileEntries.length },
        ...(isPlatformAdmin && isAdminPage ? [{ key: "platform", icon: "fa-briefcase", label: "Customers", note: "Client workspaces", count: platformOrganizationState.organizations.length }] : []),
        { key: "alerts", icon: "fa-bell", label: "Alerts & notifications", note: "Local browser preferences", count: activeAlertCount },
        { key: "team", icon: "fa-users", label: "Team & access", note: apiBackedTeam ? "API-backed access" : "Local browser list", count: teamMemberCount },
        { key: "workspace", icon: "fa-building", label: "Workspace", note: "Local display preferences", count: "" },
        { key: "data", icon: "fa-database", label: "Data policy", note: "Backend policy reference", count: "" }
      ];

      const profilePanel = `
        <section class="crop-profiles-page" aria-labelledby="settingsProfilesTitle">
          <header class="crop-profiles-page-head">
            <div>
              <nav class="crop-profiles-breadcrumb" aria-label="Breadcrumb"><span>Settings</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><b>Crop profiles</b></nav>
              <h2 id="settingsProfilesTitle">Crop profiles</h2>
              <p>Configure the target environment each crop program uses to evaluate growing conditions.</p>
            </div>
            <div class="crop-profiles-page-actions">
              <span><b>${profileEntries.length}</b> profiles</span><span><b>${totalSections}</b> assigned sections</span>
              <button type="button" class="settings-primary-button" data-settings-create-profile-open><i class="fa-solid fa-plus" aria-hidden="true"></i>Create profile</button>
            </div>
          </header>

          <div class="crop-profile-switcher" role="tablist" aria-label="Crop profiles">
              ${profileEntries.map(([profileKey, profile]) => `
                <button type="button" class="crop-profile-switcher-option" role="tab" aria-selected="${String(activeSettingsProfileKey === profileKey)}" data-settings-profile-key="${escapeAttribute(profileKey)}" data-active="${String(activeSettingsProfileKey === profileKey)}">
                  <span>
                    <strong>${escapeHtml(profile.name)}</strong>
                    <small>${escapeHtml(profile.heroName || "Crop")} · ${escapeHtml(profile.stage || "No stage")}</small>
                  </span>
                  <b>${profileUsageCounts[profileKey] || 0} sections</b>
                </button>
              `).join("")}
          </div>
          <details class="crop-profile-create-drawer" ${settingsProfileFormState.name ? "open" : ""}>
            <summary><span><i class="fa-solid fa-plus" aria-hidden="true"></i>Create crop profile</span><small>Start from a complete target set</small></summary>
            <form data-management-form="settings-profile">
              <label><span>Profile name</span><input name="settingsProfileName" value="${escapeAttribute(settingsProfileFormState.name)}" placeholder="Cucumbers, fruiting" autocomplete="off"></label>
              <label><span>Crop</span><input name="settingsProfileHeroName" value="${escapeAttribute(settingsProfileFormState.heroName)}" placeholder="Cucumber" autocomplete="off"></label>
              <label><span>Growth stage</span><input name="settingsProfileStage" value="${escapeAttribute(settingsProfileFormState.stage)}" placeholder="Fruiting" autocomplete="off"></label>
              <label><span>Copy targets from</span><select name="settingsProfileSource">${sourceProfileOptions}</select></label>
              <button type="submit" class="settings-primary-button">Create profile</button>
            </form>
          </details>
          ${activeSettingsProfile ? renderCropProfileEditor(activeSettingsProfileKey, activeSettingsProfile) : ""}
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
              <p>Invite people to this workspace and give each person an appropriate role.</p>
            </div>
            <span class="settings-summary-pill">${teamMemberCount} users</span>
          </header>
          ${apiBackedTeam ? `
            ${teamAccessState.status === "loading" ? `<div class="settings-policy-note"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><div><strong>Loading team access</strong><p>Retrieving members and pending invitations.</p></div></div>` : ""}
            ${teamAccessState.status === "error" ? `<div class="settings-policy-note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><strong>Team access could not be loaded</strong><p>${escapeHtml(teamAccessState.error)}</p><button type="button" class="settings-text-button mt-2" data-team-refresh>Retry</button></div></div>` : ""}
            ${teamAccessState.status === "ready" ? `
              <div class="settings-team-list">
                ${teamMembers.map((member) => `
                  <div class="settings-team-row">
                    <span class="settings-member-avatar">${escapeHtml(String(member.name || member.email || "?").slice(0, 2).toUpperCase())}</span>
                    <span class="settings-member-copy"><strong>${escapeHtml(member.name || "Unnamed user")}</strong><small>${escapeHtml(member.email || "")}</small></span>
                    <span class="settings-role-pill">${escapeHtml(member.role)}</span>
                  </div>
                `).join("") || `<div class="settings-policy-note"><div><strong>No members found</strong><p>This workspace has no active members yet.</p></div></div>`}
              </div>
              ${canManageTeam && teamAccessState.invitations.length ? `
                <div class="mt-6">
                  <div class="settings-form-title"><i class="fa-solid fa-clock" aria-hidden="true"></i><div><h3>Pending invitations</h3><p>These links expire automatically after seven days.</p></div></div>
                  <div class="settings-team-list mt-3">
                    ${teamAccessState.invitations.map((invitation) => `
                      <div class="settings-team-row">
                        <span class="settings-member-avatar"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
                        <span class="settings-member-copy"><strong>${escapeHtml(invitation.email)}</strong><small>Expires ${escapeHtml(new Date(invitation.expiresAt).toLocaleDateString("en-GB"))}</small></span>
                        <span class="settings-role-pill">${escapeHtml(invitation.role)}</span>
                        <button type="button" class="settings-text-button" data-invitation-revoke="${escapeAttribute(invitation.id)}">Revoke</button>
                      </div>
                    `).join("")}
                  </div>
                </div>
              ` : ""}
              ${canManageTeam ? `<form class="settings-add-member" data-settings-form="team">
                <div class="settings-form-title"><i class="fa-solid fa-user-plus" aria-hidden="true"></i><div><h3>Invite a team member</h3><p>They will set their own password from a secure invitation link.</p></div></div>
                <div class="settings-add-member-fields">
                  <input name="teamEmail" type="email" placeholder="Email address" required>
                  <select name="teamRole"><option value="grower">Grower</option><option value="technician">Technician</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select>
                  <button type="submit" class="settings-primary-button">Create invitation</button>
                </div>
              </form>` : `<div class="settings-policy-note mt-4"><i class="fa-solid fa-lock" aria-hidden="true"></i><div><strong>Read-only access</strong><p>Only workspace owners and admins can create or revoke invitations.</p></div></div>`}
              ${teamAccessState.latestInviteUrl ? `<div class="settings-policy-note mt-4"><i class="fa-solid ${teamAccessState.latestInviteEmailSent ? "fa-paper-plane" : "fa-link"}" aria-hidden="true"></i><div><strong>${teamAccessState.latestInviteEmailSent ? "Invitation email sent" : "Invitation link created"}</strong><p>${teamAccessState.latestInviteEmailSent ? "The person can open the email to accept access. The link below is kept as a backup." : "Email delivery was not confirmed, so use this backup link."}</p><p class="break-all">${escapeHtml(teamAccessState.latestInviteUrl)}</p><button type="button" class="settings-text-button mt-2" data-copy-invitation="${escapeAttribute(teamAccessState.latestInviteUrl)}">Copy backup link</button></div></div>` : ""}
            ` : ""}
          ` : `
            <div class="settings-policy-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><div><strong>Connect the API to manage access</strong><p>Team access is available only when NeuroCrop is connected to its backend.</p></div></div>
          `}
        </section>
      `;

      const formatAdminDate = (value) => value
        ? new Date(value).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
        : "—";
      const platformAdministrators = platformOrganizationState.users.filter((user) => user.isSuperAdmin || user.isPlatformAdmin);
      const nodeDiagnostics = platformOrganizationState.nodeDiagnostics;
      const platformNodeDiagnosticsPanel = nodeDiagnostics.status === "idle" ? "" : (() => {
        const nodes = nodeDiagnostics.nodes;
        const transportCounts = nodes.reduce((counts, node) => {
          const status = node.transportStatus || "offline";
          counts[status] = (counts[status] || 0) + 1;
          return counts;
        }, { live: 0, delayed: 0, stale: 0, offline: 0 });
        const faultNodeCount = nodes.filter((node) => {
          const diagnostics = getNodeFaultDiagnostics(node);
          return diagnostics.flags.length > 0 || diagnostics.counters.length > 0;
        }).length;
        return `
          <section class="admin-section platform-node-diagnostics" aria-labelledby="platformNodeDiagnosticsTitle">
            <header>
              <div><h2 id="platformNodeDiagnosticsTitle">Node diagnostics · ${escapeHtml(nodeDiagnostics.organizationName)}</h2><p>Platform-admin view. Data is loaded on demand and is not visible to organization members.</p></div>
              <button type="button" class="admin-link-button" data-platform-node-diagnostics-close>Close</button>
            </header>
            ${nodeDiagnostics.status === "loading" ? `<p class="admin-status" role="status">Loading node diagnostics…</p>` : ""}
            ${nodeDiagnostics.status === "error" ? `<div class="admin-error" role="alert"><strong>Could not load node diagnostics.</strong><span>${escapeHtml(nodeDiagnostics.error)}</span><button type="button" class="admin-button" data-platform-node-diagnostics="${escapeAttribute(nodeDiagnostics.organizationId)}" data-platform-name="${escapeAttribute(nodeDiagnostics.organizationName)}">Retry</button></div>` : ""}
            ${nodeDiagnostics.status === "ready" ? `
              <div class="platform-node-summary" aria-label="Node health summary">
                <span data-state="live"><strong>${transportCounts.live}</strong>Live</span>
                <span data-state="delayed"><strong>${transportCounts.delayed + transportCounts.stale}</strong>Delayed</span>
                <span data-state="offline"><strong>${transportCounts.offline}</strong>Offline</span>
                <span data-state="warning"><strong>${faultNodeCount}</strong>Fault flags</span>
              </div>
              <div class="admin-table-wrap">
                <table class="admin-table platform-node-table">
                  <thead><tr><th>Node</th><th>Location</th><th>Transport</th><th>Last uplink</th><th>Radio</th><th>Firmware</th><th>Battery</th><th>Fault diagnostics</th></tr></thead>
                  <tbody>
                    ${nodes.map((node) => {
                      const diagnostics = getNodeFaultDiagnostics(node);
                      const faultFlags = diagnostics.flags.join(" · ") || "No active fault flags";
                      const txFailures = diagnostics.hasCounters
                        ? `${diagnostics.txFailures ?? 0}${diagnostics.txFailures >= 15 ? "+" : ""}/15 TX failures since last successful TX`
                        : "TX counter unavailable (18-byte payload)";
                      const sensorCounters = diagnostics.counters.filter((item) => !item.endsWith("transmission failures"));
                      const txTimeoutDetail = diagnostics.flags.includes("TX timeout flag active")
                        ? "TX did not complete within the firmware 120 s window."
                        : "";
                      const nextCheck = getNodeDiagnosticsNextCheck(diagnostics);
                      const status = node.transportStatus || "offline";
                      return `
                        <tr>
                          <td><strong>${escapeHtml(node.name || node.devEui || "—")}</strong><small>${escapeHtml(node.devEui || "—")}</small></td>
                          <td>${escapeHtml([node.areaName, node.sectionName].filter(Boolean).join(" · ") || "Unassigned")}</td>
                          <td><span class="platform-node-status" data-state="${escapeAttribute(status)}">${escapeHtml(status)}</span></td>
                          <td>${escapeHtml(formatAdminDate(node.lastSeen))}</td>
                          <td>${escapeHtml([formatNodeSignal(node), getNodeReportingModeLabel(node.profile)].filter(Boolean).join(" · "))}</td>
                          <td>${escapeHtml(node.firmwareVersion || "Unknown")}</td>
                          <td>${Number.isFinite(Number(node.level)) ? `${escapeHtml(String(node.level))}%${Number.isFinite(Number(node.batteryMv)) ? ` · ${escapeHtml((Number(node.batteryMv) / 1000).toFixed(2))} V` : ""}` : "—"}</td>
                          <td class="platform-node-faults"><strong>${escapeHtml(faultFlags)}</strong>${txTimeoutDetail ? `<small>${escapeHtml(txTimeoutDetail)}</small>` : ""}<small>${escapeHtml(txFailures)}</small>${sensorCounters.length ? `<small>${escapeHtml(sensorCounters.join(" · "))}</small>` : ""}<small class="platform-node-next-check"><b>Next check:</b> ${escapeHtml(nextCheck)}</small></td>
                        </tr>
                      `;
                    }).join("") || `<tr><td colspan="8" class="admin-empty">No nodes are registered for this organization.</td></tr>`}
                  </tbody>
                </table>
              </div>
            ` : ""}
          </section>
        `;
      })();
      const platformPanel = `
        <div class="admin-console" aria-labelledby="adminConsoleTitle">
          <div class="admin-console-toolbar">
            <form class="admin-inline-form" data-settings-form="platform-organization">
              <label><span>Organization name</span><input name="customerOrganizationName" placeholder="Company or institution" required></label>
              <label><span>Owner email</span><input name="customerOwnerEmail" type="email" placeholder="owner@example.com" required></label>
              <button type="submit" class="admin-button admin-button-primary">Create organization</button>
            </form>
            <button type="button" class="admin-button" data-platform-refresh>Refresh data</button>
          </div>

          ${platformOrganizationState.status === "loading" ? `<p class="admin-status" role="status">Loading administration data…</p>` : ""}
          ${platformOrganizationState.status === "error" ? `<div class="admin-error" role="alert"><strong>Could not load administration data.</strong><span>${escapeHtml(platformOrganizationState.error)}</span><button type="button" class="admin-button" data-platform-refresh>Retry</button></div>` : ""}
          ${platformOrganizationState.latestInviteUrl ? `<div class="admin-notice" role="status"><strong>${platformOrganizationState.latestInviteEmailSent ? "Invitation email sent" : "Invitation email was not confirmed"}</strong><span>${escapeHtml(platformOrganizationState.latestOrganizationName)} · ${escapeHtml(platformOrganizationState.latestInviteEmail)}</span><button type="button" class="admin-link-button" data-copy-invitation="${escapeAttribute(platformOrganizationState.latestInviteUrl)}">Copy backup link</button></div>` : ""}
          ${platformNodeDiagnosticsPanel}

          ${platformOrganizationState.status === "ready" ? `
            <section class="admin-section" aria-labelledby="adminRequestsTitle">
              <header><h2 id="adminRequestsTitle">Pending requests</h2><span>${platformOrganizationState.organizationRequests.length}</span></header>
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead><tr><th>Organization</th><th>Requester</th><th>Requested</th><th>Status</th><th class="admin-actions-column">Actions</th></tr></thead>
                  <tbody>
                    ${platformOrganizationState.organizationRequests.map((request) => `
                      <tr>
                        <td><strong>${escapeHtml(request.organizationName)}</strong></td>
                        <td>${escapeHtml(request.userName || "—")}<small>${escapeHtml(request.userEmail)}</small></td>
                        <td>${escapeHtml(formatAdminDate(request.createdAt))}</td>
                        <td><span class="admin-status-label" data-state="pending">${escapeHtml(request.status || "pending")}</span></td>
                        <td class="admin-row-actions">
                          <button type="button" class="admin-link-button" data-platform-request-approve="${escapeAttribute(request.id)}" data-platform-request-name="${escapeAttribute(request.organizationName)}">Approve</button>
                          <button type="button" class="admin-link-button admin-link-danger" data-platform-request-reject="${escapeAttribute(request.id)}" data-platform-request-name="${escapeAttribute(request.organizationName)}">Reject</button>
                        </td>
                      </tr>
                    `).join("") || `<tr><td colspan="5" class="admin-empty">No pending organization requests.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="admin-section" aria-labelledby="adminOrganizationsTitle">
              <header>
                <h2 id="adminOrganizationsTitle">Organizations</h2><span>${platformOrganizationState.organizations.length}</span>
                <label class="admin-search"><span class="sr-only">Search organizations</span><input type="search" placeholder="Search organizations" data-admin-search="organizations"></label>
              </header>
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead><tr><th>Name</th><th>Status</th><th>Members</th><th>Sites</th><th>Zones</th><th>Nodes</th><th>Node faults</th><th>Created</th><th class="admin-actions-column">Actions</th></tr></thead>
                  <tbody>
                    ${platformOrganizationState.organizations.map((organization) => {
                      const faultNodeCount = hasOrganizationFaultCount(organization.faultNodeCount) ? Number(organization.faultNodeCount) : null;
                      const faultLabel = faultNodeCount === null ? "Unavailable" : faultNodeCount > 0 ? `${faultNodeCount} flagged` : "None";
                      return `
                      <tr data-admin-row="organizations" data-admin-search-value="${escapeAttribute(`${organization.name} ${organization.id} ${organization.status || "active"}`.toLowerCase())}">
                        <td><strong>${escapeHtml(organization.name)}</strong><small>${escapeHtml(organization.id)}</small></td>
                        <td><span class="admin-status-label" data-state="${escapeAttribute(organization.status || "active")}">${escapeHtml(organization.status || "active")}</span></td>
                        <td>${Number(organization.memberCount || 0)}</td>
                        <td>${Number(organization.areaCount || 0)}</td>
                        <td>${Number(organization.sectionCount || 0)}</td>
                        <td>${Number(organization.nodeCount || 0)}</td>
                        <td><span class="admin-status-label" data-state="${faultNodeCount === null ? "inactive" : faultNodeCount > 0 ? "warning" : "clear"}">${escapeHtml(faultLabel)}</span></td>
                        <td>${escapeHtml(formatAdminDate(organization.createdAt))}</td>
                        <td class="admin-row-actions">
                          <button type="button" class="admin-link-button" data-platform-node-diagnostics="${escapeAttribute(organization.id)}" data-platform-name="${escapeAttribute(organization.name)}">Node diagnostics</button>
                          ${organization.status === "archived"
                            ? `<button type="button" class="admin-link-button" data-platform-restore="${escapeAttribute(organization.id)}">Restore</button>`
                            : `<button type="button" class="admin-link-button" data-platform-archive="${escapeAttribute(organization.id)}" data-platform-name="${escapeAttribute(organization.name)}">Archive</button>`}
                          ${currentSession?.isSuperAdmin ? `<button type="button" class="admin-link-button admin-link-danger" data-platform-delete="${escapeAttribute(organization.id)}" data-platform-name="${escapeAttribute(organization.name)}" ${organization.id === currentSession?.organizationId ? "disabled" : ""}>Delete</button>` : ""}
                        </td>
                      </tr>
                    `;
                    }).join("") || `<tr><td colspan="9" class="admin-empty">No organizations.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="admin-section" aria-labelledby="adminAdministratorsTitle">
              <header>
                <h2 id="adminAdministratorsTitle">Administrators</h2><span>${platformAdministrators.length}</span>
                <label class="admin-search"><span class="sr-only">Search administrators</span><input type="search" placeholder="Search administrators" data-admin-search="administrators"></label>
              </header>
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Admin level</th><th>Account</th><th>Organizations</th><th class="admin-actions-column">Actions</th></tr></thead>
                  <tbody>
                    ${platformAdministrators.map((user) => `
                      <tr data-admin-row="administrators" data-admin-search-value="${escapeAttribute(`${user.name || ""} ${user.email || ""} ${user.isSuperAdmin ? "super admin" : "platform admin"}`.toLowerCase())}">
                        <td><strong>${escapeHtml(user.name || "—")}</strong></td>
                        <td>${escapeHtml(user.email || "—")}</td>
                        <td><span class="admin-status-label" data-state="active">${user.isSuperAdmin ? "Super admin" : "Platform admin"}</span></td>
                        <td><span class="admin-status-label" data-state="${user.active === false ? "inactive" : "active"}">${user.active === false ? "Inactive" : "Active"}</span></td>
                        <td>${Number(user.organizationCount || 0)}</td>
                        <td class="admin-row-actions">
                          ${user.isSuperAdmin
                            ? `<span class="admin-protected-label">Protected</span>`
                            : currentSession?.isSuperAdmin
                              ? `<button type="button" class="admin-link-button admin-link-danger" data-platform-admin-revoke="${escapeAttribute(user.id)}" data-platform-admin-email="${escapeAttribute(user.email)}">Revoke admin</button>`
                              : `<span class="admin-protected-label">Read only</span>`}
                        </td>
                      </tr>
                    `).join("") || `<tr><td colspan="6" class="admin-empty">No administrators.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="admin-section" aria-labelledby="adminUsersTitle">
              <header>
                <h2 id="adminUsersTitle">Users</h2><span>${platformOrganizationState.users.length}</span>
                <label class="admin-search"><span class="sr-only">Search users</span><input type="search" placeholder="Search users" data-admin-search="users"></label>
              </header>
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Account</th><th>Organizations</th><th>Pending requests</th><th class="admin-actions-column">Actions</th></tr></thead>
                  <tbody>
                    ${platformOrganizationState.users.map((user) => `
                      <tr data-admin-row="users" data-admin-search-value="${escapeAttribute(`${user.name || ""} ${user.email || ""}`.toLowerCase())}">
                        <td><strong>${escapeHtml(user.name || "—")}</strong></td>
                        <td>${escapeHtml(user.email || "—")}</td>
                        <td><span class="admin-status-label" data-state="${user.active === false ? "inactive" : "active"}">${user.isSuperAdmin ? "Super admin" : (user.isPlatformAdmin ? "Platform admin" : (user.active === false ? "Inactive" : "Active"))}</span></td>
                        <td>${Number(user.organizationCount || 0)}</td>
                        <td>${Number(user.pendingRequestCount || 0)}</td>
                        <td class="admin-row-actions">
                          ${user.isSuperAdmin ? `<span class="admin-protected-label">Protected</span>` : currentSession?.isSuperAdmin ? `
                            ${user.isPlatformAdmin
                              ? `<span class="admin-protected-label">Managed in Administrators</span>`
                              : `<button type="button" class="admin-link-button" data-platform-admin-grant="${escapeAttribute(user.id)}" data-platform-admin-email="${escapeAttribute(user.email)}" ${user.active === false ? "disabled" : ""}>Grant admin</button>`}
                            <button type="button" class="admin-link-button" data-platform-user-status="${escapeAttribute(user.id)}" data-platform-user-active="${user.active === false ? "false" : "true"}" data-platform-user-email="${escapeAttribute(user.email)}" ${user.id === currentSession?.id ? "disabled" : ""}>${user.active === false ? "Activate" : "Deactivate"}</button>
                            <button type="button" class="admin-link-button admin-link-danger" data-platform-user-delete="${escapeAttribute(user.id)}" data-platform-user-email="${escapeAttribute(user.email)}" ${user.id === currentSession?.id ? "disabled" : ""}>Delete</button>
                          ` : `<span class="admin-protected-label">Read only</span>`}
                        </td>
                      </tr>
                    `).join("") || `<tr><td colspan="6" class="admin-empty">No users.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>
          ` : ""}
        </div>
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
            <form class="settings-form-card" data-settings-form="password">
              <div class="settings-form-title"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><div><h3>Security</h3><p>Use at least 12 characters. Other signed-in devices will be signed out.</p></div></div>
              <label><span>Current password</span><input name="currentPassword" type="password" autocomplete="current-password" placeholder="Enter your current password" required></label>
              <div class="settings-form-grid">
                <label><span>New password</span><input name="newPassword" type="password" autocomplete="new-password" minlength="12" placeholder="At least 12 characters" required></label>
                <label><span>Confirm new password</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" placeholder="Repeat the new password" required></label>
              </div>
              <p class="settings-password-feedback" data-password-feedback role="status" hidden></p>
              <button type="submit" class="settings-primary-button">Change password</button>
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
        platform: platformPanel,
        alerts: alertsPanel,
        team: teamPanel,
        workspace: workspacePanel,
        data: dataPanel
      }[activeSettingsPanelKey];

      elements.settingsManagementShell.innerHTML = isAdminPage ? `
        <div class="admin-page-shell">
          <header class="admin-page-head">
            <div><h1 id="adminConsoleTitle">Admin</h1><p>Organizations, users and access management.</p></div>
            <div class="admin-page-counts"><span>${platformOrganizationState.organizationRequests.length} pending</span><span>${platformOrganizationState.organizations.length} organizations</span><span>${platformOrganizationState.users.length} users</span></div>
          </header>
          ${renderManagementNotice("settings")}
          ${platformPanel}
        </div>
      ` : `
        <div class="settings-page-shell">
          <section class="settings-page-head">
            <div>
              <span class="settings-panel-kicker">Settings</span>
              <h1>${isAdminPage ? "Platform administration" : "Workspace configuration"}</h1>
              <p>${isAdminPage ? "Create customer workspaces, manage platform admins, and permanently remove organizations when needed." : "Manage crop targets and review the operational preferences available in this workspace."}</p>
            </div>
            <div class="settings-head-summary">
              <span><strong>${profileEntries.length}</strong> profiles</span>
              <span><strong>${teamMemberCount}</strong> users</span>
              <span><strong>${activeAlertCount}</strong> active alerts</span>
            </div>
          </section>
          ${renderManagementNotice("settings")}
          ${!isAdminPage && activeSettingsPanelKey !== "profiles" && activeSettingsPanelKey !== "team" ? `
            <div class="settings-local-notice" role="status">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              <span>These settings are currently stored in this browser. Crop profiles are saved through the NeuroCrop API.</span>
            </div>
          ` : ""}
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
      const sourceProfileKey = cropProfiles[settingsProfileFormState.sourceProfile] && isVisibleSettingsCropProfile(settingsProfileFormState.sourceProfile)
        ? settingsProfileFormState.sourceProfile
        : activeSettingsProfileKey;
      const sourceProfile = getCompleteCropProfile(cropProfiles[sourceProfileKey] || getDefaultCropProfileTemplate());
      const nextProfileId = createUniqueId(nextName, new Set(Object.keys(cropProfiles)), "crop-profile");
      const nextHeroName = settingsProfileFormState.heroName.trim() || nextName.split(",")[0].trim() || nextName;
      const nextStage = settingsProfileFormState.stage.trim();
      const nextHint = isBlankProgram
        ? "Manual program. Review every target before assigning it to a Section."
        : `Workspace copy of ${cropProfiles[sourceProfileKey]?.name || sourceProfile.name || "the selected profile"}.`;

      if (!nextName) {
        setManagementNotice("settings", "Crop profile name is required before saving.", "warning");
        renderDashboard();
        return;
      }

      if (isApiDataMode() && window.NeuroCropApi?.createCropProfile) {
        (async () => {
          try {
            const response = await window.NeuroCropApi.createCropProfile({
              id: nextProfileId,
              name: nextName,
              heroName: nextHeroName,
              stage: nextStage,
              hint: nextHint,
              requiresReview: true,
              metrics: getCompleteCropProfileMetrics(sourceProfile.metrics || {})
            });
            await hydrateCropProfilesFromApi();
            activeSettingsProfileKey = normalizeCropProfileKey(response?.profile?.id || response?.profile?.key || nextProfileId);
            settingsProfileFormState = { name: "", heroName: "", stage: "", sourceProfile: activeSettingsProfileKey, mode: "template" };
            setManagementNotice(
              "settings",
              isBlankProgram
                ? `${nextName} created as a manual program. Review its targets before assigning it to a Section.`
                : `${nextName} created with the full target set. It is now available in the Sections crop profile dropdown.`
            );
            renderDashboard();
          } catch (error) {
            setManagementNotice("settings", error instanceof Error ? error.message : "Crop profile could not be created.", "warning");
            renderDashboard();
          }
        })();
        return;
      }

      const nextProfileKey = nextProfileId;
      sourceProfile.name = nextName;
      sourceProfile.heroName = nextHeroName;
      sourceProfile.stage = nextStage;
      sourceProfile.hint = nextHint;
      sourceProfile.requiresReview = isBlankProgram;
      sourceProfile.metrics = getCompleteCropProfileMetrics(sourceProfile.metrics || {});
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

    function parseProfileRangeInputValue(rawValue) {
      const normalized = String(rawValue || "").trim().replace(",", ".");
      if (!normalized) return NaN;
      return Number(normalized);
    }

    function getMetricHardBounds(metric) {
      const unit = String(metric?.unit || "").toLowerCase();
      const key = String(metric?.metricKey || "");
      if (unit === "%" || key === "humidity" || key === "soilMoisture") return { min: 0, max: 100 };
      if (unit === "ph" || key === "ph") return { min: 0, max: 14 };
      if (["ppm", "lx", "lux", "kpa", "ms/cm", "hpa"].includes(unit)) return { min: 0, max: Infinity };
      return { min: -Infinity, max: Infinity };
    }

    function clampMetricBoundary(value, metric) {
      const bounds = getMetricHardBounds(metric);
      return Math.min(Math.max(value, bounds.min), bounds.max);
    }



    const AUTOMATIC_ALERT_BOUNDARY_RULES = {
      airTemp: { warning: [2, 2], critical: [4, 4] },
      humidity: { warning: [5, 5], critical: [15, 15] },
      co2: { warning: [150, 150], critical: [400, 400] },
      lux: { warning: "light", critical: "light" },
      soilTemp: { warning: [2, 2], critical: [5, 6] },
      vpd: { warning: [0.2, 0.2], critical: [0.6, 0.6] },
      soilMoisture: { warning: [8, 8], critical: [18, 18] },
      ec: { warning: "ec", critical: "ec" },
      ph: { warning: [0.3, 0.4], critical: [0.8, 0.8] },
      leafTemp: { warning: [2, 2], critical: [5, 5] },
      soilEc: { warning: [0.3, 0.4], critical: [0.8, 1] },
      waterTemp: { warning: [2, 2], critical: [5, 6] },
      airPressure: { warning: [6, 6], critical: [14, 14] }
    };

    function getAutomaticBoundaryPadding(metric, optimalRange) {
      const key = String(metric?.metricKey || "");
      const optimalMin = Number(optimalRange?.[0]);
      const optimalMax = Number(optimalRange?.[1]);
      const span = Math.max(optimalMax - optimalMin, stepFromDecimals(metric?.decimals || 0), 0);
      const rule = AUTOMATIC_ALERT_BOUNDARY_RULES[key];

      if (rule?.warning === "light") {
        return {
          warningLow: Math.max(4000, span * 0.5),
          warningHigh: Math.max(4000, span * 0.25),
          criticalLow: Math.max(10000, span * 1.25),
          criticalHigh: Math.max(10000, span * 0.75)
        };
      }

      if (rule?.warning === "ec") {
        return {
          warningLow: Math.max(0.3, span * 0.4),
          warningHigh: Math.max(0.3, span * 0.4),
          criticalLow: Math.max(0.6, span),
          criticalHigh: Math.max(0.8, span)
        };
      }

      const warning = Array.isArray(rule?.warning) ? rule.warning : [Math.max(span * 0.25, 1), Math.max(span * 0.25, 1)];
      const critical = Array.isArray(rule?.critical) ? rule.critical : [Math.max(span * 0.75, 2), Math.max(span * 0.75, 2)];
      return {
        warningLow: warning[0],
        warningHigh: warning[1],
        criticalLow: critical[0],
        criticalHigh: critical[1]
      };
    }

    function deriveAutomaticAlertRanges(metric, optimalRange) {
      const optimalMin = Number(optimalRange?.[0]);
      const optimalMax = Number(optimalRange?.[1]);
      if (!Number.isFinite(optimalMin) || !Number.isFinite(optimalMax)) {
        const values = getProfileEditorRangeValues(metric);
        return {
          warning: [values.warningLow, values.warningHigh],
          critical: [values.criticalLow, values.criticalHigh]
        };
      }

      // Limits are derived only from the current optimal target and the metric policy.
      // Never use prior alert limits here: doing so compounds the range on every save.
      const padding = getAutomaticBoundaryPadding(metric, [optimalMin, optimalMax]);
      const decimals = Number.isFinite(Number(metric?.decimals)) ? Number(metric.decimals) : 2;
      const warning = [
        roundValue(clampMetricBoundary(optimalMin - padding.warningLow, metric), decimals),
        roundValue(clampMetricBoundary(optimalMax + padding.warningHigh, metric), decimals)
      ];
      const critical = [
        roundValue(clampMetricBoundary(optimalMin - padding.criticalLow, metric), decimals),
        roundValue(clampMetricBoundary(optimalMax + padding.criticalHigh, metric), decimals)
      ];

      if (critical[0] > warning[0]) critical[0] = warning[0];
      if (warning[0] > optimalMin) warning[0] = optimalMin;
      if (warning[1] < optimalMax) warning[1] = optimalMax;
      if (critical[1] < warning[1]) critical[1] = warning[1];

      return { warning, critical };
    }

    function getProfileEditorRangeValues(metric) {
      const optimal = Array.isArray(metric?.optimal) ? metric.optimal : [0, 0];
      const warning = Array.isArray(metric?.warning) ? metric.warning : optimal;
      const critical = Array.isArray(metric?.critical) ? metric.critical : warning;
      const optimalMin = Number(optimal[0]);
      const optimalMax = Number(optimal[1]);
      let warningMin = Number(warning[0]);
      let warningMax = Number(warning[1]);
      let criticalMin = Number(critical[0]);
      let criticalMax = Number(critical[1]);

      if (Number.isFinite(warningMin) && Number.isFinite(warningMax) && Number.isFinite(optimalMin) && Number.isFinite(optimalMax)) {
        const looksLikeHighOnlyWarning = warningMin > optimalMin && warningMin > optimalMax;
        if (looksLikeHighOnlyWarning) warningMin = optimalMin;
      }

      if (Number.isFinite(criticalMin) && Number.isFinite(criticalMax) && Number.isFinite(warningMin) && Number.isFinite(warningMax)) {
        const looksLikeHighOnlyCritical = criticalMin > warningMin && criticalMin > warningMax;
        if (looksLikeHighOnlyCritical) criticalMin = warningMin;
      }

      return {
        criticalLow: Number.isFinite(criticalMin) ? criticalMin : "",
        warningLow: Number.isFinite(warningMin) ? warningMin : "",
        optimalMin: Number.isFinite(optimalMin) ? optimalMin : "",
        optimalMax: Number.isFinite(optimalMax) ? optimalMax : "",
        warningHigh: Number.isFinite(warningMax) ? warningMax : "",
        criticalHigh: Number.isFinite(criticalMax) ? criticalMax : ""
      };
    }

    function ensureSettingsProfileEditorDraft(profileKey, profile) {
      if (!settingsProfileEditorDrafts[profileKey]) {
        settingsProfileEditorDrafts[profileKey] = {
          name: profile.name,
          heroName: profile.heroName,
          stage: profile.stage || "",
          metrics: getCompleteCropProfileMetrics(profile.metrics || {})
        };
      }
      return settingsProfileEditorDrafts[profileKey];
    }

    function formatProfileRangeInput(value, decimals) {
      if (!Number.isFinite(value)) return "";
      const precision = Number.isFinite(Number(decimals)) ? Math.min(Math.max(Number(decimals), 0), 3) : 2;
      return precision === 0 ? String(Math.round(value)) : String(Number(value.toFixed(precision)));
    }

    function captureOptimalRangeBaseline(target) {
      if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-profile-range")) return;
      if (target.dataset.rangeKey !== "optimal") return;
      const form = target.closest('[data-settings-form="crop-profile-editor"]');
      const profileKey = form?.dataset.profileKey;
      const metricKey = target.dataset.metricKey;
      const profile = profileKey ? cropProfiles[profileKey] : null;
      if (!profileKey || !metricKey || !profile) return;
      const draft = ensureSettingsProfileEditorDraft(profileKey, profile);
      const metric = draft.metrics[metricKey] || profile.metrics?.[metricKey];
      const values = getProfileEditorRangeValues(metric);
      target.dataset.optimalRangeBaseline = JSON.stringify({
        "critical:0": values.criticalLow,
        "warning:0": values.warningLow,
        "optimal:0": values.optimalMin,
        "optimal:1": values.optimalMax,
        "warning:1": values.warningHigh,
        "critical:1": values.criticalHigh
      });
    }

    function rebalanceOptimalRangeBounds(target) {
      if (!(target instanceof HTMLInputElement) || target.dataset.rangeKey !== "optimal") return;
      const nextOptimal = parseProfileRangeInputValue(target.value);
      if (!Number.isFinite(nextOptimal)) return;

      const form = target.closest('[data-settings-form="crop-profile-editor"]');
      const row = target.closest("[data-profile-metric-row]");
      const profileKey = form?.dataset.profileKey;
      const metricKey = target.dataset.metricKey;
      const profile = profileKey ? cropProfiles[profileKey] : null;
      if (!form || !row || !profileKey || !metricKey || !profile) return;

      const draft = ensureSettingsProfileEditorDraft(profileKey, profile);
      const completeMetrics = getCompleteCropProfileMetrics(profile.metrics || {});
      const metric = draft.metrics[metricKey] || cloneDashboardValue(completeMetrics[metricKey] || {});
      draft.metrics[metricKey] = metric;
      const decimals = metric.decimals;
      const bound = Number(target.dataset.bound);

      if (!Array.isArray(metric.optimal)) metric.optimal = [];
      metric.optimal[bound] = target.value;
      const ranges = getProfileEditorRangeValues(metric);
      const automaticRanges = deriveAutomaticAlertRanges({ ...metric, metricKey }, [ranges.optimalMin, ranges.optimalMax]);
      metric.warning = automaticRanges.warning.map((value) => formatProfileRangeInput(value, decimals));
      metric.critical = automaticRanges.critical.map((value) => formatProfileRangeInput(value, decimals));
      const warningLabel = row.querySelector('[data-profile-alert-limit="warning"]');
      const criticalLabel = row.querySelector('[data-profile-alert-limit="critical"]');
      if (warningLabel) warningLabel.innerHTML = `<b>Warning</b> ${escapeHtml(formatRange(metric.warning, metric))}`;
      if (criticalLabel) criticalLabel.innerHTML = `<b>Critical</b> ${escapeHtml(formatRange(metric.critical, metric))}`;
      delete target.dataset.optimalRangeBaseline;
    }

    function syncCropProfileEditorDraft(target) {
      if (!(target instanceof HTMLElement)) return;
      const form = target.closest('[data-settings-form="crop-profile-editor"]');
      if (!form) return;
      const profileKey = form.dataset.profileKey;
      const profile = cropProfiles[profileKey];
      if (!profile) return;
      const draft = ensureSettingsProfileEditorDraft(profileKey, profile);
      if (profileSaveFeedback.profileKey === profileKey) profileSaveFeedback = { profileKey: "", profileName: "", tone: "optimal" };
      form.dataset.dirty = "true";
      const saveButton = form.querySelector("[data-profile-save]");
      const discardButton = form.querySelector("[data-settings-profile-discard]");
      const saveState = form.querySelector("[data-profile-save-state]");
      if (saveButton instanceof HTMLButtonElement) saveButton.disabled = false;
      if (discardButton instanceof HTMLButtonElement) discardButton.disabled = false;
      if (saveState) saveState.textContent = "Unsaved changes";

      if (target instanceof HTMLInputElement && target.name === "profileEditorName") {
        draft.name = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.name === "profileEditorHeroName") {
        draft.heroName = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.name === "profileEditorStage") {
        draft.stage = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.hasAttribute("data-profile-range")) {
        const metricKey = target.dataset.metricKey;
        const rangeKey = target.dataset.rangeKey;
        const bound = Number(target.dataset.bound);
        if (!metricKey || !rangeKey || !Number.isFinite(bound)) return;
        const completeMetrics = getCompleteCropProfileMetrics(profile.metrics || {});
        if (!draft.metrics[metricKey]) draft.metrics[metricKey] = cloneDashboardValue(completeMetrics[metricKey] || {});
        if (!Array.isArray(draft.metrics[metricKey][rangeKey])) draft.metrics[metricKey][rangeKey] = cloneDashboardValue(completeMetrics[metricKey]?.[rangeKey] || []);
        draft.metrics[metricKey][rangeKey][bound] = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.hasAttribute("data-lighting-schedule")) {
        const row = target.closest("[data-profile-metric-row]");
        const metricKey = row?.dataset.profileMetricRow;
        const field = target.dataset.lightingSchedule;
        if (!metricKey || !field) return;
        const completeMetrics = getCompleteCropProfileMetrics(profile.metrics || {});
        if (!draft.metrics[metricKey]) draft.metrics[metricKey] = cloneDashboardValue(completeMetrics[metricKey] || {});
        if (!draft.metrics[metricKey].lightingSchedule) draft.metrics[metricKey].lightingSchedule = {};
        draft.metrics[metricKey].lightingSchedule[field] = field === "enabled"
          ? target.checked
          : field === "darkThresholdLux" ? Number(target.value) : target.value;
      }
    }

    function submitCropProfileEditor(form) {
      const profileKey = form.dataset.profileKey;
      const profile = cropProfiles[profileKey];
      if (!profile) return;
      const draft = ensureSettingsProfileEditorDraft(profileKey, profile);

      const name = String(form.querySelector('[name="profileEditorName"]')?.value || draft.name || "").trim();
      const heroName = String(form.querySelector('[name="profileEditorHeroName"]')?.value || draft.heroName || "").trim();
      const stage = String(form.querySelector('[name="profileEditorStage"]')?.value || draft.stage || "").trim();
      if (!name || !heroName) {
        setManagementNotice("settings", "Profile and crop name are required before saving.", "warning");
        renderDashboard();
        return;
      }

      const nextMetrics = getCompleteCropProfileMetrics(profile.metrics || {});
      const metricRows = [...form.querySelectorAll("[data-profile-metric-row]")];
      for (const row of metricRows) {
        const metricKey = row.dataset.profileMetricRow;
        const metric = nextMetrics[metricKey];
        if (!metric) continue;
        const draftMetric = draft.metrics?.[metricKey] || metric;
        const draftRanges = getProfileEditorRangeValues(draftMetric);
        const nextRanges = {
          optimal: [draftRanges.optimalMin, draftRanges.optimalMax],
          warning: [draftRanges.warningLow, draftRanges.warningHigh],
          critical: [draftRanges.criticalLow, draftRanges.criticalHigh]
        };
        const inputs = [...row.querySelectorAll("[data-profile-range]")];
        for (const input of inputs) {
          const rangeKey = input.dataset.rangeKey;
          const bound = Number(input.dataset.bound);
          const value = parseProfileRangeInputValue(input.value);
          if (!Number.isFinite(value)) {
            setManagementNotice("settings", `Enter a valid value for ${metric.label}.`, "warning");
            renderDashboard();
            return;
          }
          nextRanges[rangeKey][bound] = value;
        }
        const [optimalMin, optimalMax] = nextRanges.optimal;
        const automaticRanges = deriveAutomaticAlertRanges({ ...metric, ...draftMetric, metricKey, optimal: nextRanges.optimal }, nextRanges.optimal);
        nextRanges.warning = automaticRanges.warning;
        nextRanges.critical = automaticRanges.critical;
        const [warningMin, warningMax] = nextRanges.warning;
        const [criticalMin, criticalMax] = nextRanges.critical;
        const hasValidRangeOrder =
          criticalMin <= warningMin &&
          warningMin <= optimalMin &&
          optimalMin <= optimalMax &&
          optimalMax <= warningMax &&
          warningMax <= criticalMax;
        if (!hasValidRangeOrder) {
          setManagementNotice("settings", `${metric.label}: ranges must go critical low → warning low → optimal → warning high → critical high.`, "warning");
          renderDashboard();
          return;
        }
        metric.optimal = nextRanges.optimal;
        metric.warning = nextRanges.warning;
        metric.critical = nextRanges.critical;
        if (metricKey === "lux") {
          const enabledInput = row.querySelector('[data-lighting-schedule="enabled"]');
          const startInput = row.querySelector('[data-lighting-schedule="start"]');
          const endInput = row.querySelector('[data-lighting-schedule="end"]');
          const thresholdInput = row.querySelector('[data-lighting-schedule="darkThresholdLux"]');
          metric.lightingSchedule = {
            enabled: enabledInput instanceof HTMLInputElement && enabledInput.checked,
            start: startInput instanceof HTMLInputElement ? startInput.value : "06:00",
            end: endInput instanceof HTMLInputElement ? endInput.value : "22:00",
            timeZone: "Europe/Vilnius",
            darkThresholdLux: thresholdInput instanceof HTMLInputElement ? Math.max(0, Number(thresholdInput.value) || 100) : 100
          };
        }
      }

      profile.name = name;
      profile.heroName = heroName;
      profile.stage = stage;
      profile.metrics = nextMetrics;

      if (isApiDataMode() && window.NeuroCropApi?.updateCropProfile) {
        (async () => {
          try {
            const payload = {
              name,
              heroName,
              stage,
              hint: profile.hint || "",
              requiresReview: Boolean(profile.requiresReview),
              metrics: nextMetrics
            };
            const response = await window.NeuroCropApi.updateCropProfile(profileKey, payload);
            if (response?.profile) {
              applyApiCropProfiles({ profiles: [response.profile] });
              activeSettingsProfileKey = normalizeCropProfileKey(response.profile.id || profileKey);
            }
            delete settingsProfileEditorDrafts[profileKey];
            await hydrateCropProfilesFromApi();
            invalidateProfileAnalytics(profileKey);
            // Scores are calculated by the backend from the saved profile ranges.
            // Reload the canonical dashboard immediately instead of waiting for a page refresh.
            await hydrateDashboardFromApi();
            profileSaveFeedback = {
              profileKey: activeSettingsProfileKey,
              profileName: name,
              tone: "optimal"
            };
            renderDashboard();
          } catch (error) {
            if (profileKey === "default" && window.NeuroCropApi?.createCropProfile) {
              try {
                const response = await window.NeuroCropApi.createCropProfile({
                  id: "default",
                  name,
                  heroName,
                  stage,
                  hint: profile.hint || "",
                  requiresReview: Boolean(profile.requiresReview),
                  metrics: nextMetrics
                });
                if (response?.profile) applyApiCropProfiles({ profiles: [response.profile] });
                activeSettingsProfileKey = "default";
                delete settingsProfileEditorDrafts[profileKey];
                await hydrateCropProfilesFromApi();
                invalidateProfileAnalytics(profileKey);
                await hydrateDashboardFromApi();
                profileSaveFeedback = {
                  profileKey: "default",
                  profileName: name,
                  tone: "optimal"
                };
                renderDashboard();
                return;
              } catch (createError) {
                setManagementNotice("settings", createError instanceof Error ? createError.message : "Default crop profile could not be saved.", "warning");
                renderDashboard();
                return;
              }
            }
            setManagementNotice("settings", error instanceof Error ? error.message : "Crop profile could not be saved.", "warning");
            renderDashboard();
          }
        })();
        return;
      }

      persistCustomCropProfiles();
      persistCropProfileOverrides();
      delete settingsProfileEditorDrafts[profileKey];
      profileSaveFeedback = {
        profileKey,
        profileName: name,
        tone: "optimal"
      };
      renderDashboard();
    }

    async function submitLocationForm() {
      const nextName = locationFormState.name.trim();
      if (!nextName) {
        setManagementNotice("locations", "Location name is required before saving.", "warning");
        renderDashboard();
        return;
      }

      if (isApiDataMode()) {
        try {
          if (locationFormState.mode === "edit") {
            if (!window.NeuroCropApi?.updateArea) throw new Error("Area update API is not available yet.");
            await window.NeuroCropApi.updateArea(locationFormState.siteId, { name: nextName });
            await hydrateDashboardFromApi();
            resetLocationForm();
            setManagementNotice("locations", `${nextName} updated.`);
            renderDashboard();
            return;
          }

          if (!window.NeuroCropApi?.createArea) throw new Error("Area creation API is not available yet.");
          const response = await window.NeuroCropApi.createArea({ name: nextName });
          await hydrateDashboardFromApi();
          const createdAreaId = response?.area?.id || "";
          if (createdAreaId) activeBlockFilterSiteId = createdAreaId;
          resetLocationForm();
          resetBlockForm({ siteId: createdAreaId });
          setManagementNotice("locations", `${nextName} created. Next step: add the first section inside it.`);
          renderDashboard();
        } catch (error) {
          setManagementNotice("locations", error instanceof Error ? error.message : "The area could not be saved.", "warning");
          renderDashboard();
        }
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

    async function submitBlockForm() {
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

      if (isApiDataMode()) {
        try {
          if (blockFormState.mode === "edit") {
            if (!window.NeuroCropApi?.updateSection) throw new Error("Section update API is not available yet.");
            await window.NeuroCropApi.updateSection(blockFormState.zoneId, {
              areaId: nextSiteId,
              name: nextName,
              cropProfile: nextProfile
            });
            await hydrateDashboardFromApi();
            activeBlockFilterSiteId = nextSiteId;
            resetBlockForm({ siteId: nextSiteId, profile: nextProfile });
            setManagementNotice("blocks", `${nextName} updated.`);
            renderDashboard();
            return;
          }

          if (!window.NeuroCropApi?.createSection) throw new Error("Section creation API is not available yet.");
          await window.NeuroCropApi.createSection({
            areaId: nextSiteId,
            name: nextName,
            cropProfile: nextProfile
          });
          await hydrateDashboardFromApi();
          activeBlockFilterSiteId = nextSiteId;
          resetBlockForm({ siteId: nextSiteId, profile: nextProfile });
          setManagementNotice("blocks", `${nextName} created.`);
          renderDashboard();
        } catch (error) {
          setManagementNotice("blocks", error instanceof Error ? error.message : "The section could not be saved.", "warning");
          renderDashboard();
        }
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

    const scoreWarningEdgeSeverity = 0.2;
    const scoreCriticalEdgeSeverity = 0.65;

    function smoothScoreProgress(value) {
      const progress = clamp(value, 0, 1);
      return progress * progress * (3 - 2 * progress);
    }

    function getDirectionalScoreSeverity(definition, value, direction) {
      const side = direction === "low" ? 0 : 1;
      const optimalEdge = definition.optimal[side];
      const warningEdge = definition.warning[side];
      const criticalEdge = definition.critical[side];
      const distance = direction === "low" ? optimalEdge - value : value - optimalEdge;
      const warningSpan = Math.max(Math.abs(optimalEdge - warningEdge), 0.0001);
      const criticalSpan = Math.max(Math.abs(warningEdge - criticalEdge), 0.0001);

      if (distance <= warningSpan) {
        return scoreWarningEdgeSeverity * smoothScoreProgress(distance / warningSpan);
      }

      const distancePastWarning = distance - warningSpan;
      if (distancePastWarning <= criticalSpan) {
        return scoreWarningEdgeSeverity
          + (scoreCriticalEdgeSeverity - scoreWarningEdgeSeverity) * smoothScoreProgress(distancePastWarning / criticalSpan);
      }

      const distancePastCritical = distancePastWarning - criticalSpan;
      const extremeSpan = Math.max(criticalSpan, warningSpan);
      return scoreCriticalEdgeSeverity
        + (1 - scoreCriticalEdgeSeverity) * smoothScoreProgress(distancePastCritical / extremeSpan);
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
      let direction = "optimal";
      let severity = 0;
      if (value < definition.critical[0]) {
        state = "critical";
        direction = "low";
        severity = getDirectionalScoreSeverity(definition, value, direction);
      } else if (value > definition.critical[1]) {
        state = "critical";
        direction = "high";
        severity = getDirectionalScoreSeverity(definition, value, direction);
      } else if (value < definition.optimal[0]) {
        state = "warning";
        direction = "low";
        severity = getDirectionalScoreSeverity(definition, value, direction);
      } else if (value > definition.optimal[1]) {
        state = "warning";
        direction = "high";
        severity = getDirectionalScoreSeverity(definition, value, direction);
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
      const activeResults = results.filter((item) => item.available !== false && isScoreMetricKey(item.key));
      const evaluationByMetric = new Map(activeResults.map((item) => [item.key, item]));
      const resultByMetric = new Map(results.map((item) => [item.key, item]));
      const scoringGroups = [
        { id: "climate", weight: 0.35, limitingCap: 0.18, metrics: { vpd: 0.45, airTemp: 0.4, humidity: 0.15 } },
        { id: "root_water", weight: 0.25, limitingCap: 0.2, metrics: { soilMoisture: 1 } },
        { id: "nutrition", weight: 0.2, limitingCap: 0.12, metrics: { ec: 0.4, ph: 0.4, soilEc: 0.2 } },
        { id: "plant_temperature", weight: 0.12, limitingCap: 0.07, metrics: { leafTemp: 0.45, soilTemp: 0.35, waterTemp: 0.2 } },
        { id: "carbon", weight: 0.08, limitingCap: 0.02, metrics: { co2: 1 } }
      ];
      const scoreGroups = scoringGroups.map((group) => {
        const configuredMetricWeights = Object.entries(group.metrics).map(([key, agronomicWeight]) => {
          const configuredWeight = Number(resultByMetric.get(key)?.scoreWeight);
          return {
            key,
            agronomicWeight,
            scoreWeight: Number.isFinite(configuredWeight) ? clamp(configuredWeight, 0, 3) : 1
          };
        });
        const members = configuredMetricWeights.map(({ key, agronomicWeight, scoreWeight }) => {
          const result = evaluationByMetric.get(key);
          const effectiveWeight = agronomicWeight * scoreWeight;
          return result && effectiveWeight > 0 ? { ...result, effectiveWeight } : null;
        }).filter(Boolean);
        if (!members.length) return null;
        const driver = [...members].sort((left, right) => right.severity - left.severity)[0];
        const memberWeightTotal = members.reduce((sum, member) => sum + member.effectiveWeight, 0);
        const weightedMeanSeverity = members.reduce(
          (sum, member) => sum + member.severity * member.effectiveWeight,
          0
        ) / memberWeightTotal;
        const defaultWeightTotal = configuredMetricWeights.reduce((sum, member) => sum + member.agronomicWeight, 0);
        const configuredWeightTotal = configuredMetricWeights.reduce(
          (sum, member) => sum + member.agronomicWeight * member.scoreWeight,
          0
        );
        const profileScale = defaultWeightTotal > 0 ? configuredWeightTotal / defaultWeightTotal : 1;
        return {
          id: group.id,
          weight: group.weight * profileScale,
          limitingCap: group.limitingCap * profileScale,
          severity: clamp(driver.severity * 0.7 + weightedMeanSeverity * 0.3, 0, 1),
          state: members.some((member) => member.state === "critical")
            ? "critical"
            : members.some((member) => member.state === "warning") ? "warning" : "optimal",
          mainDriver: driver.key,
          metrics: members
        };
      }).filter(Boolean);

      if (!scoreGroups.length) {
        return {
          state: "unknown",
          warningCount: 0,
          criticalCount: 0,
          stableCount: 0,
          riskScore: 0,
          indexScore: null,
          source: "frontend-fallback",
          scoreModelVersion: "2.1.0",
          scoreGroups: []
        };
      }

      const baseRisk = scoreGroups.reduce((sum, group) => sum + group.severity * group.weight, 0);
      const worstGroup = [...scoreGroups].sort((left, right) => right.severity - left.severity)[0];
      const limitingFactorActivation = smoothScoreProgress((worstGroup.severity - 0.25) / 0.75);
      const limitingFactorPenalty = (1 - clamp(baseRisk, 0, 1))
        * worstGroup.limitingCap
        * limitingFactorActivation;
      const risk = clamp(baseRisk + limitingFactorPenalty, 0, 1);
      const scoreGroupsWithImpact = scoreGroups.map((group) => ({
        ...group,
        scoreImpact: group.severity * group.weight
          + (group.id === worstGroup.id ? limitingFactorPenalty : 0)
      }));
      const mainImpactGroup = [...scoreGroupsWithImpact]
        .sort((left, right) => right.scoreImpact - left.scoreImpact)[0];
      const criticalCount = scoreGroups.filter((group) => group.state === "critical").length;
      const warningCount = scoreGroups.filter((group) => group.state === "warning").length;
      const state = criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "optimal";
      let indexScore = Math.round((1 - risk) * 100);
      if (state !== "optimal" && indexScore === 100) indexScore = 99;
      const riskScore = 100 - indexScore;

      return {
        state,
        warningCount,
        criticalCount,
        stableCount: scoreGroups.length - warningCount - criticalCount,
        riskScore,
        indexScore,
        mainDriver: state === "optimal" ? null : mainImpactGroup.mainDriver,
        source: "frontend-fallback",
        scoreModelVersion: "2.1.0",
        scoreGroups: scoreGroupsWithImpact
      };
    }

    function normalizeBackendConditionStatus(status) {
      const normalized = String(status || "").trim().toLowerCase().replace(/[_\s-]+/g, "-");
      if (["optimal", "good", "ok", "green", "in-target"].includes(normalized)) return "optimal";
      if (["warning", "watch", "attention", "needs-attention", "amber"].includes(normalized)) return "warning";
      if (["critical", "danger", "alarm", "red"].includes(normalized)) return "critical";
      return null;
    }

    function getBackendOverallState(zone) {
      const score = Number(zone?.backendScore);
      const state = normalizeBackendConditionStatus(zone?.backendConditionStatus);
      if (!Number.isFinite(score) || !state) return null;

      const indexScore = Math.round(clamp(score, 0, 100));
      return {
        state,
        warningCount: state === "warning" ? 1 : 0,
        criticalCount: state === "critical" ? 1 : 0,
        stableCount: state === "optimal" ? 1 : 0,
        riskScore: 100 - indexScore,
        indexScore,
        source: "backend",
        mainDriver: zone?.backendMainDriver || null,
        coverage: zone?.backendCoverage || null,
        nodeSummary: zone?.backendNodeSummary || null,
        computedAt: zone?.backendComputedAt || null,
        scoreModelVersion: zone?.backendScoreModelVersion || null,
        scoreGroups: Array.isArray(zone?.backendScoreGroups) ? zone.backendScoreGroups : []
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
      groups.climate.label = "Climate";
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
          aria-disabled="${String(lens.disabled === true)}"
          ${lens.disabled === true ? "disabled" : ""}
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
    metricResults,
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

  return metricResults
    .filter((result) =>
      result.key !== "batteryLevel"
      && (result.configured !== false || (zone.availableMetrics || []).includes(result.key))
    )
    .map((result) => ({
          key: result.key,
          available: result.configured !== false,
          definition: profile.metrics[result.key],
          optimalRange: profile.metrics[result.key].optimal,
          value: result.value,
          state: result.state,
          tone: result.state,
          label: profile.metrics[result.key].label,
          meta: result.available === false
            ? (isApiDataMode() && (zone.availableMetrics || []).includes(result.key)
              ? "Waiting for latest reading"
              : "Sensor not installed in this block")
            : profile.metrics[result.key].aggregation || "Block avg",
          summary: result.available === false
            ? (isApiDataMode() && (zone.availableMetrics || []).includes(result.key)
              ? `${profile.metrics[result.key].label} has history available, but the latest reading is still loading.`
              : `${profile.metrics[result.key].label} is not installed in this block, so there is no history to show yet.`)
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

    function resetTrendSelectionForContextChange() {
      activeTrendMetricKey = "";
      activeTrendMetricKeys = [];
      currentTrendHistoryPoints = [];
    }



    function buildTrendSeries(option, rangeKey, scopeSeed, historyResponse = null) {
      const rangeConfig = trendRangeConfig[rangeKey] || trendRangeConfig["24h"];
      const pointCount = Math.max(2, Math.round((rangeConfig.totalHours * 60) / (rangeConfig.intervalMinutes || 60)) + 1);
      const domain = option.definition.displayRange || option.definition.critical;
      const optimalRange = option.optimalRange || option.definition.optimal;
      const span = Math.max(domain[1] - domain[0], 1);
      const currentValue = clamp(option.value, domain[0], domain[1]);
      const historyPoints = Array.isArray(historyResponse?.points)
        ? historyResponse.points
            .map((point) => ({
              timestamp: new Date(point.observedAt || point.receivedAt).getTime(),
              value: Number(point.value)
            }))
            .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value))
            .sort((left, right) => left.timestamp - right.timestamp)
        : [];

      if (historyPoints.length > 0) {
        const values = historyPoints.map((point) => roundValue(point.value, getTrendDecimalPlaces(option.definition, option.key)));
        return {
          domain,
          optimalRange,
          pointCount: values.length,
          values,
          timestamps: historyPoints.map((point) => point.timestamp),
          source: "api"
        };
      }

      if (isApiDataMode()) {
        const now = Date.now();
        return {
          domain,
          optimalRange,
          pointCount: 1,
          values: [roundValue(currentValue, option.definition.decimals)],
          timestamps: [now],
          source: "latest"
        };
      }

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
        values: points,
        timestamps: points.map((_, index) => Date.now() - ((pointCount - 1 - index) * rangeConfig.intervalMinutes * 60 * 1000)),
        source: "demo"
      };
    }

    function getTrendEwmaTimeConstantMinutes(metricKey) {
      if (metricKey === "co2") return 15;
      if (metricKey === "lux") return 20;
      if (["airTemp", "humidity", "vpd"].includes(metricKey)) return 30;
      return null;
    }

    function shouldSmoothTrendMetric(metricKey) {
      return getTrendEwmaTimeConstantMinutes(metricKey) !== null;
    }

    function getTrendEwmaLabel(metricKey) {
      const timeConstant = getTrendEwmaTimeConstantMinutes(metricKey);
      return timeConstant ? `EWMA · ${timeConstant} min` : "Raw only";
    }

    function calculateTimeAwareEwma(values, timestamps, timeConstantMinutes, fallbackIntervalMinutes) {
      if (!values.length) return [];
      let filteredValue = Number(values[0]);
      return values.map((value, index) => {
        const rawValue = Number(value);
        if (!Number.isFinite(rawValue)) return filteredValue;
        if (index === 0 || !Number.isFinite(filteredValue)) {
          filteredValue = rawValue;
          return filteredValue;
        }
        const currentTimestamp = Number(timestamps?.[index]);
        const previousTimestamp = Number(timestamps?.[index - 1]);
        const elapsedMinutes = Number.isFinite(currentTimestamp) && Number.isFinite(previousTimestamp) && currentTimestamp > previousTimestamp
          ? (currentTimestamp - previousTimestamp) / 60000
          : fallbackIntervalMinutes;
        const alpha = 1 - Math.exp(-Math.max(elapsedMinutes, 0.01) / timeConstantMinutes);
        filteredValue += alpha * (rawValue - filteredValue);
        return filteredValue;
      });
    }

    function getTrendDisplayValuesForMetric(rawValues, timestamps, metricKey, rangeKey) {
      const timeConstant = getTrendEwmaTimeConstantMinutes(metricKey);
      if (activeTrendPresentation !== "smoothed" || timeConstant === null || rawValues.length < 2) return rawValues;
      const fallbackInterval = trendRangeConfig[rangeKey]?.intervalMinutes || 10;
      return calculateTimeAwareEwma(rawValues, timestamps, timeConstant, fallbackInterval);
    }

    function getTrendDisplayValues(item, rangeKey) {
      return getTrendDisplayValuesForMetric(item.series.values, item.series.timestamps, item.option.key, rangeKey);
    }

    function getTrendMetricDisplayLabel(option) {
      return option?.key === "lux" ? "LUX" : option?.label || "";
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
          <span>${escapeHtml(getTrendMetricDisplayLabel(option))}</span>
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

    function renderTrendPresentationButtons(activeKey, metricKey) {
      const supportsEwma = shouldSmoothTrendMetric(metricKey);
      const effectiveActiveKey = supportsEwma ? activeKey : "raw";
      return [
        ["smoothed", getTrendEwmaLabel(metricKey)],
        ["raw", "Raw"]
      ].map(([key, label]) => `
        <button
          type="button"
          class="trend-history-presentation-button"
          data-trend-presentation="${key}"
          data-active="${String(key === effectiveActiveKey)}"
          aria-pressed="${String(key === effectiveActiveKey)}"
          ${key === "smoothed" && !supportsEwma ? "disabled" : ""}
        >${escapeHtml(label)}</button>
      `).join("");
    }

    function renderTrendScaleButtons(activeKey) {
      return [
        ["detail", translateInterfaceText("Detail")],
        ["target", translateInterfaceText("Target context")]
      ].map(([key, label]) => `
        <button
          type="button"
          class="trend-history-scale-button"
          data-trend-scale="${key}"
          data-active="${String(key === activeKey)}"
          aria-pressed="${String(key === activeKey)}"
        >${escapeHtml(label)}</button>
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

    function formatTrendTickValue(value, definition, metricKey) {
      return formatNumber(value, getTrendDecimalPlaces(definition, metricKey));
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

    function getTrendSeriesColor(index) {
      return ["#356b53", "#af7b2c", "#3d6f8f", "#8b5d7a", "#a05444", "#5b6f3d"][index % 6];
    }

    function getTrendAxisDomain(values, definition, optimalRange, scaleMode = activeTrendScaleMode) {
      const dataValues = values.map(Number).filter(Number.isFinite);
      if (!dataValues.length) return optimalRange;

      const dataMin = Math.min(...dataValues);
      const dataMax = Math.max(...dataValues);
      const decimals = Math.max(0, Number(definition.decimals) || 0);
      const precisionStep = 10 ** -decimals;
      // Keep a readable scale even when a sensor has reported the same value all day.
      const minimumSpan = Math.max(precisionStep * 4, Math.max(Math.abs(dataMin), Math.abs(dataMax), 1) * 0.02);
      const dataSpan = Math.max(dataMax - dataMin, minimumSpan);

      if (scaleMode === "target") {
        const contextMin = Math.min(dataMin, ...optimalRange.map(Number).filter(Number.isFinite));
        const contextMax = Math.max(dataMax, ...optimalRange.map(Number).filter(Number.isFinite));
        const contextSpan = Math.max(contextMax - contextMin, dataSpan);
        const contextPadding = Math.max(contextSpan * 0.08, precisionStep * 2);
        return [contextMin - contextPadding, contextMax + contextPadding];
      }

      const nearDataPadding = dataSpan * 0.18;
      let axisMin = dataMin - nearDataPadding;
      let axisMax = dataMax + nearDataPadding;

      // A nearby target line provides useful context; a distant target must not flatten the real curve.
      const nearbyTargetLimit = dataSpan * 0.5;
      for (const limit of optimalRange) {
        if (!Number.isFinite(Number(limit))) continue;
        if (limit >= dataMin - nearbyTargetLimit && limit <= dataMax + nearbyTargetLimit) {
          axisMin = Math.min(axisMin, limit - nearDataPadding);
          axisMax = Math.max(axisMax, limit + nearDataPadding);
        }
      }

      return [axisMin, axisMax];
    }

    function buildTrendValueColorPieces(item, optimalColor) {
      const definition = item.option.definition;
      const optimalRange = item.option.optimalRange || definition.optimal;
      const warningRange = definition.warning || optimalRange;
      const criticalColor = "#b13d32";
      const warningColor = "#d08a2d";

      if (definition.behavior === "higherIsBetter") {
        return [
          { lt: warningRange[0], color: criticalColor },
          { gte: warningRange[0], lt: optimalRange[0], color: warningColor },
          { gte: optimalRange[0], color: optimalColor }
        ];
      }

      return [
        { lt: warningRange[0], color: criticalColor },
        { gte: warningRange[0], lt: optimalRange[0], color: warningColor },
        { gte: optimalRange[0], lte: optimalRange[1], color: optimalColor },
        { gt: optimalRange[1], lte: warningRange[1], color: warningColor },
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
      const pointCount = seriesItems[0]?.series?.pointCount || seriesItems[0]?.series?.values?.length || 2;
      const pointIntervalMs = (totalHours * 60 * 60 * 1000) / Math.max(pointCount - 1, 1);
      const colors = seriesItems.map((_, index) => getTrendSeriesColor(index));
      const displayValuesByItem = new Map(seriesItems.map((item) => [
        item,
        getTrendDisplayValues(item, rangeKey)
      ]));
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
            const axisDomain = getTrendAxisDomain(displayValuesByItem.get(item), definition, optimalRange);
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
        const axisDomain = getTrendAxisDomain(displayValuesByItem.get(item), definition, optimalRange);
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
            formatter: (value) => formatTrendTickValue(value, definition, item.option.key)
          },
          nameTextStyle: {
            color,
            fontSize: 12,
            fontWeight: 800
          },
          axisPointer: {
            label: {
              formatter: (params) => formatTrendValue(params.value, definition, item.option.key)
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
        const displayValues = displayValuesByItem.get(item);
        const rawValues = item.series.values.map(Number);
        const isSmoothedView = activeTrendPresentation === "smoothed" && shouldSmoothTrendMetric(item.option.key);
        const extremaValues = isSmoothedView ? displayValues : rawValues;
        const minimumValue = Math.min(...extremaValues);
        const maximumValue = Math.max(...extremaValues);
        const minimumIndex = extremaValues.indexOf(minimumValue);
        const maximumIndex = extremaValues.indexOf(maximumValue);
        const axisDomain = getTrendAxisDomain(displayValues, definition, optimalRange);
        const isTargetVisible = (value) => value >= axisDomain[0] && value <= axisDomain[1];
        const visibleTargetMin = Math.max(Number(optimalRange[0]), axisDomain[0]);
        const visibleTargetMax = Math.min(Number(optimalRange[1]), axisDomain[1]);
        const hasVisibleTargetBand = visibleTargetMin < visibleTargetMax;
        const targetIsBelowView = Number(optimalRange[1]) < axisDomain[0];
        const targetIsAboveView = Number(optimalRange[0]) > axisDomain[1];
        const data = displayValues.map((value, pointIndex) => [
          item.series.timestamps?.[pointIndex] ?? rangeStart,
          value
        ]);
        const labelSide = index === 0 ? "insideStartTop" : "insideEndTop";
        const labelPrefix = shortMetricLabel(item.option.label);
        const targetMinLabel = `${labelPrefix} min ${formatValue(optimalRange[0], definition)}`;
        const targetMaxLabel = `${labelPrefix} max ${formatValue(optimalRange[1], definition)}`;
        const extremaPosition = (pointIndex, fallback) => {
          if (pointIndex <= 1) return "right";
          if (pointIndex >= extremaValues.length - 2) return "left";
          return fallback;
        };
        const extremaLabelColor = colorWithAlpha(color, 0.94);
        const extremaBackground = "rgba(255, 255, 255, 0.94)";
        const targetGap = targetIsBelowView
          ? Math.max(0, minimumValue - Number(optimalRange[1]))
          : targetIsAboveView
            ? Math.max(0, Number(optimalRange[0]) - maximumValue)
            : 0;
        const offscreenTargetLabel = targetIsBelowView || targetIsAboveView
          ? `${translateInterfaceText("Target")} ${formatValue(optimalRange[0], definition)}–${formatValue(optimalRange[1], definition)} ${targetIsBelowView ? "↓" : "↑"} · ${formatTrendValue(targetGap, definition, item.option.key)} ${translateInterfaceText("away")}`
          : "";

        const seriesOption = {
          name: translateInterfaceText(item.option.label),
          type: "line",
          yAxisIndex: index,
          data,
          showSymbol: false,
          symbol: "circle",
          symbolSize: 7,
          smooth: isSmoothedView ? 0.32 : false,
          smoothMonotone: isSmoothedView ? "x" : undefined,
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
              isTargetVisible(optimalRange[1]) && {
                name: targetMaxLabel,
                yAxis: optimalRange[1],
                label: { formatter: targetMaxLabel }
              },
              isTargetVisible(optimalRange[0]) && {
                name: targetMinLabel,
                yAxis: optimalRange[0],
                label: { formatter: targetMinLabel }
              },
              offscreenTargetLabel && {
                name: offscreenTargetLabel,
                yAxis: targetIsBelowView ? axisDomain[0] : axisDomain[1],
                lineStyle: { type: "dotted", opacity: 0.48 },
                label: {
                  formatter: offscreenTargetLabel,
                  position: targetIsBelowView ? "insideStartBottom" : "insideStartTop"
                }
              }
            ].filter(Boolean)
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
              fontSize: 12,
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
                coord: [item.series.timestamps?.[minimumIndex] ?? rangeStart, minimumValue],
                value: minimumValue,
                displayLabel: `MIN ${formatTrendValue(minimumValue, definition, item.option.key)}`,
                label: { position: extremaPosition(minimumIndex, "bottom") }
              },
              {
                name: "Maximum",
                coord: [item.series.timestamps?.[maximumIndex] ?? rangeStart, maximumValue],
                value: maximumValue,
                displayLabel: `MAX ${formatTrendValue(maximumValue, definition, item.option.key)}`,
                label: { position: extremaPosition(maximumIndex, "top") }
              }
            ]
          }
        };

        if (hasVisibleTargetBand) {
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
                yAxis: visibleTargetMin
              },
              {
                yAxis: visibleTargetMax
              }
            ]]
          };
        }

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
        visualMap: isMultiMetric ? [] : trendValueVisualMaps,
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
                const rawValue = item.series.values[param.dataIndex];
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:6px;">
                    <span style="display:flex;align-items:center;gap:7px;">
                      <span style="width:8px;height:8px;border-radius:50%;background:${colors[param.seriesIndex]};"></span>
                      ${escapeHtml(translateInterfaceText(item.option.label))}
                    </span>
                    <strong>${escapeHtml(formatTrendValue(rawValue, item.option.definition, item.option.key))}</strong>
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



    function getTrendAggregationLabel(response) {
      const stepMinutes = Number(response?.stepMinutes);
      const isPeak = String(response?.aggregation || "").startsWith("section_peak_");
      const aggregationName = isPeak ? "Section peak" : "Section median";
      if (Number.isFinite(stepMinutes) && stepMinutes > 0) {
        if (stepMinutes < 60) return `${aggregationName} · ${stepMinutes} min intervals`;
        const stepHours = stepMinutes / 60;
        return `${aggregationName} · ${Number.isInteger(stepHours) ? stepHours : stepHours.toFixed(1)}h intervals`;
      }

      const aggregationMatch = String(response?.aggregation || "").match(/^section_(?:median|peak)_(\d+)m$/);
      if (aggregationMatch) {
        const minutes = Number(aggregationMatch[1]);
        if (minutes < 60) return `${aggregationName} · ${minutes} min intervals`;
        const hours = minutes / 60;
        return `${aggregationName} · ${Number.isInteger(hours) ? hours : hours.toFixed(1)}h intervals`;
      }
      return "Real sensor readings";
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

      if (!isSiteView && selectedMetrics.length === 1) {
        fetchTrendSectionAnalytics(zone.id, selectedMetric.key, activeTrendRangeKey);
      }

      if (!selectedMetric) {
        return {
          title: isSiteView ? `24-hour trends for ${site.name}` : `24-hour trends for ${zone.name}`,
          summary: isSiteView
            ? `Waiting for live metrics from ${site.name}.`
            : `Waiting for live metrics from ${zone.name}.`,
          state: "optimal",
          rangeMeta: rangeConfig.meta,
          metricLabel: "No live metrics yet",
          metricMeta: isApiDataMode()
            ? "Waiting for the API to return configured sensor readings"
            : "No metric is selected",
          chartState: null,
          chartOption: null,
          axisLabels: {
            start: `${rangeConfig.label} window`,
            mid: "Real measurements",
            end: "Waiting for data"
          },
          metricButtons: renderTrendMetricButtons(trendMetricOptions, []),
          rangeButtons: renderTrendRangeButtons(activeTrendRangeKey),
          readoutHtml: "",
          hoverPoints: [],
          callout: isApiDataMode()
            ? "This section has no live metric available yet. It will update when the latest readings arrive."
            : "No metric is available for this selection.",
          backendNote: "Only real sensor history is shown here."
        };
      }

      const scopeSeed = isSiteView ? `${site.id}:site` : `${site.id}:${zone.id}:zone`;
      const historyStatuses = selectedMetrics.map((metricOption) => {
        if (isSiteView) return null;
        const cacheKey = getTrendHistoryCacheKey(zone.id, metricOption.key, activeTrendRangeKey);
        return trendHistoryStatusByKey[cacheKey] || null;
      }).filter(Boolean);
      const historyError = historyStatuses.find((status) => status.status === "error");
      if (isApiDataMode() && !isSiteView) {
        selectedMetrics.forEach((metricOption) => {
          fetchTrendHistoryForMetric(zone.id, metricOption.key, activeTrendRangeKey);
        });
      }
      const seriesItems = selectedMetrics.map((metricOption) => ({
        option: metricOption,
        series: buildTrendSeries(
          metricOption,
          activeTrendRangeKey,
          scopeSeed,
          !isSiteView ? trendHistoryByKey[getTrendHistoryCacheKey(zone.id, metricOption.key, activeTrendRangeKey)] : null
        )
      }));
      const selectedHistoryResponses = selectedMetrics.map((metricOption) =>
        !isSiteView
          ? trendHistoryByKey[getTrendHistoryCacheKey(zone.id, metricOption.key, activeTrendRangeKey)]
          : null
      );
      const aggregationLabel = getTrendAggregationLabel(selectedHistoryResponses.find(Boolean));
      const presentationLabel = activeTrendPresentation === "smoothed" && shouldSmoothTrendMetric(selectedMetric.key)
        ? `${getTrendEwmaLabel(selectedMetric.key)} filtered view`
        : "Raw measurements";

      const hasRenderableSeries = seriesItems.every((item) =>
        Array.isArray(item.series.values)
        && item.series.values.length > 0
        && item.series.values.every((value) => Number.isFinite(Number(value)))
      );

      if (!hasRenderableSeries) {
        return {
          title: isSiteView ? `24-hour trends for ${site.name}` : `24-hour trends for ${zone.name}`,
          summary: isSiteView
            ? `Select up to two metrics to compare how growing conditions moved across ${site.name}.`
            : `Select up to two metrics to compare how temperature, humidity, CO2, or VPD moved inside ${zone.name}.`,
          state: historyError ? "warning" : selectedMetric.state,
          rangeMeta: rangeConfig.meta,
          metricLabel: selectedMetrics.length > 1 ? `${selectedMetrics.length} metrics selected` : selectedMetric.label,
          metricMeta: isApiDataMode()
            ? historyError
              ? "History API request failed"
              : "Waiting for sensor history from the API"
            : `${selectedMetric.meta} · Target ${formatRange(selectedMetric.optimalRange || selectedMetric.definition.optimal, selectedMetric.definition)}`,
          chartState: null,
          chartOption: null,
          axisLabels: {
            start: `${rangeConfig.label} window`,
            mid: "Real measurements",
            end: `Y unit: ${formatUnit(selectedMetric.definition.unit)}`
          },
          metricButtons: renderTrendMetricButtons(trendMetricOptions, selectedMetrics.map((metric) => metric.key)),
          rangeButtons: renderTrendRangeButtons(activeTrendRangeKey),
          readoutHtml: "",
          hoverPoints: [],
          callout: isApiDataMode()
            ? historyError
              ? historyError.error || "History could not be loaded."
              : "Waiting for enough real history points to draw this trend."
            : "No trend points are available for this selection yet.",
          backendNote: "Only real sensor history is shown here."
        };
      }

      const series = seriesItems[0].series;
      const currentValue = series.values[series.values.length - 1];
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
        const observedAt = series.timestamps?.[index];
        const timestamp = tooltipDateFormat.format(new Date(
          Number.isFinite(observedAt)
            ? observedAt
            : rangeStart + ((series.values.length === 1 ? 1 : index / (series.values.length - 1)) * rangeConfig.totalHours * 60 * 60 * 1000)
        ));
        return {
          value: formatTrendValue(value, selectedMetric.definition, selectedMetric.key),
          time: timestamp,
          items: seriesItems.map((item) => ({
            label: item.option.label,
            value: formatTrendValue(item.series.values[index], item.option.definition, item.option.key)
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
          ? `${aggregationLabel} · ${presentationLabel} · Dual-axis comparison with real units`
          : `${aggregationLabel} · ${presentationLabel} · Target ${formatRange(optimalRange, selectedMetric.definition)}`,
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
        backendNote: isSiteView ? "Area comparison uses the selected section summaries." : aggregationLabel
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

      if (!chartOption) {
        elements.trendHistoryChart.innerHTML = `
          <div class="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-ink/52">
            Waiting for real sensor history.
          </div>
        `;
        return;
      }

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
      try {
        trendHistoryChartInstance.setOption(chartOption, { notMerge: true });
        window.requestAnimationFrame(() => trendHistoryChartInstance?.resize());
      } catch (error) {
        console.warn("Trend chart render failed.", error);
        trendHistoryChartInstance.dispose();
        trendHistoryChartInstance = null;
        elements.trendHistoryChart.innerHTML = `
          <div class="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-ink/52">
            Trend chart could not be rendered.
          </div>
        `;
      }
    }

    function disposeTrendComparisonChart() {
      trendComparisonChartInstance?.dispose();
      trendComparisonChartInstance = null;
    }

    function formatAnalyticsDuration(minutes) {
      const value = Math.max(0, Number(minutes) || 0);
      const hours = Math.floor(value / 60);
      const remainder = Math.round(value % 60);
      return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
    }

    function renderTrendComparisonChart(comparison, metricOption, rangeKey) {
      const element = document.getElementById("trendComparisonChart");
      if (!element || !window.echarts || !comparison?.series?.length) return;
      disposeTrendComparisonChart();
      trendComparisonChartInstance = window.echarts.init(element, null, { renderer: "svg" });
      const comparisonSeries = comparison.series.map((item) => {
        const rawValues = item.points.map((point) => Number(point.value));
        const timestamps = item.points.map((point) => new Date(point.observedAt).getTime());
        const displayValues = getTrendDisplayValuesForMetric(rawValues, timestamps, metricOption.key, rangeKey);
        return {
          name: item.sectionName,
          rawValues,
          data: item.points.map((point, index) => [timestamps[index], displayValues[index]])
        };
      });
      trendComparisonChartInstance.setOption({
        animation: false,
        color: ["#356b53", "#af7b2c", "#3d6f8f", "#8b5d7a", "#a05444", "#5b6f3d"],
        grid: { left: 58, right: 24, top: 42, bottom: 34 },
        legend: { top: 4, type: "scroll", textStyle: { fontSize: 11 } },
        tooltip: {
          trigger: "axis",
          formatter: (rawParams) => {
            const params = Array.isArray(rawParams) ? rawParams : [rawParams];
            const timestamp = params[0]?.value?.[0] ? new Date(params[0].value[0]).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB") : "";
            const rows = params.map((param) => {
              const source = comparisonSeries[param.seriesIndex];
              const rawValue = source?.rawValues?.[param.dataIndex];
              return `${escapeHtml(param.seriesName)}: <strong>${escapeHtml(formatTrendValue(rawValue, metricOption.definition, metricOption.key))}</strong>`;
            }).join("<br>");
            return `<strong>${escapeHtml(timestamp)}</strong><br>${rows}`;
          }
        },
        xAxis: { type: "time", axisLabel: { fontSize: 12 } },
        yAxis: { type: "value", scale: true, axisLabel: { formatter: (value) => formatTrendTickValue(value, metricOption.definition, metricOption.key), fontSize: 12 } },
        series: comparisonSeries.map((item) => ({
          name: item.name,
          type: "line",
          showSymbol: false,
          smooth: activeTrendPresentation === "smoothed" && shouldSmoothTrendMetric(metricOption.key) ? 0.32 : false,
          smoothMonotone: activeTrendPresentation === "smoothed" && shouldSmoothTrendMetric(metricOption.key) ? "x" : undefined,
          data: item.data
        }))
      });
    }

    function renderTrendAnalytics({ site, zone, metricOption, rangeKey, isSiteView }) {
      const panel = elements.trendAnalyticsPanel;
      if (!panel) return;
      if (isSiteView || !site || !zone || !metricOption || !isApiDataMode()) {
        panel.hidden = true;
        panel.innerHTML = "";
        disposeTrendComparisonChart();
        return;
      }

      const key = getTrendAnalyticsCacheKey(zone.id, metricOption.key, rangeKey);
      const analytics = trendAnalyticsByKey[key];
      const analyticsStatus = trendAnalyticsStatusByKey[key];
      fetchTrendSectionAnalytics(zone.id, metricOption.key, rangeKey);
      panel.hidden = false;

      if (!analytics) {
        panel.innerHTML = `<div class="trend-analytics-loading">${analyticsStatus?.status === "error" ? escapeHtml(analyticsStatus.error) : "Preparing time-in-target data from real sensor history..."}</div>`;
        disposeTrendComparisonChart();
        return;
      }

      const summary = analytics.timeInTarget || {};
      const expectedMinutes = Math.max(1, Number(summary.expectedMinutes) || 0);
      const stateLabels = { optimal: "In target", warning: "Warning", critical: "Critical", unavailable: "No data" };
      const timeCards = ["optimal", "warning", "critical", "unavailable"].map((state) => {
        const minutes = Number(summary[state]) || 0;
        return `<div class="trend-time-card" data-state="${state}"><span>${stateLabels[state]}</span><strong>${Math.round((minutes / expectedMinutes) * 100)}%</strong><small>${formatAnalyticsDuration(minutes)}</small></div>`;
      }).join("");

      const eligibleZones = site.zones || [];
      const selected = trendComparisonZoneIds.filter((id) => eligibleZones.some((item) => item.id === id));
      trendComparisonZoneIds = selected.length ? selected : [zone.id, ...eligibleZones.filter((item) => item.id !== zone.id).slice(0, 3).map((item) => item.id)];
      const comparisonKey = `${site.id}:${metricOption.key}:${rangeKey}:${[...trendComparisonZoneIds].sort().join(",")}`;
      const comparison = trendComparisonByKey[comparisonKey];
      if (trendComparisonZoneIds.length > 1) fetchTrendSiteComparison(site, metricOption.key, rangeKey, trendComparisonZoneIds);

      panel.innerHTML = `
        <section class="trend-analytics-card trend-time-in-target">
          <header><div><span>Time in target</span><strong>${escapeHtml(metricOption.label)}</strong></div><small>${Math.round(((Number(summary.coveredMinutes) || 0) / expectedMinutes) * 100)}% sensor coverage</small></header>
          <div class="trend-time-cards">${timeCards}</div>
        </section>
        <section class="trend-analytics-card trend-comparison">
          <header><div><span>Zone comparison</span><strong>${escapeHtml(metricOption.label)} across this site</strong></div><small>Choose up to six zones</small></header>
          <div class="trend-comparison-options">${eligibleZones.map((item) => `<label class="trend-comparison-zone"><input type="checkbox" data-trend-comparison-zone="${escapeAttribute(item.id)}" ${trendComparisonZoneIds.includes(item.id) ? "checked" : ""}><span>${escapeHtml(item.name)}</span></label>`).join("")}</div>
          <div id="trendComparisonChart" class="trend-comparison-chart"></div>
          ${trendComparisonZoneIds.length < 2 ? '<p class="trend-analytics-empty">Choose at least two zones to compare.</p>' : ""}
        </section>`;

      renderTrendComparisonChart(comparison, metricOption, rangeKey);
    }

    function openTrendHistory(metricKey) {
      if (metricKey) {
        activeTrendMetricKey = metricKey;
        activeTrendMetricKeys = [metricKey];
      }
      activePrimaryPage = "history";
      sidebarActionOverride = null;
      activeViewScope = "zone";
      activeWorkspaceFocus = "all";
      setExperienceMode("detailed");
      renderDashboard();
      syncTopLevelRoute("/history");
      scrollToSection("historySection");
    }

    function getCsvExportMetricKeys(zone) {
      const profile = cropProfiles[zone?.profile] || getDefaultCropProfileTemplate();
      const availableMetrics = new Set(zone?.availableMetrics || []);
      if (availableMetrics.has("airTemp") && availableMetrics.has("humidity")) availableMetrics.add("vpd");
      return Object.keys(profile.metrics || {}).filter((key) => availableMetrics.has(key));
    }

    function getCsvExportSectionOptions(siteId, selectedZoneId = "") {
      const site = dashboardData.sites.find((item) => item.id === siteId);
      const zones = site?.zones || [];
      if (!zones.length) return `<option value="">No sections in this area</option>`;
      return zones.map((zone) => `<option value="${escapeAttribute(zone.id)}" ${zone.id === selectedZoneId ? "selected" : ""}>${escapeHtml(zone.name)}</option>`).join("");
    }

    function openCsvExportModal() {
      const site = getActiveSite();
      const zone = getActiveZone(site);

      if (!isApiDataMode() || activeViewScope === "site" || !zone?.id) return;
      const metricKeys = getCsvExportMetricKeys(zone);
      const profile = cropProfiles[zone.profile] || getDefaultCropProfileTemplate();

      managementModalState = { type: "csv-export" };
      elements.managementModalOverlay.innerHTML = `
        <div class="management-modal-backdrop" data-management-modal-close></div>
        <section class="management-modal-shell" role="dialog" aria-modal="true" aria-labelledby="csvExportTitle">
          <header class="management-modal-header">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-pine/56">Data export</p>
              <h2 id="csvExportTitle" class="mt-1.5 font-display text-2xl font-bold text-ink">Download measurements</h2>
              <p class="mt-2 text-sm leading-6 text-ink/60">Choose the section, period, and parameters to include in an Excel-friendly CSV file.</p>
            </div>
            <button type="button" class="management-modal-close actionable" data-management-modal-close aria-label="Close export"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <form class="management-modal-body" data-csv-export-form>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block"><span class="text-sm font-semibold text-ink/72">Area</span><select name="csvAreaId" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink">${dashboardData.sites.map((item) => `<option value="${escapeAttribute(item.id)}" ${item.id === site.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
              <label class="block"><span class="text-sm font-semibold text-ink/72">Section</span><select name="csvSectionId" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink">${getCsvExportSectionOptions(site.id, zone.id)}</select></label>
              <label class="block"><span class="text-sm font-semibold text-ink/72">Period</span><select name="csvRange" class="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink">${Object.entries(trendRangeConfig).map(([key, config]) => `<option value="${key}" ${key === activeTrendRangeKey ? "selected" : ""}>Last ${config.label}</option>`).join("")}</select></label>
              <div class="rounded-[18px] bg-[#f8f3ea] px-4 py-3 text-sm leading-6 text-ink/60"><strong class="block text-ink">Format</strong>Semicolon-separated CSV with separate date and time columns, ready for Excel.</div>
            </div>
            <fieldset class="mt-5"><legend class="text-sm font-semibold text-ink/72">Parameters</legend><div class="mt-2 grid gap-2 sm:grid-cols-2">${metricKeys.map((key) => `<label class="flex items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2 text-sm font-semibold text-ink"><input type="checkbox" name="csvMetric" value="${escapeAttribute(key)}" checked class="h-4 w-4 accent-[#21473b]"><span>${escapeHtml(profile.metrics[key]?.label || key)}${profile.metrics[key]?.unit ? ` (${escapeHtml(formatUnit(profile.metrics[key].unit))})` : ""}</span></label>`).join("") || `<p class="text-sm text-ink/60">No detected sensor metrics are available in this section yet.</p>`}</div></fieldset>
            <p class="management-modal-error mt-4 rounded-[16px] bg-[#f9e3df] px-3.5 py-2.5 text-sm font-semibold text-ember" role="alert" hidden></p>
            <div class="mt-5 flex gap-3"><button type="submit" class="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Download CSV</button><button type="button" class="actionable rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink/72" data-management-modal-close>Cancel</button></div>
          </form>
        </section>
      `;
      elements.managementModalOverlay.hidden = false;
      enhanceDashboardSelects(elements.managementModalOverlay);
    }

    async function submitCsvExport() {
      const form = elements.managementModalOverlay.querySelector("[data-csv-export-form]");
      const error = elements.managementModalOverlay.querySelector(".management-modal-error");
      const data = new FormData(form);
      const sectionId = String(data.get("csvSectionId") || "");
      const rangeConfig = trendRangeConfig[String(data.get("csvRange") || "")] || trendRangeConfig["24h"];
      const metrics = data.getAll("csvMetric").map(String).filter(Boolean);
      if (!sectionId || metrics.length === 0) {
        if (error) { error.textContent = "Choose a section and at least one parameter."; error.hidden = false; }
        return;
      }

      try {
        const to = new Date();
        const from = new Date(to.getTime() - (rangeConfig.totalHours * 60 * 60 * 1000));
        await window.NeuroCropApi.downloadMeasurementsCsv({
          sectionId,
          metrics: metrics.join(","),
          from: from.toISOString(),
          to: to.toISOString()
        });
        closeManagementModal();
      } catch (error) {
        if (error) { error.textContent = error instanceof Error ? error.message : "CSV export could not be generated."; error.hidden = false; }
      }
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
      const visual = hasCurrentValue ? getLiveReadingPositionVisual(typicalResult, definition) : null;
      const trendCacheKey = getTrendHistoryCacheKey(zone?.id, key, "24h");
      const trendStatus = trendHistoryStatusByKey[trendCacheKey]?.status || "idle";
      const trendResponse = trendHistoryByKey[trendCacheKey] || null;
      const trend = isAvailable && trendStatus === "ready" ? getDiagnosticTrend(result, definition, scopeSeed, trendResponse) : null;
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
              <strong>${escapeHtml(formatRange(definition.optimal, definition))}</strong>
            </div>
            <div class="live-reading-position">
              ${visual ? `
                <span class="live-reading-track" aria-label="${diagnosticText("Section median position against target", "Sekcijos medianos padėtis tikslinio intervalo atžvilgiu")}">
                  ${visual.zones.map((zone) => `<i class="live-reading-zone" data-tone="${zone.tone}" data-side="${zone.side}" style="left:${zone.left.toFixed(2)}%;width:${zone.width.toFixed(2)}%"></i>`).join("")}
                  <i class="live-reading-marker" style="left:${visual.marker.toFixed(2)}%"></i>
                </span>
              ` : `<span class="live-reading-no-data">${diagnosticText("No sensor data", "Nėra sensoriaus duomenų")}</span>`}
            </div>
            <div class="live-reading-trend">
              <span>${diagnosticText("24h", "24 val.")}</span>
              <strong>${trend ? escapeHtml(getLiveReadingDirection(trend, definition)) : trendStatus === "loading" || trendStatus === "idle" ? diagnosticText("Loading", "Kraunama") : "—"}</strong>
              <small>${trend ? escapeHtml(formatSignedValue(trend.delta, definition)) : trendStatus === "error" ? diagnosticText("History unavailable", "Istorija nepasiekiama") : ""}</small>
            </div>
            <span class="live-reading-status" data-state="${escapeAttribute(isAvailable ? typicalResult.state : "unavailable")}">${escapeHtml(["offline", "missing", "not-installed"].includes(observation.state) ? observation.label : statusLabel)}</span>
            <button type="button" class="live-reading-trend-button" data-history-metric="${escapeAttribute(key)}" aria-label="${escapeAttribute(diagnosticText(`Open ${definition.label} trend`, `Atidaryti ${getDiagnosticMetricLabel(definition.label)} grafiką`))}" title="${escapeAttribute(diagnosticText("Open trend", "Atidaryti grafiką"))}" ${isAvailable ? "" : "disabled"}>
              <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
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

    function renderLiveReadingsBoard(results, profile, site, zone, options = {}) {
      const installedResults = results.filter((result) => result.available !== false);
      if (isApiDataMode() && zone?.id && !options.isLoading) {
        queueMicrotask(() => installedResults.forEach((result) => fetchTrendHistoryForMetric(zone.id, result.key, "24h")));
      }
      const apiResponse = isApiDataMode() ? latestReadingsBySectionId[zone?.id] : null;
      const derived = apiResponse?.derived || {};
      const airTemp = Number(apiResponse?.observations?.airTemp?.value);
      const dewPoint = Number(derived.dew_point);
      const absoluteHumidity = Number(derived.absolute_humidity);
      const dewPointSpread = Number.isFinite(airTemp) && Number.isFinite(dewPoint) ? airTemp - dewPoint : null;
      const formatDiagnosticNumber = (value, decimals = 1) => Number(value).toLocaleString(
        interfaceLanguage === "lt" ? "lt-LT" : "en-GB",
        { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      );
      const climateDiagnostics = Number.isFinite(dewPoint) || Number.isFinite(absoluteHumidity)
        ? `<aside class="climate-diagnostics" aria-label="Climate diagnostics">
            <span class="climate-diagnostics-label">${diagnosticText("Climate diagnostics", "Klimato diagnostika")}</span>
            ${Number.isFinite(dewPoint) ? `<span><b>${diagnosticText("Dew point", "Rasos taškas")}</b> ${formatDiagnosticNumber(dewPoint)} °C</span>` : ""}
            ${Number.isFinite(absoluteHumidity) ? `<span><b>${diagnosticText("Absolute humidity", "Absoliuti drėgmė")}</b> ${formatDiagnosticNumber(absoluteHumidity, 2)} g/m³</span>` : ""}
            ${Number.isFinite(dewPointSpread) ? `<span><b>${diagnosticText("Dew-point spread", "Temperatūros skirtumas iki rasos taško")}</b> ${formatDiagnosticNumber(dewPointSpread)} °C</span>` : ""}
          </aside>`
        : "";
      const loadingHtml = options.isLoading ? `
        <div class="space-y-2" role="status" aria-live="polite" aria-label="Loading live readings">
          ${Array.from({ length: 4 }, () => `
            <div class="grid min-h-[72px] grid-cols-[1.4fr_.7fr_.9fr_1.8fr_.7fr] items-center gap-4 rounded-2xl border border-black/6 bg-white px-4 animate-pulse">
              <span class="h-4 w-32 rounded bg-ink/10"></span><span class="h-6 w-16 rounded bg-ink/10"></span><span class="h-4 w-20 rounded bg-ink/10"></span><span class="h-3 w-full rounded bg-ink/10"></span><span class="h-5 w-16 rounded-full bg-ink/10"></span>
            </div>`).join("")}
          <p class="px-1 text-sm text-ink/55">Loading the latest readings from this section…</p>
        </div>
      ` : "";
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
        ${loadingHtml}
        ${installedResults.map((result) => renderLiveReadingRow(
          result.key,
          profile.metrics[result.key],
          result,
          `${site.id}:${zone.id}:live-readings`,
          zone,
          getZoneMetricFreshness(zone, result.key)
        )).join("")}
        ${climateDiagnostics}
      `;
    }

    const areaLiveMetricPriority = [
      "airTemp",
      "humidity",
      "vpd",
      "co2",
      "lux",
      "soilTemp",
      "soilMoisture",
      "waterTemp",
      "ec",
      "ph",
      "airPressure"
    ];
    const areaLiveEssentialMetricKeys = [
      "airTemp",
      "humidity",
      "vpd",
      "co2"
    ];

    function getAreaLiveMetricKeys(siteSnapshots, activeLens) {
      let metricKeys = [...new Set(siteSnapshots.flatMap((snapshot) =>
        snapshot.results
          .filter((result) => result.key !== "batteryLevel" && result.configured !== false)
          .map((result) => result.key)
      ))];

      if (activeLens?.kind === "group") {
        metricKeys = metricKeys.filter((key) => getMetricWorkbenchGroup(key).key === activeLens.groupKey);
      } else if (activeLens?.key === "essential") {
        metricKeys = metricKeys.filter((key) => areaLiveEssentialMetricKeys.includes(key));
      } else if (activeLens?.key === "focus") {
        metricKeys = metricKeys.filter((key) => siteSnapshots.some((snapshot) => {
          const result = snapshot.results.find((item) => item.key === key);
          return result && (result.available === false || result.state !== "optimal");
        }));
      } else if (activeLens?.key === "coverage") {
        metricKeys = metricKeys.filter((key) => siteSnapshots.some((snapshot) => {
          const result = snapshot.results.find((item) => item.key === key);
          return !result || result.available === false;
        }));
      }

      return metricKeys.sort((left, right) => {
        const leftPriority = areaLiveMetricPriority.indexOf(left);
        const rightPriority = areaLiveMetricPriority.indexOf(right);
        const leftRank = leftPriority < 0 ? areaLiveMetricPriority.length : leftPriority;
        const rightRank = rightPriority < 0 ? areaLiveMetricPriority.length : rightPriority;
        return leftRank - rightRank || left.localeCompare(right);
      });
    }

    function getAreaSectionReadingFreshness(snapshot) {
      if (!isApiDataMode()) {
        return { state: "live", label: diagnosticText("Live", "Dabar"), detail: diagnosticText("Demo data", "Demonstraciniai duomenys") };
      }
      const response = latestReadingsBySectionId[snapshot.zone.id];
      const requestStatus = latestReadingsStatusBySectionId[snapshot.zone.id];
      if (requestStatus?.status === "loading") {
        return { state: "loading", label: diagnosticText("Loading", "Kraunama"), detail: diagnosticText("Fetching latest readings", "Gaunami naujausi rodmenys") };
      }
      if (!response?.lastReceivedAt) {
        return {
          state: requestStatus?.status === "error" ? "offline" : "stale",
          label: requestStatus?.status === "error" ? diagnosticText("Unavailable", "Nepasiekiama") : diagnosticText("No data", "Nėra duomenų"),
          detail: requestStatus?.error || diagnosticText("No sensor reading received yet", "Sensoriaus rodmenų dar negauta")
        };
      }

      const receivedAtMs = new Date(response.lastReceivedAt).getTime();
      if (!Number.isFinite(receivedAtMs)) {
        return {
          state: "stale",
          label: diagnosticText("Invalid time", "Neteisingas laikas"),
          detail: diagnosticText("The latest sensor timestamp is invalid", "Naujausio sensoriaus rodmens laikas yra neteisingas")
        };
      }
      const ageSec = Math.max(0, Math.round((Date.now() - receivedAtMs) / 1000));
      const expectedIntervalSec = Math.max(30, Number(response.expectedUplinkIntervalSec) || 600);
      const state = ageSec <= expectedIntervalSec * 2.5
        ? "live"
        : ageSec <= expectedIntervalSec * 6
          ? "delayed"
          : "stale";
      return {
        state,
        label: formatFreshnessAge(ageSec),
        detail: diagnosticText(`Last section uplink ${formatFreshnessAge(ageSec)}`, `Paskutinis sekcijos ryšys: ${formatFreshnessAge(ageSec)}`)
      };
    }

    function getAreaLiveUnitLabel(unit) {
      const normalized = String(unit || "").trim();
      if (normalized === "degC") return "°C";
      if (normalized === "percent") return "%";
      return normalized;
    }

    function renderAreaLiveReadingsBoard(siteSnapshots, site, activeLens) {
      const metricKeys = getAreaLiveMetricKeys(siteSnapshots, activeLens);
      const temperatureSamples = siteSnapshots.flatMap((snapshot) => {
        const result = snapshot.results.find((item) => item.key === "airTemp");
        const definition = snapshot.profile.metrics.airTemp;
        return result?.available !== false && definition
          ? [{ snapshot, result, definition }]
          : [];
      }).sort((left, right) => left.result.value - right.result.value);
      const coolest = temperatureSamples[0] || null;
      const warmest = temperatureSamples[temperatureSamples.length - 1] || null;
      const temperatureRange = coolest && warmest
        ? `${formatValue(coolest.result.value, coolest.definition)}–${formatValue(warmest.result.value, warmest.definition)}`
        : "—";
      const attentionCount = siteSnapshots.filter((snapshot) => snapshotHasLiveGrowthData(snapshot) && snapshot.overall.state !== "optimal").length;
      const reportingCount = siteSnapshots.filter((snapshot) => snapshot.results.some((result) =>
        result.key !== "batteryLevel" && result.available !== false
      )).length;
      const loadingCount = siteSnapshots.filter((snapshot) => latestReadingsStatusBySectionId[snapshot.zone.id]?.status === "loading").length;
      const metricDefinition = (key) => siteSnapshots.find((snapshot) => snapshot.profile.metrics[key])?.profile.metrics[key] || null;

      const summaryHtml = `
        <div class="area-live-summary" aria-label="${escapeAttribute(diagnosticText(`${site.name} live summary`, `${site.name} dabartinių rodmenų santrauka`))}">
          <article class="area-live-summary-card area-live-temperature">
            <span>${diagnosticText("Temperature across sections", "Temperatūra sekcijose")}</span>
            <strong>${escapeHtml(temperatureRange)}</strong>
            <small>${coolest && warmest
              ? escapeHtml(diagnosticText(`Coolest ${coolest.snapshot.zone.name} · warmest ${warmest.snapshot.zone.name}`, `Vėsiausia ${coolest.snapshot.zone.name} · šilčiausia ${warmest.snapshot.zone.name}`))
              : escapeHtml(diagnosticText("Waiting for temperature readings", "Laukiama temperatūros rodmenų"))}</small>
          </article>
          <article class="area-live-summary-card" data-tone="${attentionCount > 0 ? "warning" : "optimal"}">
            <span>${diagnosticText("Sections needing attention", "Sekcijos, kurioms reikia dėmesio")}</span>
            <strong>${attentionCount}</strong>
            <small>${attentionCount > 0
              ? escapeHtml(diagnosticText(`${attentionCount} of ${siteSnapshots.length} outside target`, `${attentionCount} iš ${siteSnapshots.length} už tikslinių ribų`))
              : escapeHtml(diagnosticText("All reporting sections are in target", "Visos duomenis siunčiančios sekcijos yra normoje"))}</small>
          </article>
          <article class="area-live-summary-card" data-tone="${reportingCount === siteSnapshots.length ? "optimal" : "neutral"}">
            <span>${diagnosticText("Data coverage", "Duomenų aprėptis")}</span>
            <strong>${reportingCount}/${siteSnapshots.length}</strong>
            <small>${loadingCount > 0
              ? escapeHtml(diagnosticText(`Refreshing ${loadingCount} sections`, `Atnaujinama sekcijų: ${loadingCount}`))
              : escapeHtml(diagnosticText("Sections with current measurements", "Sekcijos su dabartiniais matavimais"))}</small>
          </article>
        </div>`;

      if (metricKeys.length === 0) {
        return `${summaryHtml}${renderWorkbenchEmptyState(
          diagnosticText("No measurements match this filter.", "Šio filtro neatitinka nė vienas matavimas."),
          diagnosticText("Choose All parameters or another metric group.", "Pasirinkite visus parametrus arba kitą metrikų grupę."),
          "all"
        )}`;
      }

      const tableHead = `
        <div class="area-live-matrix-row area-live-matrix-head" role="row">
          <span role="columnheader">${diagnosticText("Section", "Sekcija")}</span>
          ${metricKeys.map((key) => {
            const definition = metricDefinition(key);
            return `<span role="columnheader"><b>${escapeHtml(getDiagnosticMetricLabel(definition?.label || key))}</b><small>${escapeHtml(getAreaLiveUnitLabel(definition?.unit))}</small></span>`;
          }).join("")}
          <span role="columnheader">${diagnosticText("Latest data", "Naujausi duomenys")}</span>
          <span aria-hidden="true"></span>
        </div>`;

      const rows = siteSnapshots.map((snapshot) => {
        const freshness = getAreaSectionReadingFreshness(snapshot);
        const score = getContextScoreSummary(snapshotHasLiveGrowthData(snapshot) ? snapshot.overall : null);
        const cells = metricKeys.map((key) => {
          const result = snapshot.results.find((item) => item.key === key);
          const definition = snapshot.profile.metrics[key] || metricDefinition(key);
          const isConfigured = Boolean(result && result.configured !== false && definition);
          const isAvailable = isConfigured && result.available !== false;
          const state = isAvailable ? result.state : "unavailable";
          const status = !isConfigured
            ? diagnosticText("Not installed", "Neįdiegta")
            : freshness.state === "loading"
              ? diagnosticText("Loading", "Kraunama")
              : diagnosticText("No current data", "Nėra dabartinių duomenų");
          const value = isAvailable ? formatValue(result.value, definition) : status;
          const stateLabel = isAvailable ? (result.statusLabel || stateConfig[result.state]?.label || "") : status;
          return `
            <div class="area-live-value" role="cell" data-state="${escapeAttribute(state)}" data-freshness="${escapeAttribute(freshness.state)}" title="${escapeAttribute(isAvailable ? result.deviationText : status)}" aria-label="${escapeAttribute(`${value}${stateLabel ? `, ${stateLabel}` : ""}`)}">
              <strong>${escapeHtml(value)}</strong>
            </div>`;
        }).join("");

        return `
          <article class="area-live-matrix-row area-live-section-row" role="row" data-state="${escapeAttribute(score.state)}" data-freshness="${escapeAttribute(freshness.state)}">
            <div class="area-live-section" role="rowheader">
              <span class="overview-section-state-dot" aria-hidden="true"></span>
              <span class="area-live-section-copy"><strong title="${escapeAttribute(snapshot.zone.name)}">${escapeHtml(snapshot.zone.name)}</strong></span>
              <span class="area-live-score" data-state="${escapeAttribute(score.state)}" title="${escapeAttribute(score.text)}" aria-label="${escapeAttribute(diagnosticText(`Growing conditions score ${score.score}`, `Auginimo sąlygų įvertis ${score.score}`))}"><strong>${escapeHtml(score.score)}</strong></span>
            </div>
            ${cells}
            <div class="area-live-freshness" role="cell" data-freshness="${escapeAttribute(freshness.state)}" title="${escapeAttribute(freshness.detail)}">
              <span class="reading-freshness-label" data-observation="${escapeAttribute(freshness.state)}">${escapeHtml(freshness.label)}</span>
            </div>
            <button type="button" class="area-live-open" data-area-reading-section="${escapeAttribute(snapshot.zone.id)}" data-area-reading-site="${escapeAttribute(snapshot.site.id)}" aria-label="${escapeAttribute(diagnosticText(`Open ${snapshot.zone.name} readings`, `Atidaryti sekcijos „${snapshot.zone.name}“ rodmenis`))}">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </article>`;
      }).join("");

      return `
        ${summaryHtml}
        <div class="area-live-matrix-scroll">
          <div class="area-live-matrix" role="table" aria-label="${escapeAttribute(diagnosticText(`Live readings by section in ${site.name}`, `${site.name} sekcijų dabartiniai rodmenys`))}" style="--area-live-metric-count:${metricKeys.length};--area-live-min-width:${Math.max(880, 320 + metricKeys.length * 145)}px;--area-live-wide-min-width:${Math.max(980, 350 + metricKeys.length * 160)}px">
            ${tableHead}
            ${rows}
          </div>
        </div>`;
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
              <span class="state-chip metric-state-chip" data-role="state-chip" data-state="${result.state}">${escapeHtml(result.statusLabel || stateConfig[result.state].label)}</span>
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
        stateChip.textContent = result.statusLabel || stateConfig[result.state].label;
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





    function evaluateZoneSnapshot(site, zone, readingsOverride = null) {
      const profile = cropProfiles[zone.profile];
      const readings = readingsOverride || (isApiDataMode() ? readingsFromApiObservations(latestReadingsBySectionId[zone.id]) : getZoneReadings(profile, zone, activeScenarioKey));
      const availableMetrics = new Set(zone.availableMetrics || []);
      const results = Object.entries(profile.metrics).map(([key, definition]) => {
        const isConfigured = isMetricConfiguredForReadings(key, availableMetrics, readings);
        const hasLiveValue = Number.isFinite(Number(readings?.[key]));
        const metricAvailableSet = isConfigured && !availableMetrics.has(key)
          ? new Set([...availableMetrics, key])
          : availableMetrics;
        return {
          key,
          scoreWeight: Number.isFinite(Number(definition.scoreWeight)) ? clamp(Number(definition.scoreWeight), 0, 3) : 1,
          configured: isConfigured,
          available: isConfigured && (!isApiDataMode() || hasLiveValue),
          ...(isConfigured
            ? evaluateMetricForReadings(definition, key, metricAvailableSet, readings)
            : { value: null, state: "unavailable", severity: 0, scalePosition: 0, deviationText: "Unavailable", narrative: "Sensor not installed." })
        };
      }).sort((left, right) => {
        if (left.available === right.available) return 0;
        return left.available === false ? 1 : -1;
      });

      const overall = getBackendOverallState(zone) || deriveOverallState(results);
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

    function getActionHistoryPresentation(item) {
      const status = ["completed", "deferred", "failed"].includes(item?.status) ? item.status : "unknown";
      const outcomeState = item?.outcome?.state || "awaiting_data";
      const feedbackLabels = {
        completed: diagnosticText("Done", "Atlikta"),
        deferred: diagnosticText("Deferred", "Atidėta"),
        failed: diagnosticText("Could not complete", "Nepavyko atlikti"),
        unknown: diagnosticText("Unknown", "Nežinoma")
      };
      const outcomeLabels = {
        awaiting_data: diagnosticText("Collecting sensor readings", "Renkami sensoriaus matavimai"),
        insufficient_data: diagnosticText("Not enough readings to verify", "Nepakanka matavimų rezultatui patvirtinti"),
        improving: diagnosticText("Sensor confirms improvement", "Sensorius patvirtina gerėjimą"),
        target_reached: diagnosticText("Sensor confirms the target was reached", "Sensorius patvirtina, kad tikslas pasiektas"),
        unchanged: diagnosticText("No meaningful change detected", "Reikšmingo pokyčio nenustatyta"),
        worsened: diagnosticText("Conditions moved further from target", "Sąlygos nutolo nuo tikslo"),
        not_improving: diagnosticText("Sensor does not confirm improvement yet", "Sensorius dar nepatvirtina gerėjimo"),
        not_applicable: diagnosticText("Sensor check is not applicable", "Sensoriaus patikra netaikoma")
      };
      const executionDetails = item?.executionDetails;
      const feedbackSummaryParts = [feedbackLabels[status]];
      if (status === "completed" && executionDetails?.type) {
        feedbackSummaryParts.push(getActionExecutionTypeLabel(executionDetails.type));
        if (executionDetails.adjustment) feedbackSummaryParts.push(executionDetails.adjustment);
        if (Number.isInteger(Number(executionDetails.durationMinutes)) && Number(executionDetails.durationMinutes) > 0) {
          feedbackSummaryParts.push(`${Number(executionDetails.durationMinutes)} ${diagnosticText("min", "min.")}`);
        }
      }
      const feedbackSummary = feedbackSummaryParts.filter(Boolean).join(" · ");
      let sensorLabel = outcomeLabels[outcomeState] || item?.outcome?.label || outcomeState;
      if (status === "deferred") {
        sensorLabel = diagnosticText("Not checked: action was deferred", "Netikrinta: veiksmas atidėtas");
      } else if (status === "failed") {
        sensorLabel = diagnosticText("Not checked: action was not completed", "Netikrinta: veiksmas neatliktas");
      }

      const rawBaselineValue = item?.outcome?.baselineValue;
      const rawCurrentValue = item?.outcome?.currentValue;
      const hasBaselineValue = rawBaselineValue !== null
        && rawBaselineValue !== undefined
        && rawBaselineValue !== ""
        && Number.isFinite(Number(rawBaselineValue));
      const hasCurrentValue = rawCurrentValue !== null
        && rawCurrentValue !== undefined
        && rawCurrentValue !== ""
        && Number.isFinite(Number(rawCurrentValue));
      const displayUnit = item.unit === "degC" ? "°C" : item.unit || "";
      const sampleCount = Math.max(0, Number(item?.outcome?.sampleCount) || 0);
      const requiredSampleCount = Math.max(0, Number(item?.outcome?.requiredSampleCount) || 0);
      if (status === "completed" && hasBaselineValue && hasCurrentValue) {
        const formattedBaseline = Number(rawBaselineValue).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { maximumFractionDigits: 2 });
        const formattedValue = Number(rawCurrentValue).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { maximumFractionDigits: 2 });
        sensorLabel += ` · ${formattedBaseline} → ${formattedValue} ${displayUnit}`;
      }
      if (status === "completed" && requiredSampleCount > 0) {
        sensorLabel += ` · ${sampleCount}/${requiredSampleCount} ${diagnosticText("readings", "mat.")}`;
      }
      const eligibleAtMs = new Date(item?.outcome?.eligibleAt || 0).getTime();
      if (status === "completed" && outcomeState === "awaiting_data" && Number.isFinite(eligibleAtMs) && eligibleAtMs > Date.now()) {
        const minutes = Math.max(1, Math.ceil((eligibleAtMs - Date.now()) / 60_000));
        sensorLabel = `${diagnosticText("Verification starts in", "Vertinimas prasidės po")} ${minutes} ${diagnosticText("min", "min.")} · ${sampleCount}/${requiredSampleCount} ${diagnosticText("readings", "mat.")}`;
      }

      const icon = status === "deferred"
        ? "fa-clock"
        : status === "failed"
          ? "fa-xmark"
          : outcomeState === "target_reached"
            ? "fa-check"
            : outcomeState === "improving"
              ? "fa-arrow-trend-up"
              : outcomeState === "worsened" || outcomeState === "not_improving"
                ? "fa-triangle-exclamation"
                : outcomeState === "unchanged"
                  ? "fa-minus"
                  : outcomeState === "insufficient_data"
                    ? "fa-circle-question"
                : "fa-clock";
      return { status, outcomeState, feedbackSummary, sensorLabel, icon };
    }

    function renderTriageFeedbackControls(action) {
      if (!action) return "";
      const localFeedback = todayPriorityFeedbackState.actionId === action.id ? todayPriorityFeedbackState : null;
      const persistedFeedback = action.feedback || null;
      const feedbackLabels = {
        completed: diagnosticText("Done", "Atlikta"),
        deferred: diagnosticText("Deferred", "Atidėta"),
        failed: diagnosticText("Could not complete", "Nepavyko atlikti")
      };
      const persistedText = persistedFeedback
        ? `${feedbackLabels[persistedFeedback.status] || persistedFeedback.status} · ${new Date(persistedFeedback.createdAt).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}`
        : "";
      return `
        <div class="triage-feedback" data-saving="${localFeedback?.saving === true}">
          <span>${diagnosticText("Was this action carried out?", "Ar šis veiksmas atliktas?")}</span>
          <div class="triage-feedback-actions" role="group" aria-label="${diagnosticText("Record action outcome", "Išsaugoti veiksmo rezultatą")}">
            <button type="button" data-triage-feedback="completed" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving || persistedFeedback?.status === "completed" ? "disabled" : ""}><i class="fa-solid fa-check" aria-hidden="true"></i>${diagnosticText("Done", "Atlikta")}</button>
            <button type="button" data-triage-feedback="deferred" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving || persistedFeedback?.status === "deferred" ? "disabled" : ""}><i class="fa-regular fa-clock" aria-hidden="true"></i>${diagnosticText("Defer", "Atidėti")}</button>
            <button type="button" data-triage-feedback="failed" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving || persistedFeedback?.status === "failed" ? "disabled" : ""}><i class="fa-solid fa-xmark" aria-hidden="true"></i>${diagnosticText("Could not complete", "Nepavyko")}</button>
          </div>
          ${(localFeedback?.message || persistedText) ? `<small data-error="${localFeedback?.error === true}" role="${localFeedback?.error ? "alert" : "status"}" aria-live="polite"><i class="fa-solid ${localFeedback?.error ? "fa-triangle-exclamation" : localFeedback?.saving ? "fa-circle-notch fa-spin" : "fa-circle-check"}" aria-hidden="true"></i>${escapeHtml(localFeedback?.message || persistedText)}</small>` : ""}
        </div>
      `;
    }

    function renderTriageActionHistory() {
      const items = (backendActionHistory || []).slice(0, 4);
      if (items.length === 0) return "";
      return `
        <section class="triage-section triage-history-section">
          <div class="triage-section-heading">
            <div><span class="triage-eyebrow">${diagnosticText("Action history", "Veiksmų istorija")}</span><h3>${diagnosticText("What happened after your actions", "Kas įvyko po jūsų veiksmų")}</h3></div>
            <span>${diagnosticText("Result uses at least 3 readings after the response delay", "Rezultatas vertinamas bent iš 3 matavimų po laukimo intervalo")}</span>
          </div>
          <div class="triage-history-list">
            ${items.map((item) => {
              const presentation = getActionHistoryPresentation(item);
              const actor = item.createdByName || diagnosticText("Team member", "Komandos narys");
              const createdAt = new Date(item.createdAt).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
              return `
                <article class="triage-history-row" data-outcome="${escapeAttribute(presentation.outcomeState)}" data-feedback-status="${escapeAttribute(presentation.status)}">
                  <span class="triage-history-icon"><i class="fa-solid ${presentation.icon}" aria-hidden="true"></i></span>
                  <span class="triage-history-copy">
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(`${item.areaName || diagnosticText("Area", "Area")} · ${item.sectionName} · ${actor} · ${createdAt}`)}</small>
                    <span class="triage-history-feedback" data-status="${escapeAttribute(presentation.status)}">${escapeHtml(`${diagnosticText("Recorded", "Užregistruota")}: ${presentation.feedbackSummary}`)}</span>
                  </span>
                  <span class="triage-history-outcome" data-outcome="${escapeAttribute(presentation.outcomeState)}">${escapeHtml(presentation.sensorLabel)}</span>
                </article>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }

    function renderOverviewTriage({
      site,
      zone,
      profile,
      results,
      displayedOverallState,
      globalState,
      systemLowBatteryNodes,
      globalSnapshots
    }) {
      const availableBackendActions = Array.isArray(backendTodayActions) ? backendTodayActions : [];
      const snapshotsByZoneId = new Map(globalSnapshots.map((snapshot) => [snapshot.zone.id, snapshot]));
      const liveSnapshots = globalSnapshots.filter(snapshotHasLiveGrowthData);
      const attentionSnapshots = liveSnapshots
        .filter((snapshot) => snapshot.overall.state !== "optimal")
        .sort((left, right) => left.overall.indexScore - right.overall.indexScore);
      const stableSnapshots = liveSnapshots.filter((snapshot) => snapshot.overall.state === "optimal");
      const unverifiedSnapshots = globalSnapshots.filter((snapshot) => !snapshotHasLiveGrowthData(snapshot));
      const criticalCount = attentionSnapshots.filter((snapshot) => snapshot.overall.state === "critical").length;
      const selectedSnapshot = snapshotsByZoneId.get(zone.id)
        || { site, zone, profile, results, overall: displayedOverallState };
      const backendPriorityAction = availableBackendActions[0] || null;
      const backendPrioritySnapshot = backendPriorityAction
        ? snapshotsByZoneId.get(backendPriorityAction.sectionId)
        : null;
      const prioritySnapshot = backendPrioritySnapshot
        || attentionSnapshots[0]
        || liveSnapshots[0]
        || selectedSnapshot;
      const getPrimaryIssue = (snapshot) => snapshot.results
        .filter((result) => result.available !== false && isGrowthMetricKey(result.key) && result.state !== "optimal")
        .sort((left, right) => right.severity - left.severity)[0] || null;
      const priorityResult = backendPriorityAction
        ? {
            key: backendPriorityAction.metricId,
            value: backendPriorityAction.value,
            state: backendPriorityAction.state,
            severity: backendPriorityAction.severity,
            deviationText: backendPriorityAction.reason
          }
        : getPrimaryIssue(prioritySnapshot);
      const priorityDefinition = priorityResult
        ? prioritySnapshot.profile.metrics[priorityResult.key]
        : null;
      const priorityHasLiveData = snapshotHasLiveGrowthData(prioritySnapshot);
      const priorityMetricKey = priorityResult?.key || "humidity";
      const priorityTone = priorityHasLiveData
        ? priorityResult?.state || "optimal"
        : "neutral";
      const priorityTitle = !priorityHasLiveData
        ? diagnosticText("Restore current data before changing the climate", "Prieš keisdami klimatą atkurkite dabartinius duomenis")
        : backendPriorityAction?.title
          || (priorityResult && priorityDefinition
            ? getDiagnosticActionTitle(priorityResult, priorityDefinition, priorityDefinition.label)
            : diagnosticText("No intervention is needed right now", "Šiuo metu įsikišti nereikia"));
      const priorityGuidance = !priorityHasLiveData
        ? diagnosticText(
            "Check node power and the latest connection before making a growing decision.",
            "Prieš priimdami auginimo sprendimą patikrinkite mazgo maitinimą ir paskutinį ryšį."
          )
        : backendPriorityAction?.recommendedAction
          || (priorityResult && priorityDefinition
            ? getDiagnosticAction(priorityResult.key, priorityDefinition.label)
            : diagnosticText(
                "Keep the current routine and check again during the next walk.",
                "Tęskite dabartinę rutiną ir dar kartą patikrinkite per kitą apėjimą."
              ));
      const priorityAction = priorityHasLiveData ? "trend" : "nodes";
      const priorityActionLabel = priorityHasLiveData
        ? diagnosticText("See what changed", "Peržiūrėti pokytį")
        : diagnosticText("Check sensor nodes", "Patikrinti sensorių mazgus");
      const attentionCount = attentionSnapshots.length;
      const totalSections = globalSnapshots.length;
      const headline = criticalCount > 0
        ? diagnosticText(
            `${criticalCount} urgent section${criticalCount === 1 ? "" : "s"} need a visit`,
            `${criticalCount} ${criticalCount === 1 ? "sekciją reikia aplankyti skubiai" : "sekcijas reikia aplankyti skubiai"}`
          )
        : attentionCount > 0
          ? diagnosticText(
              `${attentionCount} section${attentionCount === 1 ? "" : "s"} need a check today`,
              `${attentionCount} ${attentionCount === 1 ? "sekciją šiandien reikia patikrinti" : "sekcijas šiandien reikia patikrinti"}`
            )
          : unverifiedSnapshots.length > 0
            ? diagnosticText(
                `${unverifiedSnapshots.length} section${unverifiedSnapshots.length === 1 ? "" : "s"} cannot be verified`,
                `${unverifiedSnapshots.length} ${unverifiedSnapshots.length === 1 ? "sekcijos būklės negalima patvirtinti" : "sekcijų būklės negalima patvirtinti"}`
              )
            : diagnosticText("Everything is on track", "Viskas vyksta pagal planą");
      const intro = attentionCount > 0
        ? diagnosticText(
            `Start in ${prioritySnapshot.site.name}, ${prioritySnapshot.zone.name}. The rest can wait.`,
            `Pradėkite nuo ${prioritySnapshot.site.name}, ${prioritySnapshot.zone.name}. Visa kita gali palaukti.`
          )
        : diagnosticText(
            "No growing intervention is required. Keep the normal walk and routine.",
            "Auginimo sąlygų keisti nereikia. Tęskite įprastą apėjimą ir rutiną."
          );

      const seenRouteZones = new Set();
      const routeEntries = [];
      availableBackendActions.forEach((action) => {
        const snapshot = snapshotsByZoneId.get(action.sectionId);
        if (!snapshot || seenRouteZones.has(snapshot.zone.id)) return;
        seenRouteZones.add(snapshot.zone.id);
        routeEntries.push({ snapshot, backendAction: action });
      });
      attentionSnapshots.forEach((snapshot) => {
        if (seenRouteZones.has(snapshot.zone.id)) return;
        seenRouteZones.add(snapshot.zone.id);
        routeEntries.push({ snapshot, backendAction: null });
      });
      const visibleRouteEntries = routeEntries.slice(0, 5);
      const remainingRouteCount = Math.max(routeEntries.length - visibleRouteEntries.length, 0);
      const routeMarkup = visibleRouteEntries.map(({ snapshot, backendAction }, index) => {
        const result = backendAction
          ? {
              key: backendAction.metricId,
              value: backendAction.value,
              state: backendAction.state,
              severity: backendAction.severity,
              deviationText: backendAction.reason
            }
          : getPrimaryIssue(snapshot);
        const definition = result ? snapshot.profile.metrics[result.key] : null;
        const title = backendAction?.title
          || (result && definition
            ? getDiagnosticActionTitle(result, definition, definition.label)
            : diagnosticText("Check this section", "Patikrinkite šią sekciją"));
        const evidence = result && definition
          ? `${formatValue(result.value, definition)} · ${getDiagnosticDeviationText(result)}`
          : diagnosticText("Review current conditions", "Peržiūrėkite dabartines sąlygas");
        return `
          <li class="grower-route-item" data-state="${escapeAttribute(result?.state || snapshot.overall.state)}">
            <span class="grower-route-number">${index + 1}</span>
            <span class="grower-route-copy">
              <small>${escapeHtml(snapshot.site.name)} <i aria-hidden="true">/</i> ${escapeHtml(snapshot.zone.name)}</small>
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(evidence)}</span>
            </span>
            <span class="grower-route-actions">
              <button type="button" class="grower-route-open" data-overview-section-card data-site-id="${escapeAttribute(snapshot.site.id)}" data-zone-id="${escapeAttribute(snapshot.zone.id)}">
                ${diagnosticText("Open section", "Atidaryti sekciją")}
              </button>
              <button type="button" class="grower-route-trend" data-triage-action="trend" data-metric-key="${escapeAttribute(result?.key || "humidity")}" data-site-id="${escapeAttribute(snapshot.site.id)}" data-zone-id="${escapeAttribute(snapshot.zone.id)}" aria-label="${escapeAttribute(diagnosticText(`Open trend for ${snapshot.zone.name}`, `Atidaryti sekcijos „${snapshot.zone.name}“ grafiką`))}">
                <i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>
              </button>
            </span>
          </li>
        `;
      }).join("");

      const areaBands = dashboardData.sites.map((area) => {
        const areaSnapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === area.id);
        const liveAreaSnapshots = areaSnapshots.filter(snapshotHasLiveGrowthData);
        const areaAttention = liveAreaSnapshots.filter((snapshot) => snapshot.overall.state !== "optimal");
        const areaUnverified = areaSnapshots.filter((snapshot) => !snapshotHasLiveGrowthData(snapshot));
        const areaState = areaAttention.some((snapshot) => snapshot.overall.state === "critical")
          ? "critical"
          : areaAttention.length > 0
            ? "warning"
            : areaUnverified.length > 0
              ? "neutral"
              : "optimal";
        const areaStatus = areaAttention.length > 0
          ? diagnosticText(
              `${areaAttention.length} need attention`,
              `${areaAttention.length} reikia dėmesio`
            )
          : areaUnverified.length > 0
            ? diagnosticText(
                `${areaUnverified.length} without current data`,
                `${areaUnverified.length} be dabartinių duomenų`
              )
            : diagnosticText("All sections on target", "Visos sekcijos atitinka tikslą");
        const sectionRows = areaSnapshots.map((snapshot) => {
          const hasLiveData = snapshotHasLiveGrowthData(snapshot);
          const issue = hasLiveData ? getPrimaryIssue(snapshot) : null;
          const definition = issue ? snapshot.profile.metrics[issue.key] : null;
          const condition = !hasLiveData
            ? diagnosticText("No current data", "Nėra dabartinių duomenų")
            : issue && definition
              ? `${getDiagnosticMetricLabel(definition.label)}: ${getDiagnosticDeviationText(issue)}`
              : diagnosticText("On target", "Atitinka tikslą");
          const state = !hasLiveData ? "neutral" : issue?.state || "optimal";
          return `
            <button type="button" class="grower-section-line" data-overview-section-card data-site-id="${escapeAttribute(area.id)}" data-zone-id="${escapeAttribute(snapshot.zone.id)}" data-state="${escapeAttribute(state)}" data-selected="${snapshot.zone.id === zone.id}">
              <span class="grower-section-state" aria-hidden="true"></span>
              <strong>${escapeHtml(snapshot.zone.name)}</strong>
              <span>${escapeHtml(condition)}</span>
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          `;
        }).join("") || `<p class="grower-area-empty">${diagnosticText("No sections configured", "Sekcijų nėra")}</p>`;
        return `
          <article class="grower-area-band" data-state="${escapeAttribute(areaState)}" data-selected="${area.id === site.id}">
            <header>
              <button type="button" data-overview-area-card="${escapeAttribute(area.id)}">
                <span>
                  <small>${diagnosticText("Growing area", "Auginimo objektas")}</small>
                  <strong>${escapeHtml(area.name)}</strong>
                </span>
                <span class="grower-area-status" data-state="${escapeAttribute(areaState)}">${escapeHtml(areaStatus)}</span>
              </button>
              <span>${liveAreaSnapshots.length}/${areaSnapshots.length} ${diagnosticText("verified", "patvirtinta")}</span>
            </header>
            <div class="grower-section-lines">${sectionRows}</div>
          </article>
        `;
      }).join("");

      const systemNote = unverifiedSnapshots.length > 0 || systemLowBatteryNodes.length > 0
        ? `
          <div class="grower-system-note" data-state="warning">
            <i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i>
            <span>
              <strong>${diagnosticText("Before the next round", "Prieš kitą apėjimą")}</strong>
              <small>${escapeHtml(diagnosticText(
                `${unverifiedSnapshots.length} unverified sections · ${systemLowBatteryNodes.length} low-battery nodes`,
                `${unverifiedSnapshots.length} nepatvirtintos sekcijos · ${systemLowBatteryNodes.length} mazgai su silpna baterija`
              ))}</small>
            </span>
            <button type="button" data-triage-action="nodes">${diagnosticText("Check system", "Patikrinti sistemą")}</button>
          </div>
        `
        : `
          <div class="grower-system-note" data-state="optimal">
            <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
            <span><strong>${diagnosticText("System is not blocking today's work", "Sistema netrukdo šiandienos darbams")}</strong><small>${diagnosticText("Current data is available across every section.", "Visose sekcijose yra dabartiniai duomenys.")}</small></span>
          </div>
        `;

      elements.overviewTriageSection.dataset.state = globalState;
      elements.overviewTriageSection.innerHTML = `
        <div class="grower-overview">
          <header class="grower-day-header">
            <div>
              <span class="grower-overline">${diagnosticText("Today's growing plan", "Šiandienos auginimo planas")}</span>
              <h1>${escapeHtml(headline)}</h1>
              <p>${escapeHtml(intro)}</p>
            </div>
            <button type="button" class="grower-compare-button" data-triage-action="readings">
              ${diagnosticText("Compare all sections", "Palyginti visas sekcijas")}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
          </header>

          <div class="grower-command-layout">
            <article class="grower-command" data-state="${escapeAttribute(priorityTone)}">
              <header>
                <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(prioritySnapshot.site.name)} · ${escapeHtml(prioritySnapshot.zone.name)}</span>
                <small>${diagnosticText("Do this first", "Pirmiausia padarykite tai")}</small>
              </header>
              <h2>${escapeHtml(priorityTitle)}</h2>
              ${priorityHasLiveData && priorityResult && priorityDefinition ? `
                <div class="grower-command-evidence">
                  <span><small>${diagnosticText("Now", "Dabar")}</small><strong>${escapeHtml(formatValue(priorityResult.value, priorityDefinition))}</strong></span>
                  <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
                  <span><small>${diagnosticText("Aim for", "Tikslas")}</small><strong>${escapeHtml(formatRange(priorityDefinition.optimal, priorityDefinition))}</strong></span>
                </div>
              ` : ""}
              <div class="grower-command-instruction">
                <span>${diagnosticText("Action", "Veiksmas")}</span>
                <p>${escapeHtml(priorityGuidance)}</p>
              </div>
              <div class="grower-command-buttons">
                <button type="button" class="grower-command-primary" data-triage-action="${escapeAttribute(priorityAction)}" data-metric-key="${escapeAttribute(priorityMetricKey)}" data-site-id="${escapeAttribute(prioritySnapshot.site.id)}" data-zone-id="${escapeAttribute(prioritySnapshot.zone.id)}">
                  ${escapeHtml(priorityActionLabel)} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>
                <button type="button" class="grower-command-secondary" data-overview-section-card data-site-id="${escapeAttribute(prioritySnapshot.site.id)}" data-zone-id="${escapeAttribute(prioritySnapshot.zone.id)}">
                  ${diagnosticText("Open section", "Atidaryti sekciją")}
                </button>
              </div>
              ${priorityHasLiveData ? renderTriageFeedbackControls(backendPriorityAction) : ""}
            </article>

            <aside class="grower-pulse" aria-label="${escapeAttribute(diagnosticText("Farm status", "Ūkio būsena"))}">
              <span class="grower-overline">${diagnosticText("Right now", "Dabar")}</span>
              <div class="grower-pulse-main" data-state="${escapeAttribute(attentionCount > 0 ? globalState : "optimal")}">
                <strong>${attentionCount}</strong>
                <span>${diagnosticText("sections to check", "sekcijos patikrai")}</span>
              </div>
              <dl>
                <div><dt>${diagnosticText("On target", "Atitinka tikslą")}</dt><dd>${stableSnapshots.length}</dd></div>
                <div><dt>${diagnosticText("Current data", "Dabartiniai duomenys")}</dt><dd>${liveSnapshots.length}/${totalSections}</dd></div>
                <div><dt>${diagnosticText("Urgent", "Skubiai")}</dt><dd>${criticalCount}</dd></div>
              </dl>
              ${systemNote}
            </aside>
          </div>

          <section class="grower-route" aria-labelledby="growerRouteTitle">
            <header>
              <div>
                <span class="grower-overline">${diagnosticText("Inspection route", "Apėjimo maršrutas")}</span>
                <h2 id="growerRouteTitle">${attentionCount > 0 ? diagnosticText("Walk these sections in this order", "Aplankykite sekcijas šia tvarka") : diagnosticText("No corrective walk is needed", "Korekcinio apėjimo nereikia")}</h2>
              </div>
              ${remainingRouteCount > 0 ? `<span>+${remainingRouteCount} ${diagnosticText("more in comparison", "dar palyginime")}</span>` : ""}
            </header>
            ${visibleRouteEntries.length > 0
              ? `<ol>${routeMarkup}</ol>`
              : `
                <div class="grower-route-clear">
                  <i class="fa-solid fa-seedling" aria-hidden="true"></i>
                  <div><strong>${diagnosticText("Conditions are inside the configured targets", "Sąlygos atitinka nustatytus tikslus")}</strong><span>${diagnosticText("Use the time for the normal crop walk instead.", "Skirkite laiką įprastai augalų apžiūrai.")}</span></div>
                </div>
              `}
          </section>

          <section class="grower-farm-board" aria-labelledby="growerFarmBoardTitle">
            <header>
              <div>
                <span class="grower-overline">${diagnosticText("Whole farm", "Visas ūkis")}</span>
                <h2 id="growerFarmBoardTitle">${diagnosticText("Every growing area, one scan", "Visi auginimo objektai vienu žvilgsniu")}</h2>
              </div>
              <p>${diagnosticText("Open a section only when you need its detail.", "Sekciją atidarykite tik tada, kai reikia detalių.")}</p>
            </header>
            <div class="grower-area-list">${areaBands}</div>
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

    function getDiagnosticTrend(result, definition, scopeSeed, historyResponse = null) {
      const series = buildTrendSeries({
        key: result.key,
        value: result.value,
        state: result.state,
        definition,
        optimalRange: definition.optimal
      }, "24h", scopeSeed, historyResponse);
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

    function getLiveReadingDirection(trend, definition) {
      if (!trend) return "—";
      const tolerance = Math.max(Math.abs(definition.optimal[1] - definition.optimal[0]) * 0.015, 0.001);
      if (trend.delta > tolerance) return diagnosticText("Rising", "Didėja");
      if (trend.delta < -tolerance) return diagnosticText("Falling", "Mažėja");
      return diagnosticText("Stable", "Stabili");
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

    function getLiveReadingPositionVisual(result, definition) {
      const optimal = definition?.optimal;
      if (!Array.isArray(optimal) || optimal.length < 2) return null;

      const warning = Array.isArray(definition.warning) ? definition.warning : optimal;
      const critical = Array.isArray(definition.critical) ? definition.critical : warning;
      const value = Number(result?.value);
      const scaleMin = Math.min(critical[0], warning[0], optimal[0], value);
      const scaleMax = Math.max(critical[1], warning[1], optimal[1], value);
      const span = Math.max(scaleMax - scaleMin, 0.001);
      const toTrackPercent = (rangeValue) => clamp(((rangeValue - scaleMin) / span) * 100, 0, 100);
      const zone = (tone, start, end, side = "") => ({
        tone,
        side,
        left: toTrackPercent(start),
        width: Math.max(toTrackPercent(end) - toTrackPercent(start), 0)
      });

      return {
        marker: clamp(toTrackPercent(value), 2, 98),
        zones: [
          zone("critical", scaleMin, warning[0], "left"),
          zone("warning", warning[0], optimal[0], "left"),
          zone("optimal", optimal[0], optimal[1]),
          zone("warning", optimal[1], warning[1], "right"),
          zone("critical", warning[1], scaleMax, "right")
        ].filter((item) => item.width > 0)
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
      availableResults,
      displayedOverallState,
      siteSnapshots,
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
      const dynamics = dynamicsBySectionId[zone.id] || null;
      const dynamicsStatus = dynamicsStatusBySectionId[zone.id]?.status || "idle";
      if (isApiDataMode() && dynamicsStatus === "idle") queueMicrotask(() => fetchSectionDynamics(zone.id));
      const dynamicsMetricRows = dynamics
        ? ["airTemp", "humidity", "co2", "lux", "vpd", "soilTemp"]
            .filter((metricKey) => dynamics.metrics?.[metricKey] && profile.metrics?.[metricKey])
            .slice(0, 3)
            .map((metricKey) => ({ metricKey, definition: profile.metrics[metricKey], summary: dynamics.metrics[metricKey] }))
        : [];
      const dynamicsDirectionLabel = (direction) => ({
        stable: diagnosticText("Stable", "Stabili"),
        rising: diagnosticText("Rising", "Kyla"),
        falling: diagnosticText("Falling", "Krinta"),
        improving: diagnosticText("Improving", "Gerėja"),
        declining: diagnosticText("Declining", "Blogėja")
      }[direction] || direction || "—");
      const lighting = dynamics?.lighting || null;
      const factors = [
        ...trendRows.map((item) => ({
          label: getDiagnosticMetricLabel(item.definition.label),
          current: formatValue(item.result.value, item.definition),
          target: formatRange(item.definition.optimal, item.definition),
          state: item.result.state,
          visual: getDiagnosticDeviationVisual(item.result, item.definition),
          impact: getDiagnosticImpact(item.result),
          trend: item.trend.direction,
          duration: item.result.state === "optimal"
            ? diagnosticText("In range", "Normoje")
            : diagnosticText("Latest reading", "Naujausias matavimas")
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
              <small>${primaryTrend ? `${formatSignedValue(primaryTrend.delta, primaryDefinition)} · ${diagnosticText("latest reading", "naujausias matavimas")}` : diagnosticText("No active deviation", "Aktyvaus nuokrypio nėra")}</small>
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
                <small>${diagnosticText("Score history is not available yet", "Score istorija dar nepasiekiama")}</small>
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
              <div><span class="diagnostic-eyebrow">${diagnosticText("Monitoring coverage", "Stebėjimo aprėptis")}</span><h3>${diagnosticText("Installed sensor coverage", "Įdiegtų sensorių aprėptis")}</h3></div>
            </div>
            <div class="diagnostic-coverage">
              <strong>${coverage.available}/${coverage.total}</strong>
              <span>${escapeHtml(confidenceLabel)}</span>
            </div>
            <div class="diagnostic-trust-facts">
              <span><i class="fa-solid fa-circle-check" aria-hidden="true"></i>${coverage.available} ${diagnosticText("configured metrics reporting", "sukonfigūruoti rodikliai siunčia duomenis")}</span>
              <span><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${coverage.unavailable} ${diagnosticText("configured metrics not reporting", "sukonfigūruoti rodikliai nesiunčia duomenų")}</span>
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
              ${dynamicsStatus === "loading" || dynamicsStatus === "idle" ? `<div><span>${diagnosticText("24h analytics", "24 val. analitika")}</span><strong>…</strong><small>${diagnosticText("Loading measured history", "Kraunama matavimų istorija")}</small></div>` : dynamicsStatus === "error" ? `<div><span>${diagnosticText("24h analytics", "24 val. analitika")}</span><strong>—</strong><small>${diagnosticText("History could not be loaded", "Istorijos įkelti nepavyko")}</small></div>` : `
                <div><span>${diagnosticText("Growing score", "Auginimo sąlygų įvertis")}</span><strong>${dynamics?.score ? `${dynamics.score.start} → ${dynamics.score.end}` : "—"}</strong><small>${dynamics?.score ? `${escapeHtml(dynamicsDirectionLabel(dynamics.score.direction))} · ${dynamics.score.delta >= 0 ? "+" : ""}${dynamics.score.delta}` : diagnosticText("Not enough measured inputs", "Nepakanka išmatuotų rodiklių")}</small></div>
                ${dynamicsMetricRows.map((item) => `<div><span>${escapeHtml(getDiagnosticMetricLabel(item.definition.label))}</span><strong>${escapeHtml(formatValue(item.summary.start, item.definition))} → ${escapeHtml(formatValue(item.summary.end, item.definition))}</strong><small>${escapeHtml(dynamicsDirectionLabel(item.summary.direction))} · min ${escapeHtml(formatValue(item.summary.min, item.definition))} · max ${escapeHtml(formatValue(item.summary.max, item.definition))}</small></div>`).join("")}
              `}
            </div>
            ${lighting?.configured ? `<div class="diagnostic-lighting-summary">
              <div><span>${diagnosticText("Current light phase", "Dabartinis šviesos etapas")}</span><strong>${escapeHtml(lighting.currentState === "expected_darkness" ? diagnosticText("Expected darkness", "Numatyta tamsa") : lighting.currentState === "unexpected_light" ? diagnosticText("Unexpected night light", "Netikėta šviesa naktį") : lighting.currentState === "critical_darkness" ? diagnosticText("Missing scheduled light", "Trūksta numatytos šviesos") : diagnosticText("Scheduled light", "Numatyta šviesa"))}</strong><small>${escapeHtml(lighting.schedule.start)}–${escapeHtml(lighting.schedule.end)}</small></div>
              <div><span>${diagnosticText("Photoperiod achieved", "Pasiektas fotoperiodas")}</span><strong>${lighting.photoperiodAchievedPct ?? "—"}%</strong><small>${Number(lighting.achievedLightHours || 0).toFixed(1)} / ${Number(lighting.expectedLightHours || 0).toFixed(1)} h · ${lighting.expectedLightDataCoveragePct ?? "—"}% ${diagnosticText("data", "duomenų")}</small></div>
              <div><span>${diagnosticText("Time in light target", "Laikas tiksliniame apšvietime")}</span><strong>${lighting.timeInLightTargetPct ?? "—"}%</strong><small>${lighting.unexpectedDarkMinutes || 0} min ${diagnosticText("unexpected darkness", "netikėtos tamsos")}</small></div>
              <div><span>${diagnosticText("Approximate DLI", "Apytikslis DLI")}</span><strong>${Number(lighting.approximateDli || 0).toFixed(1)}</strong><small>mol/m²/day · ${diagnosticText("estimated from lux", "įvertinta pagal lux")}</small></div>
            </div>` : `<p class="diagnostic-model-note">${diagnosticText(`Configure the lighting period in the “${profile.name}” Crop Profile to distinguish expected darkness from a lighting failure.`, `Crop Profile „${profile.name}“ nustatykite apšvietimo periodą, kad numatyta tamsa būtų atskirta nuo apšvietimo gedimo.`)}</p>`}
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
            <button type="button" class="diagnostic-secondary-button" data-triage-action="readings" data-site-id="${escapeAttribute(site.id)}">${diagnosticText("Compare sections", "Palyginti sekcijas")}</button>
            ${selectedLowBatteryNodes.length > 0 ? `<button type="button" class="diagnostic-secondary-button" data-triage-action="nodes">${diagnosticText("Check node batteries", "Patikrinti mazgų baterijas")}</button>` : ""}
          </div>
        </section>
        ${renderTriageActionHistory()}
      `;
    }

    function renderEmptyAreaState(site) {
      activeViewScope = "site";
      activeProfileKey = cropProfiles.default ? "default" : Object.keys(cropProfiles)[0] || "default";
      renderSiteOptions();
      renderZoneOptions();
      updateSidebarActionState();

      if (activePrimaryPage === "blocks") {
        activeBlockFilterSiteId = site.id;
        blockFormState = {
          mode: "create",
          siteId: site.id,
          zoneId: "",
          name: "",
          profile: activeProfileKey,
          sensorCount: "0"
        };
        elements.overviewTriageSection.hidden = true;
        elements.heroStatusPanel.hidden = true;
        elements.blocksManagementSection.hidden = false;
        renderBlocksManagementPage([]);
        return;
      }

      elements.siteContextValue.textContent = site.name;
      elements.siteContextMeta.textContent = diagnosticText("No sections yet", "Sekcijų dar nėra");
      elements.siteContextMeta.dataset.state = "neutral";
      elements.zoneContextCard.dataset.disabled = "true";
      elements.zoneTrigger.disabled = true;
      elements.zoneTrigger.setAttribute("aria-disabled", "true");
      elements.zoneContextValue.textContent = diagnosticText("No sections", "Nėra sekcijų");
      elements.zoneContextMeta.textContent = diagnosticText("Create the first section to start monitoring.", "Sukurkite pirmą sekciją ir pradėkite stebėjimą.");
      elements.zoneContextMeta.dataset.state = "neutral";
      elements.profileContextValue.textContent = cropProfiles[activeProfileKey]?.name || "Default";
      elements.profileContextMeta.textContent = diagnosticText("Ready to assign", "Paruoštas priskyrimui");

      elements.heroStatusPanel.hidden = true;
      elements.overviewTriageSection.hidden = false;
      elements.overviewTriageSection.dataset.state = "neutral";
      elements.overviewTriageSection.innerHTML = `
        <section class="empty-area-state">
          <p class="triage-eyebrow">Area ready</p>
          <h2>${escapeHtml(site.name)} has no sections yet</h2>
          <p>Create the first section, then register nodes and begin collecting live readings.</p>
          <button type="button" class="inline-action actionable" data-empty-area-open-sections>
            <i class="fa-solid fa-border-all" aria-hidden="true"></i>
            Open sections
          </button>
        </section>
      `;
      elements.metricsSection.hidden = true;
      elements.sensorHealthSection.hidden = true;
      elements.alertsSection.hidden = true;
      elements.opsDockSection.hidden = true;
      elements.detailedDiagnosticsSection.hidden = true;
      elements.todayPriorityPanel.hidden = true;
      document.body.dataset.dashboardState = "neutral";
      document.body.dataset.viewScope = "site";
      document.body.dataset.primaryPage = "overview";
    }

    function renderWorkspaceHydrationState(status = "loading") {
      const isError = status === "error";
      renderSiteOptions();
      renderZoneOptions();
      updateSidebarActionState();

      elements.siteContextValue.textContent = diagnosticText("Loading areas", "Kraunamos area");
      elements.siteContextMeta.textContent = diagnosticText("Fetching workspace data", "Gaunami workspace duomenys");
      elements.siteContextMeta.dataset.state = "neutral";
      elements.zoneContextCard.dataset.disabled = "true";
      elements.zoneTrigger.disabled = true;
      elements.zoneTrigger.setAttribute("aria-disabled", "true");
      elements.zoneContextValue.textContent = diagnosticText("Loading sections", "Kraunamos sekcijos");
      elements.zoneContextMeta.textContent = diagnosticText("Waiting for the API", "Laukiama API atsakymo");
      elements.zoneContextMeta.dataset.state = "neutral";

      elements.experienceModeSection.hidden = true;
      elements.locationsManagementSection.hidden = true;
      elements.blocksManagementSection.hidden = true;
      elements.nodesManagementSection.hidden = true;
      elements.settingsManagementSection.hidden = true;
      elements.heroStatusPanel.hidden = true;
      elements.todayPriorityPanel.hidden = true;
      elements.metricsSection.hidden = true;
      elements.historySection.hidden = true;
      elements.sensorHealthSection.hidden = true;
      elements.alertsSection.hidden = true;
      elements.opsDockSection.hidden = true;
      elements.detailedDiagnosticsSection.hidden = true;
      elements.zoneImpactSection.hidden = true;
      if (elements.advancedToolsPanel) {
        elements.advancedToolsPanel.hidden = true;
        elements.advancedToolsPanel.open = false;
      }
      if (elements.sidebarQuickActions) elements.sidebarQuickActions.hidden = true;

      elements.overviewTriageSection.hidden = false;
      elements.overviewTriageSection.dataset.state = "neutral";
      elements.overviewTriageSection.innerHTML = `
        <section class="empty-area-state" role="${isError ? "alert" : "status"}" aria-live="polite">
          <p class="triage-eyebrow">${escapeHtml(diagnosticText(isError ? "Connection problem" : "Loading workspace", isError ? "Ryšio problema" : "Kraunamas workspace"))}</p>
          <h2>${escapeHtml(diagnosticText(isError ? "Workspace could not be loaded" : "Getting your growing areas ready", isError ? "Nepavyko įkelti workspace" : "Ruošiamos jūsų auginimo area"))}</h2>
          <p>${escapeHtml(diagnosticText(isError ? "Your data was not reported as empty. Retry the API request." : "Fetching Areas, Sections and the latest sensor readings.", isError ? "Jūsų duomenys nelaikomi tuščiais. Pakartokite API užklausą." : "Gaunamos Area, sekcijos ir naujausi sensorių rodmenys."))}</p>
          ${isError ? `
            <button type="button" class="inline-action actionable" data-dashboard-retry>
              <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
              ${escapeHtml(diagnosticText("Retry loading", "Bandyti dar kartą"))}
            </button>
          ` : `
            <span class="inline-action" aria-hidden="true">
              <i class="fa-solid fa-spinner fa-spin"></i>
              ${escapeHtml(diagnosticText("Loading", "Kraunama"))}
            </span>
          `}
        </section>
      `;

      document.body.dataset.dashboardState = "neutral";
      document.body.dataset.primaryPage = activePrimaryPage;
    }

    function renderEmptyWorkspaceState() {
      const workspaceDependentPages = new Set(["overview", "blocks", "nodes", "readings", "history"]);
      if (workspaceDependentPages.has(activePrimaryPage)) {
        activePrimaryPage = "locations";
        sidebarActionOverride = null;
        syncTopLevelRoute("/areas", { replace: true });
      }
      activeViewScope = "site";
      activeProfileKey = cropProfiles.default ? "default" : Object.keys(cropProfiles)[0] || "default";
      renderSiteOptions();
      renderZoneOptions();
      updateSidebarActionState();

      const isLocationsPage = activePrimaryPage === "locations";
      const isBlocksPage = activePrimaryPage === "blocks";
      const isNodesPage = activePrimaryPage === "nodes";
      const isSettingsPage = activePrimaryPage === "settings";
      const isAdminPage = activePrimaryPage === "admin";
      const showWorkspaceSetup = !isLocationsPage && !isBlocksPage && !isNodesPage && !isSettingsPage && !isAdminPage;

      elements.siteContextValue.textContent = diagnosticText("No areas", "Nėra area");
      elements.siteContextMeta.textContent = diagnosticText("Create the first area", "Sukurkite pirmą area");
      elements.siteContextMeta.dataset.state = "neutral";
      elements.zoneContextCard.dataset.disabled = "true";
      elements.zoneTrigger.disabled = true;
      elements.zoneTrigger.setAttribute("aria-disabled", "true");
      elements.zoneContextValue.textContent = diagnosticText("No sections", "Nėra sekcijų");
      elements.zoneContextMeta.textContent = diagnosticText("Create an area and section to start monitoring.", "Sukurkite area ir sekciją, kad pradėtumėte stebėjimą.");
      elements.zoneContextMeta.dataset.state = "neutral";
      elements.profileContextValue.textContent = cropProfiles[activeProfileKey]?.name || "Default";
      elements.profileContextMeta.textContent = diagnosticText("Ready for first section", "Paruoštas pirmai sekcijai");

      elements.experienceModeSection.hidden = true;
      elements.locationsManagementSection.hidden = !isLocationsPage;
      elements.blocksManagementSection.hidden = !isBlocksPage;
      elements.nodesManagementSection.hidden = !isNodesPage;
      elements.settingsManagementSection.hidden = !(isSettingsPage || isAdminPage);
      elements.overviewTriageSection.hidden = !showWorkspaceSetup;
      elements.heroStatusPanel.hidden = true;
      elements.todayPriorityPanel.hidden = true;
      elements.metricsSection.hidden = true;
      elements.historySection.hidden = true;
      elements.sensorHealthSection.hidden = true;
      elements.alertsSection.hidden = true;
      elements.opsDockSection.hidden = true;
      elements.detailedDiagnosticsSection.hidden = true;
      elements.zoneImpactSection.hidden = true;
      if (elements.advancedToolsPanel) {
        elements.advancedToolsPanel.hidden = true;
        elements.advancedToolsPanel.open = false;
      }
      if (elements.sidebarQuickActions) elements.sidebarQuickActions.hidden = true;

      if (isLocationsPage) renderLocationsManagementPage([]);
      if (isBlocksPage) renderBlocksManagementPage([]);
      if (isNodesPage) renderNodesManagementPage([]);
      if (isSettingsPage || isAdminPage) renderSettingsManagementPage([]);

      if (showWorkspaceSetup) {
        elements.overviewTriageSection.dataset.state = "neutral";
        elements.overviewTriageSection.innerHTML = `
          <section class="empty-area-state">
            <p class="triage-eyebrow">${diagnosticText("Workspace ready", "Workspace paruoštas")}</p>
            <h2>${diagnosticText("Create your first growing area", "Sukurkite pirmą auginimo area")}</h2>
            <p>${diagnosticText("This organization has no areas, sections, or nodes yet. Start by creating an area, then add a section and register nodes.", "Šioje organizacijoje dar nėra area, sekcijų ar nodes. Pradėkite nuo area sukūrimo, tada pridėkite sekciją ir registruokite nodes.")}</p>
            <button type="button" class="inline-action actionable" data-dashboard-action="sites">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
              ${diagnosticText("Create area", "Sukurti area")}
            </button>
          </section>
        `;
      }

      document.body.dataset.dashboardState = "neutral";
      document.body.dataset.viewScope = "site";
      document.body.dataset.primaryPage = activePrimaryPage;
    }

    function renderDashboardUnsafe(options = {}) {
      const isLocationsPage = activePrimaryPage === "locations";
      const isBlocksPage = activePrimaryPage === "blocks";
      const isNodesPage = activePrimaryPage === "nodes";
      const isReadingsPage = activePrimaryPage === "readings";
      const isHistoryPage = activePrimaryPage === "history";
      const isSettingsPage = activePrimaryPage === "settings";
      const isAdminPage = activePrimaryPage === "admin";
      const isManagementPage = isLocationsPage || isBlocksPage || isNodesPage || isSettingsPage || isAdminPage;
      const isPrimaryWorkspacePage = isManagementPage || isHistoryPage || isReadingsPage;
      const site = getActiveSite();
      const zone = getActiveZone(site);
      if (!site) {
        if (isApiDataMode() && dashboardHydrationStatus !== "empty") {
          renderWorkspaceHydrationState(dashboardHydrationStatus);
          return;
        }
        renderEmptyWorkspaceState();
        return;
      }
      if (!zone) {
        renderEmptyAreaState(site);
        return;
      }
      const profile = cropProfiles[activeProfileKey] || cropProfiles[zone.profile] || getDefaultCropProfileTemplate();
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
      const activeReadingsStatus = latestReadingsStatusBySectionId[zone.id]?.status || "";
      const isActiveReadingsLoading = isApiDataMode() && !hasReadings && activeReadingsStatus === "loading";
      elements.overviewTriageSection?.setAttribute("aria-busy", String(isActiveReadingsLoading));
      elements.metricsSection?.setAttribute("aria-busy", String(isActiveReadingsLoading));
      const readings = hasReadings
        ? currentReadings
        : isApiDataMode()
          ? {}
          : getZoneReadings(profile, zone, activeScenarioKey);

      if (!hasReadings && !isApiDataMode()) {
        currentReadings = { ...readings };
      }

      const results = Object.entries(profile.metrics).map(([key, definition]) => {
        const isConfigured = isMetricConfiguredForReadings(key, availableMetrics, readings);
        const hasLiveValue = Number.isFinite(Number(readings?.[key]));
        const metricAvailableSet = isConfigured && !availableMetrics.has(key)
          ? new Set([...availableMetrics, key])
          : availableMetrics;
        return {
          key,
          configured: isConfigured,
          available: isConfigured && (!isApiDataMode() || hasLiveValue),
          ...(isConfigured
            ? evaluateMetricForReadings(definition, key, metricAvailableSet, readings)
            : { value: null, state: "unavailable", severity: 0, scalePosition: 0, deviationText: "Unavailable", narrative: "Sensor not installed." })
        };
      });

      const overallState = getBackendOverallState(zone) || deriveOverallState(results);
      const growthResults = results.filter((item) => isGrowthMetricKey(item.key) && item.configured !== false);
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
      const siteSnapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === site.id);
      const weakestSiteSnapshot = getWeakestSiteSnapshot(siteSnapshots);
      const siteOverallState = deriveSiteOverallState(siteSnapshots);
      const isSiteView = activeViewScope === "site";
      if (isReadingsPage && isSiteView && isApiDataMode()) {
        queueMicrotask(() => fetchLatestReadingsForArea(site.id));
      }
      if (activeWorkspaceFocus === "route" && isSiteView && activeSiteDetailView === "zones") {
        activeSiteDetailView = "averages";
      }
  const isSiteHotspotsView = isSiteView && activeSiteDetailView === "zones";
  const siteAverageSummaries = isSiteView ? buildSiteAverageSummaries(siteSnapshots) : [];
  const siteTrendAverageSummaries = isSiteView
    ? buildSiteAverageSummaries(siteSnapshots, { includeNonGrowthMetrics: true })
    : [];
      const sensorHealthNodes = isSiteView ? siteBatteryNodes : zoneBatteryNodes;
      const displayedOverallState = isSiteView ? siteOverallState : overallState;
      const selectedSiteLiveSnapshots = siteSnapshots.filter(snapshotHasLiveGrowthData);
      const hasDisplayedLiveGrowthData = isSiteView ? selectedSiteLiveSnapshots.length > 0 : availableResults.length > 0;
      const displayedAwaitingFirstUplink = sensorHealthNodes.length === 0
        || sensorHealthNodes.every((node) => !node.lastSeen && !node.lastReceivedAt);
      const displayedScoreState = hasDisplayedLiveGrowthData ? displayedOverallState.state : displayedAwaitingFirstUplink ? "neutral" : "critical";
      const displayedScoreValue = hasDisplayedLiveGrowthData ? `${displayedOverallState.indexScore}` : "--";
      const displayedScoreLabel = hasDisplayedLiveGrowthData
        ? getHealthStateLabel(displayedOverallState.state)
        : diagnosticText("No data", "Nėra duomenų");
      const displayedScoreBadgeLabel = hasDisplayedLiveGrowthData
        ? getScopeBadgeLabel(displayedOverallState.state, activeViewScope)
        : diagnosticText("No data", "Nėra duomenų");
      const timestamp = new Date().toLocaleTimeString("lt-LT", { hour: "2-digit", minute: "2-digit" });
      const thumbPosition = hasDisplayedLiveGrowthData ? clamp(displayedOverallState.indexScore, 8, 92) : 8;
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
        siteAverageSummaries: siteTrendAverageSummaries
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
      const readingsWorkbenchLenses = workbenchConfig.lenses.filter((lens) => lens.key !== "focus").map((lens) => {
            if (!isSiteView) return lens;
            if (lens.key === "all") {
              return {
                ...lens,
                label: diagnosticText("All parameters", "Visi parametrai"),
                description: diagnosticText(
                  `Comparing every configured parameter across ${site.name} sections.`,
                  `Lyginami visi sukonfigūruoti parametrai visose „${site.name}“ sekcijose.`
                )
              };
            }
            if (lens.key === "coverage") {
              return {
                ...lens,
                label: diagnosticText("Missing data", "Trūkstami duomenys"),
                description: diagnosticText(
                  `Showing parameters missing from at least one ${site.name} section.`,
                  `Rodomi parametrai, kurių trūksta bent vienoje „${site.name}“ sekcijoje.`
                )
              };
            }
            return lens;
          });
      if (isReadingsPage && isSiteView) {
        const essentialCount = getAreaLiveMetricKeys(siteSnapshots, { key: "essential" }).length;
        if (essentialCount > 0) {
          readingsWorkbenchLenses.unshift({
            key: "essential",
            label: diagnosticText("Key readings", "Svarbiausi rodmenys"),
            icon: "fa-star",
            tone: "neutral",
            count: essentialCount,
            description: diagnosticText(
              `Showing the ${essentialCount} readings most useful for a quick section comparison.`,
              `Rodomi ${essentialCount} rodikliai, naudingiausi greitam sekcijų palyginimui.`
            )
          });
        }
      }
      currentWorkbenchLenses = isReadingsPage ? readingsWorkbenchLenses : workbenchConfig.lenses;
      if (isReadingsPage && activeWorkbenchLensKey === "focus") {
        activeWorkbenchLensKey = "essential";
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
        ? `${opsScopeSummary}. Manual branch is active with ${opsRouteSummary}, ${(activeWorkbenchLens?.label || "focus").toLowerCase()} workbench lens, and ${opsPowerSummary}.`
        : `${opsScopeSummary}. ${scenarioDefinition.shortLabel} scenario is active with ${opsRouteSummary}, ${(activeWorkbenchLens?.label || "focus").toLowerCase()} workbench lens, and ${opsPowerSummary}.`;
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
      // Building every hidden workspace on each live refresh caused large DOM and
      // style-recalculation spikes on lower-end PCs. Render only the active route.
      if (isLocationsPage) renderLocationsManagementPage(globalSnapshots);
      if (isBlocksPage) renderBlocksManagementPage(globalSnapshots);
      if (isNodesPage) renderNodesManagementPage();
      if (isSettingsPage || isAdminPage) renderSettingsManagementPage(globalSnapshots);

      if (!isPrimaryWorkspacePage && isSimpleExperienceMode) {
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
          siteSnapshots,
          globalSnapshots,
          isSiteView,
          timestamp
        });
      }

      if (isDetailedOverview) {
        const detailedSnapshot = isSiteView && weakestSiteSnapshot
          ? weakestSiteSnapshot
          : { zone, profile, results };
        const detailedGrowthResults = detailedSnapshot.results.filter((item) => isGrowthMetricKey(item.key) && item.configured !== false);
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
          zoneBatteryNodes: isSiteView ? siteBatteryNodes : zoneBatteryNodes,
          coverageOverride: isSiteView ? getCoverageStatsFromSiteSnapshots(siteSnapshots) : null,
          isSiteView,
          timestamp
        });
      }

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
      elements.siteMetricsViewToggle.hidden = !isSiteView || isSimpleExperienceMode || isReadingsPage;
      elements.siteAveragesButton.dataset.active = String(activeSiteDetailView === "averages");
      elements.siteAveragesButton.setAttribute("aria-pressed", String(activeSiteDetailView === "averages"));
      elements.siteZonesButton.dataset.active = String(activeSiteDetailView === "zones");
      elements.siteZonesButton.setAttribute("aria-pressed", String(activeSiteDetailView === "zones"));
      const selectedSiteScore = getContextScoreSummary(
        selectedSiteLiveSnapshots.length > 0 ? deriveSiteOverallState(selectedSiteLiveSnapshots) : null
      );
      const selectedZoneScore = getContextScoreSummary(
        availableResults.length > 0 ? overallState : null
      );
      elements.siteContextValue.textContent = site.name;
      elements.siteContextMeta.textContent = selectedSiteScore.text;
      elements.siteContextMeta.dataset.state = selectedSiteScore.state;
      // A section can always be selected when the current area has sections.
      // Choosing one switches the dashboard from Area to Section scope.
      const hasSections = Boolean(site?.zones?.length);
      elements.zoneContextCard.dataset.disabled = hasSections ? "false" : "true";
      elements.zoneTrigger.disabled = !hasSections;
      elements.zoneTrigger.setAttribute("aria-disabled", String(!hasSections));
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
      elements.settingsManagementSection.hidden = !(isSettingsPage || isAdminPage);
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
      document.body.dataset.dashboardState = displayedScoreState;
      document.body.dataset.workspaceFocus = activeWorkspaceFocus;
      document.body.dataset.viewScope = activeViewScope;
      document.body.dataset.experienceMode = activeExperienceMode;
      document.body.dataset.primaryPage = activePrimaryPage;
      elements.heroStatusPanel.dataset.state = displayedScoreState;
      elements.heroHeadline.textContent = heroDecision.headline;
      elements.heroDescription.textContent = heroDecision.description;
      elements.scopeChip.textContent = isSimpleExperienceMode
        ? `System: ${globalCritical} critical · ${globalWarning} warning · ${globalStable} OK`
        : isSiteView
          ? `Showing: ${site.name}`
          : `Showing: ${site.name} / ${zone.name}`;
      elements.scopeChip.dataset.state = isSimpleExperienceMode ? globalState : displayedScoreState;
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
      applyStateChip(elements.indicatorZoneBadge, displayedScoreState, displayedScoreBadgeLabel);
      elements.indicatorScoreWrap.dataset.state = displayedScoreState;
      elements.indicatorScore.textContent = displayedScoreValue;
      elements.indicatorScoreState.textContent = displayedScoreLabel;
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
        const hasBackendPriority = Array.isArray(backendTodayActions);
        const backendPriorityActions = hasBackendPriority
          ? backendTodayActions.map((action) => {
              const snapshot = globalSnapshots.find((item) => item.zone.id === action.sectionId);
              if (!snapshot) return null;
              return {
                state: action.state,
                title: action.title,
                note: `${action.recommendedAction} ${action.expectedEffect}`,
                cta: "Open metrics",
                targetId: "metricsSection",
                siteId: snapshot.site.id,
                zoneId: snapshot.zone.id,
                profileKey: snapshot.zone.profile,
                metricKey: action.metricId,
                backendAction: action,
                snapshot
              };
            }).filter(Boolean)
          : [];
        const firstBackendPriority = backendPriorityActions[0] || null;
        const prioritySnapshot = firstBackendPriority?.snapshot || allSystemIssues[0] || { site, zone, profile, results };
        const priorityResult = firstBackendPriority
          ? {
              key: firstBackendPriority.metricKey,
              value: firstBackendPriority.backendAction.value,
              state: firstBackendPriority.state,
              severity: firstBackendPriority.backendAction.severity,
              deviationText: firstBackendPriority.backendAction.reason
            }
          : hasBackendPriority
            ? null
            : prioritySnapshot?.results
              ?.filter((result) => result.available !== false && isGrowthMetricKey(result.key))
              .sort((left, right) => {
                if (left.state !== "optimal" && right.state === "optimal") return -1;
                if (left.state === "optimal" && right.state !== "optimal") return 1;
                return right.severity - left.severity;
              })[0] || null;
        const backendDefinition = firstBackendPriority ? firstBackendPriority.snapshot.profile.metrics[firstBackendPriority.metricKey] : null;
        const priorityDefinition = backendDefinition || (priorityResult ? prioritySnapshot.profile.metrics[priorityResult.key] : null);
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
        const priorityTrend = firstBackendPriority
          ? "Latest live reading"
          : !priorityDefinition
          ? "No trend yet"
          : priorityDelta === 0
            ? "Stable over 24 h"
            : `${priorityDelta > 0 ? "↑" : "↓"} ${formatValue(Math.abs(priorityDelta), priorityDefinition)} in 24 h`;
        const fallbackPriorityAction = priorityResult && priorityDefinition ? {
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
        const priorityActions = hasBackendPriority ? backendPriorityActions : [fallbackPriorityAction].filter(Boolean);
        renderTodayPriority(priorityActions, allSystemIssues, {
          metric: priorityDefinition?.label,
          definition: priorityDefinition,
          result: priorityResult,
          trend: priorityTrend,
          duration: "Latest reading",
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
      elements.conditionThumb.style.setProperty("--thumb-color", stateConfig[displayedScoreState].thumb);
      elements.conditionThumbLabel.textContent = hasDisplayedLiveGrowthData ? `${displayedOverallState.indexScore}%` : "--";
      elements.conditionTrackShell.hidden = isSimpleExperienceMode;
      elements.indicatorStageFooter.hidden = isSimpleExperienceMode;

      elements.overallStateCard.dataset.state = displayedScoreState;
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
            isSiteView ? `${site.name} section readings` : `Live readings · ${zone.name}`,
            isSiteView ? `Sekcijų rodmenys · ${site.name}` : `Dabartiniai rodmenys · ${zone.name}`
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
      const shouldShowWorkbenchToolbar = !isSimpleExperienceMode;
      elements.workbenchToolbar.hidden = !shouldShowWorkbenchToolbar;
      elements.workbenchLensBar.innerHTML = shouldShowWorkbenchToolbar
        ? renderWorkbenchLenses(currentWorkbenchLenses, activeWorkbenchLens?.key)
        : "";
      elements.workbenchLensSummary.textContent = !shouldShowWorkbenchToolbar
        ? ""
        : isReadingsPage
        ? diagnosticText(
            isSiteView
              ? "Each row is a Section. Compare values directly, then open one Section for sensor-level detail."
              : "Choose a metric group or open its trend for the full history.",
            isSiteView
              ? "Kiekviena eilutė yra Section. Palyginkite reikšmes ir atidarykite sekciją sensorių detalėms."
              : "Pasirinkite rodiklių grupę arba atidarykite grafiką išsamiai istorijai."
          )
        : isSimpleExperienceMode
        ? "Only the most relevant live readings are shown here."
        : activeWorkbenchLens?.description || "Focus the workbench on the slice that matters most right now.";
      elements.zoneImpactSection.hidden = isPrimaryWorkspacePage || !isDetailedExperienceMode || isDetailedOverview || isSiteHotspotsView || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "route");
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
            metricResults: results,
            siteAverageSummaries
          });
      if (!skipMetricsGrid) {
        elements.metricsGrid.dataset.display = isReadingsPage
          ? isSiteView ? "area-readings-board" : "readings-board"
          : "cards";
        if (isSiteView) {
          if (isReadingsPage) {
            elements.metricsGrid.innerHTML = renderAreaLiveReadingsBoard(siteSnapshots, site, activeWorkbenchLens);
          } else if (isSiteHotspotsView) {
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
                  activeWorkbenchLens?.key === "coverage" ? "No incomplete coverage in this view." : "No averages match this lens.",
                  activeWorkbenchLens?.key === "coverage"
                    ? `Every location average in ${site.name} is currently backed by every reporting section.`
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
              ? renderLiveReadingsBoard(filteredZoneResults, profile, site, zone, { isLoading: isActiveReadingsLoading })
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
                  "No unavailable metrics in this section.",
                  `Every configured growth metric in ${zone.name} is currently reported by a detected sensor.`,
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
                ? `${activeWorkbenchLens.label} unavailable metrics`
                : "Unavailable metrics";

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

      const shouldHideTrendHistoryBase = !isHistoryPage
        || isManagementPage
        || isSiteHotspotsView
        || !isDetailedExperienceMode
        || (activeWorkspaceFocus !== "all" && activeWorkspaceFocus !== "metrics");
      const defaultTrendMetricKey = isSiteView
        ? topIndicatorDrivers[0]?.key || trendMetricOptions[0]?.key || ""
        : getPrimaryNonOptimalResult(nonOptimalResults)?.key || trendMetricOptions[0]?.key || "";
      const trendHistoryState = shouldHideTrendHistoryBase
        ? null
        : buildTrendHistoryState({
            isSiteView,
            site,
            zone,
            trendMetricOptions,
            defaultMetricKey: defaultTrendMetricKey
          });
      const shouldHideTrendHistory = shouldHideTrendHistoryBase || !trendHistoryState;
      elements.historySection.hidden = shouldHideTrendHistory;

      if (!shouldHideTrendHistory && trendHistoryState) {
        elements.trendHistoryActiveAreaLabel.textContent = site.name;
        elements.trendHistoryActiveSectionLabel.textContent = zone.name;
        const historySiteScores = new Map(dashboardData.sites.map((historySite) => {
          const snapshots = globalSnapshots.filter((snapshot) => snapshot.site.id === historySite.id);
          const liveSnapshots = snapshots.filter(snapshotHasLiveGrowthData);
          return [
            historySite.id,
            getContextScoreSummary(liveSnapshots.length > 0 ? deriveSiteOverallState(liveSnapshots) : null)
          ];
        }));
        const selectedHistorySiteScore = historySiteScores.get(site.id) || getContextScoreSummary(null);
        const selectedHistoryZoneScore = getContextScoreSummary(
          availableResults.length > 0 ? overallState : null
        );
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
            score: getContextScoreSummary(snapshotHasLiveGrowthData(snapshot) ? snapshot?.overall : null),
            isActive: historyZone.id === zone.id,
            type: "zone"
          });
        }).join("");
        elements.trendHistoryTitle.textContent = trendHistoryState.title;
        elements.trendHistorySummary.textContent = trendHistoryState.summary;
        applyStateChip(elements.trendHistoryStateChip, trendHistoryState.state, stateConfig[trendHistoryState.state].label);
        elements.trendHistoryRangeMeta.textContent = trendHistoryState.rangeMeta;
        elements.trendHistoryExportButton.hidden = !isApiDataMode() || isSiteView;
        elements.trendHistoryExportButton.disabled = false;
        elements.trendMetricBar.innerHTML = trendHistoryState.metricButtons;
        const presentationMetricKey = trendHistoryState.chartState?.seriesItems?.[0]?.option?.key || "";
        elements.trendPresentationBar.innerHTML = renderTrendPresentationButtons(activeTrendPresentation, presentationMetricKey);
        elements.trendScaleBar.innerHTML = renderTrendScaleButtons(activeTrendScaleMode);
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
        renderTrendAnalytics({
          site,
          zone,
          isSiteView,
          metricOption: trendHistoryState.chartState?.seriesItems?.length === 1 ? trendHistoryState.chartState.seriesItems[0].option : null,
          rangeKey: activeTrendRangeKey
        });
      } else {
        if (elements.trendAnalyticsPanel) {
          elements.trendAnalyticsPanel.hidden = true;
          elements.trendAnalyticsPanel.innerHTML = "";
        }
        disposeTrendComparisonChart();
        currentTrendHistoryPoints = [];
        if (trendHistoryChartInstance) {
          trendHistoryChartInstance.dispose();
          trendHistoryChartInstance = null;
        }
      }

      if (!isSiteHotspotsView) {
        elements.zoneImpactGrid.innerHTML = renderInspectionRouteCards(filteredInspectionRouteItems, {
          isLoading: isActiveReadingsLoading,
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
      persistActiveContext();
    }

    function renderRuntimeErrorState() {
      const errorTitle = diagnosticText("View unavailable", "Rodinys nepasiekiamas");
      const errorNote = diagnosticText(
        "The rest of the workspace remains available. Retry this view or choose another page.",
        "Likusi darbo erdvė veikia. Bandykite šį rodinį dar kartą arba pasirinkite kitą puslapį."
      );
      const retryLabel = diagnosticText("Retry view", "Bandyti dar kartą");
      elements.heroStatusPanel.hidden = true;
      elements.metricsSection.hidden = true;
      elements.sensorHealthSection.hidden = true;
      elements.alertsSection.hidden = true;
      elements.opsDockSection.hidden = true;
      elements.detailedDiagnosticsSection.hidden = true;
      elements.todayPriorityPanel.hidden = true;
      elements.overviewTriageSection.hidden = false;
      elements.overviewTriageSection.dataset.state = "neutral";
      elements.overviewTriageSection.innerHTML = `
        <section class="empty-area-state" role="alert">
          <p class="triage-eyebrow">${escapeHtml(errorTitle)}</p>
          <h2>${escapeHtml(diagnosticText("This view could not be loaded", "Šio rodinio nepavyko įkelti"))}</h2>
          <p>${escapeHtml(errorNote)}</p>
          <button type="button" class="inline-action actionable" data-dashboard-retry>
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            ${escapeHtml(retryLabel)}
          </button>
        </section>
      `;
      document.body.dataset.dashboardState = "neutral";
    }

    async function retryDashboardView(button) {
      if (button) button.disabled = true;
      try {
        if (isApiDataMode()) await hydrateDashboardFromApi();
        renderDashboard();
      } finally {
        if (button) button.disabled = false;
      }
    }

    function renderDashboard(options = {}) {
      try {
        renderDashboardUnsafe(options);
        document.body.dataset.dashboardError = "false";
        document.querySelector('[data-runtime-render-error]')?.remove();
      } catch (error) {
        console.error("Dashboard render failed", error);
        document.body.dataset.dashboardError = "true";
        renderRuntimeErrorState();
        let banner = document.querySelector('[data-runtime-render-error]');
        if (!banner) {
          banner = document.createElement("div");
          banner.dataset.runtimeRenderError = "true";
          banner.setAttribute("role", "alert");
          banner.className = "fixed inset-x-4 top-3 z-[200] mx-auto max-w-2xl rounded-xl border border-ember/25 bg-[#fff7f4] px-4 py-3 text-sm font-semibold text-ember shadow-lg";
          elements.dashboardShell.prepend(banner);
        }
        banner.innerHTML = `<div class="flex items-center justify-between gap-3"><span>${escapeHtml(diagnosticText("This view could not be loaded.", "Šio rodinio nepavyko įkelti."))}</span><button type="button" class="rounded-lg border border-ember/20 bg-white px-3 py-1.5 text-xs font-extrabold text-ember" data-dashboard-retry>${escapeHtml(diagnosticText("Retry view", "Bandyti dar kartą"))}</button></div>`;
      }
    }

    elements.siteTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = elements.siteMenu.hidden;
      setHeaderBatteryDropdownOpen(false);
      closeContextMenus();
      setMenuState(elements.siteTrigger, elements.siteMenu, shouldOpen);
    });

    elements.zoneTrigger.addEventListener("click", (event) => {
      if (elements.zoneTrigger.disabled) return;
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
      if (activePrimaryPage === "readings") fetchLatestReadingsForArea(getActiveSite()?.id);
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
      normalizeActiveSelection({ preferCurrentZone: false });
      resetTrendSelectionForContextChange();
      if (activePrimaryPage === "blocks") syncBlocksManagementContext();
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      closeContextMenus();
      renderSiteOptions();
      scheduleDashboardRender();
      if (activePrimaryPage === "readings") fetchLatestReadingsForArea(activeSiteId);
    });

    elements.zoneMenu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-zone-option]");
      if (!option) return;
      sidebarActionOverride = null;
      activeZoneId = option.dataset.zoneId;
      activeViewScope = "zone";
      normalizeActiveSelection();
      resetTrendSelectionForContextChange();
      if (activePrimaryPage === "blocks") syncBlocksManagementContext();
      resetCurrentReadingsFromActiveZone();
      closeContextMenus();
      renderZoneOptions();
      scheduleDashboardRender();
    });

    elements.overviewTriageSection.addEventListener("click", (event) => {
      const openSections = event.target.closest("[data-empty-area-open-sections]");
      if (!openSections) return;
      activePrimaryPage = "blocks";
      activeBlockFilterSiteId = activeSiteId;
      blockFormState = {
        mode: "create",
        siteId: activeSiteId,
        zoneId: "",
        name: "",
        profile: cropProfiles.default ? "default" : activeProfileKey,
        sensorCount: "0"
      };
      renderEmptyAreaState(getActiveSite());
      syncTopLevelRoute("/sections");
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
      if (event.target instanceof HTMLInputElement && event.target.name === "nodeSearch") {
        activeNodeSearchQuery = event.target.value.trim().toLowerCase();
        let visibleCount = 0;
        elements.nodesManagementSection.querySelectorAll("[data-node-search-value]").forEach((row) => {
          row.hidden = activeNodeSearchQuery.length > 0 && !String(row.dataset.nodeSearchValue || "").includes(activeNodeSearchQuery);
          if (!row.hidden) visibleCount += 1;
        });
        const countLabel = elements.nodesManagementSection.querySelector(".node-fleet-footer span");
        if (countLabel) countLabel.textContent = `${visibleCount} nodes shown`;
        return;
      }
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

      if (event.target instanceof HTMLSelectElement && event.target.name === "nodeStateFilter") {
        activeNodeStateFilter = event.target.value || "all";
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
      const registerJumpButton = event.target.closest("[data-node-register-jump]");
      if (registerJumpButton) {
        resetNodeForm();
        clearManagementNotice("nodes");
        openNodeRegistrationModal();
        return;
      }

      const backToNodesButton = event.target.closest("[data-node-list-back]");
      if (backToNodesButton) {
        syncTopLevelRoute("/nodes");
        return;
      }

      const openNodeButton = event.target.closest("[data-node-open-id]");
      if (openNodeButton) {
        syncTopLevelRoute(`/nodes/${encodeURIComponent(openNodeButton.dataset.nodeOpenId)}`);
        return;
      }

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
      const adminSearch = event.target.closest("[data-admin-search]");
      if (adminSearch instanceof HTMLInputElement) {
        const tableKey = adminSearch.dataset.adminSearch;
        const queryValue = adminSearch.value.trim().toLowerCase();
        elements.settingsManagementSection.querySelectorAll(`[data-admin-row="${tableKey}"]`).forEach((row) => {
          row.hidden = queryValue.length > 0 && !String(row.dataset.adminSearchValue || "").includes(queryValue);
        });
        return;
      }
      syncSettingsProfileFormField(event.target);
      syncCropProfileEditorDraft(event.target);
      rebalanceOptimalRangeBounds(event.target);
      updateSettingsField(event.target);
    });

    elements.settingsManagementSection.addEventListener("focusin", (event) => {
      captureOptimalRangeBaseline(event.target);
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
      syncCropProfileEditorDraft(event.target);
      rebalanceOptimalRangeBounds(event.target);
      updateSettingsField(event.target);
    });

    elements.settingsManagementSection.addEventListener("submit", async (event) => {
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
      if (formKey === "password") {
        const formData = new FormData(settingsForm);
        const currentPassword = String(formData.get("currentPassword") || "");
        const newPassword = String(formData.get("newPassword") || "");
        const confirmPassword = String(formData.get("confirmPassword") || "");
        const feedback = settingsForm.querySelector("[data-password-feedback]");
        const submitButton = settingsForm.querySelector('button[type="submit"]');
        const showFeedback = (message, tone = "warning") => {
          if (!feedback) return;
          feedback.hidden = false;
          feedback.dataset.tone = tone;
          feedback.textContent = translateInterfaceText(message);
        };

        if (!currentPassword || !newPassword) {
          showFeedback("Enter your current password and a new password.");
          return;
        }
        if (newPassword.length < 12) {
          showFeedback("The new password must contain at least 12 characters.");
          return;
        }
        if (newPassword !== confirmPassword) {
          showFeedback("The new passwords do not match.");
          return;
        }
        if (!window.NeuroCropApi?.changePassword) {
          showFeedback("Password change is not available right now.");
          return;
        }

        if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
        try {
          await window.NeuroCropApi.changePassword({ currentPassword, newPassword });
          settingsForm.reset();
          showFeedback("Password changed. Other signed-in devices were signed out.", "optimal");
        } catch (error) {
          showFeedback(error?.message || "Password could not be changed.");
        } finally {
          if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
        }
        return;
      }
      if (formKey === "team") {
        const formData = new FormData(settingsForm);
        const email = String(formData.get("teamEmail") || "").trim();
        const role = String(formData.get("teamRole") || "grower").toLowerCase();
        if (!email) {
          setManagementNotice("settings", "Enter the email address for the person you want to invite.", "warning");
          renderDashboard();
          return;
        }
        if (!window.NeuroCropApi?.isConnected()) {
          setManagementNotice("settings", "Team invitations require a NeuroCrop API connection.", "warning");
          renderDashboard();
          return;
        }
        try {
          const response = await window.NeuroCropApi.inviteMember({ email, role });
          teamAccessState.latestInviteUrl = response?.invitation?.inviteUrl || "";
          teamAccessState.latestInviteEmailSent = Boolean(response?.invitation?.emailDelivery?.sent);
          teamAccessState.status = "idle";
          setManagementNotice("settings", teamAccessState.latestInviteEmailSent ? `Invitation email sent to ${email}.` : `Invitation created for ${email}; use the backup link.`, teamAccessState.latestInviteEmailSent ? "optimal" : "warning");
          await hydrateTeamAccess();
        } catch (error) {
          setManagementNotice("settings", error?.message || "The invitation could not be created.", "warning");
          renderDashboard();
        }
        return;
      } else if (formKey === "platform-organization") {
        const formData = new FormData(settingsForm);
        const organizationName = String(formData.get("customerOrganizationName") || "").trim();
        const ownerEmail = String(formData.get("customerOwnerEmail") || "").trim();
        if (!organizationName || !ownerEmail) {
          setManagementNotice("settings", "Enter the customer organization name and owner email.", "warning");
          renderDashboard();
          return;
        }
        try {
          const response = await window.NeuroCropApi.createPlatformOrganization({ organizationName, ownerEmail });
          platformOrganizationState.latestInviteUrl = response?.invitation?.inviteUrl || "";
          platformOrganizationState.latestInviteEmailSent = Boolean(response?.invitation?.emailDelivery?.sent);
          platformOrganizationState.latestInviteEmail = response?.invitation?.email || ownerEmail;
          platformOrganizationState.latestOrganizationName = response?.organization?.name || organizationName;
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", platformOrganizationState.latestInviteEmailSent ? `Customer created and owner invitation sent to ${ownerEmail}.` : `Customer created, but email delivery was not confirmed; use the backup link.`, platformOrganizationState.latestInviteEmailSent ? "optimal" : "warning");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Customer organization could not be created.", "warning");
          renderDashboard();
        }
        return;
      } else {
        persistSettingsState(`${formKey.charAt(0).toUpperCase() + formKey.slice(1)} settings saved.`);
      }
      renderDashboard();
    });

    elements.settingsManagementSection.addEventListener("click", async (event) => {
      const expandMetricButton = event.target.closest("[data-profile-metric-expand]");
      if (expandMetricButton) {
        const metricId = expandMetricButton.dataset.profileMetricExpand;
        expandedCropProfileMetricId = expandedCropProfileMetricId === metricId ? null : metricId;
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

      const refreshTeamButton = event.target.closest("[data-team-refresh]");
      if (refreshTeamButton) {
        teamAccessState.status = "idle";
        await hydrateTeamAccess();
        return;
      }

      const refreshPlatformButton = event.target.closest("[data-platform-refresh]");
      if (refreshPlatformButton) {
        platformOrganizationState.status = "idle";
        await hydratePlatformOrganizations();
        return;
      }

      const platformNodeDiagnosticsButton = event.target.closest("[data-platform-node-diagnostics]");
      if (platformNodeDiagnosticsButton) {
        await hydratePlatformNodeDiagnostics(
          platformNodeDiagnosticsButton.dataset.platformNodeDiagnostics,
          platformNodeDiagnosticsButton.dataset.platformName || "Organization"
        );
        return;
      }

      const closePlatformNodeDiagnosticsButton = event.target.closest("[data-platform-node-diagnostics-close]");
      if (closePlatformNodeDiagnosticsButton) {
        platformOrganizationState.nodeDiagnostics = { organizationId: "", organizationName: "", nodes: [], status: "idle", error: "" };
        renderDashboard();
        return;
      }

      const archivePlatformButton = event.target.closest("[data-platform-archive]");
      if (archivePlatformButton) {
        const organizationId = archivePlatformButton.dataset.platformArchive;
        const organizationName = archivePlatformButton.dataset.platformName || organizationId;
        if (!window.confirm(`Archive ${organizationName}? Users will lose access, but data will be kept.`)) return;
        try {
          await window.NeuroCropApi.archivePlatformOrganization(organizationId);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${organizationName} archived. Data was kept.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Customer organization could not be archived.", "warning");
          renderDashboard();
        }
        return;
      }

      const restorePlatformButton = event.target.closest("[data-platform-restore]");
      if (restorePlatformButton) {
        try {
          await window.NeuroCropApi.restorePlatformOrganization(restorePlatformButton.dataset.platformRestore);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", "Customer organization restored.", "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Customer organization could not be restored.", "warning");
          renderDashboard();
        }
        return;
      }

      const deletePlatformButton = event.target.closest("[data-platform-delete]");
      if (deletePlatformButton) {
        const organizationId = deletePlatformButton.dataset.platformDelete;
        const organizationName = deletePlatformButton.dataset.platformName || organizationId;
        const message = `Permanently delete ${organizationName}?\n\nThis removes its areas, sections, nodes, measurements, users, invitations, and ChirpStack devices where possible. This cannot be undone.`;
        if (!window.confirm(message)) return;
        try {
          const response = await window.NeuroCropApi.deletePlatformOrganization(organizationId);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${organizationName} deleted permanently. Removed ${Number(response?.summary?.nodes || 0)} nodes and ${Number(response?.summary?.measurements || 0)} measurements.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Customer organization could not be deleted.", "warning");
          renderDashboard();
        }
        return;
      }

      const approveRequestButton = event.target.closest("[data-platform-request-approve]");
      if (approveRequestButton) {
        const requestId = approveRequestButton.dataset.platformRequestApprove;
        const requestName = approveRequestButton.dataset.platformRequestName || "this organization";
        if (!window.confirm(`Approve ${requestName} and create a customer workspace?`)) return;
        try {
          await window.NeuroCropApi.approveOrganizationRequest(requestId);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${requestName} approved and created.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Organization request could not be approved.", "warning");
          renderDashboard();
        }
        return;
      }

      const rejectRequestButton = event.target.closest("[data-platform-request-reject]");
      if (rejectRequestButton) {
        const requestId = rejectRequestButton.dataset.platformRequestReject;
        const requestName = rejectRequestButton.dataset.platformRequestName || "this organization";
        if (!window.confirm(`Reject ${requestName}? The user account will remain, but no workspace will be created.`)) return;
        try {
          await window.NeuroCropApi.rejectOrganizationRequest(requestId);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${requestName} request rejected.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Organization request could not be rejected.", "warning");
          renderDashboard();
        }
        return;
      }

      const revokePlatformAdminButton = event.target.closest("[data-platform-admin-revoke]");
      if (revokePlatformAdminButton) {
        const adminEmail = revokePlatformAdminButton.dataset.platformAdminEmail || "this user";
        if (!window.confirm(`Remove platform admin access from ${adminEmail}?`)) return;
        try {
          await window.NeuroCropApi.revokePlatformAdmin(revokePlatformAdminButton.dataset.platformAdminRevoke);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${adminEmail} is no longer a platform administrator.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Platform admin access could not be revoked.", "warning");
          renderDashboard();
        }
        return;
      }

      const grantPlatformAdminButton = event.target.closest("[data-platform-admin-grant]");
      if (grantPlatformAdminButton) {
        const userId = grantPlatformAdminButton.dataset.platformAdminGrant;
        const userEmail = grantPlatformAdminButton.dataset.platformAdminEmail || "this user";
        if (!window.confirm(`Grant Platform Admin access to ${userEmail}? This allows customer and organization management.`)) return;
        try {
          await window.NeuroCropApi.grantPlatformAdmin({ userId });
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${userEmail} is now a platform administrator.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "Platform admin access could not be granted.", "warning");
          renderDashboard();
        }
        return;
      }

      const platformUserStatusButton = event.target.closest("[data-platform-user-status]");
      if (platformUserStatusButton) {
        const userId = platformUserStatusButton.dataset.platformUserStatus;
        const userEmail = platformUserStatusButton.dataset.platformUserEmail || "this user";
        const currentlyActive = platformUserStatusButton.dataset.platformUserActive === "true";
        const nextActive = !currentlyActive;
        if (!window.confirm(`${nextActive ? "Activate" : "Deactivate"} ${userEmail}?${nextActive ? "" : " Their active sessions will be closed."}`)) return;
        try {
          await window.NeuroCropApi.setPlatformUserActive(userId, nextActive);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${userEmail} ${nextActive ? "activated" : "deactivated"}.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "User status could not be changed.", "warning");
          renderDashboard();
        }
        return;
      }

      const deletePlatformUserButton = event.target.closest("[data-platform-user-delete]");
      if (deletePlatformUserButton) {
        const userId = deletePlatformUserButton.dataset.platformUserDelete;
        const userEmail = deletePlatformUserButton.dataset.platformUserEmail || "this user";
        const message = `Permanently delete ${userEmail}?\n\nThe account, sessions, invitations, requests, and memberships will be removed. Organization sensor measurements will be kept. This cannot be undone.`;
        if (!window.confirm(message)) return;
        try {
          await window.NeuroCropApi.deletePlatformUser(userId);
          platformOrganizationState.status = "idle";
          setManagementNotice("settings", `${userEmail} deleted permanently. Organization measurement data was kept.`, "optimal");
          await hydratePlatformOrganizations();
        } catch (error) {
          setManagementNotice("settings", error?.message || "User could not be deleted.", "warning");
          renderDashboard();
        }
        return;
      }

      const revokeInvitationButton = event.target.closest("[data-invitation-revoke]");
      if (revokeInvitationButton) {
        try {
          await window.NeuroCropApi.revokeInvitation(revokeInvitationButton.dataset.invitationRevoke);
          teamAccessState.status = "idle";
          teamAccessState.latestInviteUrl = "";
          setManagementNotice("settings", "Invitation revoked.", "optimal");
          await hydrateTeamAccess();
        } catch (error) {
          setManagementNotice("settings", error?.message || "The invitation could not be revoked.", "warning");
          renderDashboard();
        }
        return;
      }

      const copyInvitationButton = event.target.closest("[data-copy-invitation]");
      if (copyInvitationButton) {
        const inviteUrl = copyInvitationButton.dataset.copyInvitation || "";
        try {
          await navigator.clipboard.writeText(inviteUrl);
          setManagementNotice("settings", "Invitation link copied.", "optimal");
        } catch (error) {
          window.prompt("Copy this invitation link", inviteUrl);
        }
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

      const createProfileButton = event.target.closest("[data-settings-create-profile-open]");
      if (createProfileButton) {
        const drawer = elements.settingsManagementSection.querySelector(".crop-profile-create-drawer");
        if (drawer instanceof HTMLDetailsElement) {
          drawer.open = true;
          drawer.querySelector("input")?.focus();
        }
        return;
      }

      const discardProfileButton = event.target.closest("[data-settings-profile-discard]");
      if (discardProfileButton) {
        const profileKey = discardProfileButton.dataset.settingsProfileDiscard;
        if (profileKey) delete settingsProfileEditorDrafts[profileKey];
        clearManagementNotice("settings");
        renderDashboard();
        return;
      }

      const deleteProfileButton = event.target.closest("[data-settings-profile-delete]");
      if (deleteProfileButton) {
        const profileKey = deleteProfileButton.dataset.settingsProfileDelete;
        const profile = cropProfiles[profileKey];
        if (!profile || deleteProfileButton.hasAttribute("disabled")) return;

        if (isApiDataMode() && window.NeuroCropApi?.deleteCropProfile) {
          (async () => {
            try {
              await window.NeuroCropApi.deleteCropProfile(profileKey);
              await hydrateCropProfilesFromApi();
              activeSettingsProfileKey = Object.keys(cropProfiles)[0] || activeProfileKey;
              settingsProfileFormState.sourceProfile = activeSettingsProfileKey;
              setManagementNotice("settings", `${profile.name} deleted.`);
              renderDashboard();
            } catch (error) {
              setManagementNotice("settings", error instanceof Error ? error.message : "Crop profile could not be deleted.", "warning");
              renderDashboard();
            }
          })();
          return;
        }

        delete cropProfiles[profileKey];
        persistCustomCropProfiles();
        persistCropProfileOverrides();
        activeSettingsProfileKey = Object.keys(cropProfiles)[0] || activeProfileKey;
        settingsProfileFormState.sourceProfile = activeSettingsProfileKey;
        setManagementNotice("settings", `${profile.name} deleted.`);
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
      const csvForm = event.target.closest("[data-csv-export-form]");
      if (csvForm) {
        event.preventDefault();
        submitCsvExport();
        return;
      }
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
      if (form.dataset.managementModalForm === "node-register") {
        submitNodeForm();
      }
      if (form.dataset.managementModalForm === "action-completion") {
        submitActionCompletionModal();
      }
    });

    elements.managementModalOverlay.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === "nodeDevEui") {
        syncNodeFormField(event.target);
      }
    });

    elements.managementModalOverlay.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === "modalLocationLeaveUnassigned") {
        syncLocationUnassignedChoice();
      }
      if (event.target instanceof HTMLInputElement && event.target.name === "modalNodeDeleteConfirm") {
        const removeButton = elements.managementModalOverlay.querySelector("[data-modal-node-delete]");
        if (removeButton instanceof HTMLButtonElement) removeButton.disabled = !event.target.checked;
      }
      if (event.target instanceof HTMLSelectElement && ["nodeSiteId", "nodeZoneId"].includes(event.target.name)) {
        syncNodeFormField(event.target);
      }
      if (event.target instanceof HTMLSelectElement && event.target.name === "modalNodeSiteId") {
        const sectionSelect = elements.managementModalOverlay.querySelector('[name="modalNodeSectionId"]');
        if (!(sectionSelect instanceof HTMLSelectElement)) return;
        const targetSite = dashboardData.sites.find((site) => site.id === event.target.value);
        const targetZones = Array.isArray(targetSite?.zones) ? targetSite.zones : [];
        sectionSelect.innerHTML = getNodeSectionOptions(event.target.value);
        sectionSelect.disabled = targetZones.length === 0;
        rebuildEnhancedSelect(sectionSelect);
      }
      if (event.target instanceof HTMLSelectElement && event.target.name === "csvAreaId") {
        const sectionSelect = elements.managementModalOverlay.querySelector('[name="csvSectionId"]');
        if (!(sectionSelect instanceof HTMLSelectElement)) return;
        const targetSite = dashboardData.sites.find((site) => site.id === event.target.value);
        const sections = targetSite?.zones || [];
        sectionSelect.innerHTML = getCsvExportSectionOptions(event.target.value);
        sectionSelect.disabled = sections.length === 0;
        rebuildEnhancedSelect(sectionSelect);
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
        return;
      }

      const saveNodeSensorButton = event.target.closest("[data-node-sensor-save]");
      if (saveNodeSensorButton) {
        saveNodeSensorPurpose(saveNodeSensorButton);
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
          const wrapper = enhancedSelectOption.closest(".nc-select");
          select.value = enhancedSelectOption.dataset.value || "";
          syncEnhancedSelect(select);
          closeEnhancedSelectMenus();
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          setEnhancedSelectOpen(wrapper, false, { restoreFocus: true });
        }
        return;
      }

      const enhancedSelectTrigger = event.target.closest?.("[data-nc-select-trigger]");
      if (enhancedSelectTrigger) {
        const wrapper = enhancedSelectTrigger.closest(".nc-select");
        if (!wrapper || enhancedSelectTrigger.disabled) return;
        const shouldOpen = wrapper.dataset.open !== "true";
        closeEnhancedSelectMenus(wrapper);
        setEnhancedSelectOpen(wrapper, shouldOpen);
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

    document.addEventListener("keydown", (event) => {
      const trigger = event.target.closest?.("[data-nc-select-trigger]");
      const option = event.target.closest?.("[data-nc-select-option]");

      if (trigger) {
        const wrapper = trigger.closest(".nc-select");
        if (!wrapper || trigger.disabled) return;
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          const shouldOpen = wrapper.dataset.open !== "true";
          closeEnhancedSelectMenus(wrapper);
          setEnhancedSelectOpen(wrapper, shouldOpen);
          if (shouldOpen) {
            focusEnhancedSelectOption(wrapper, event.key === "ArrowUp" ? "last" : "selected");
          }
          return;
        }
        if (event.key === "Escape" && wrapper.dataset.open === "true") {
          event.preventDefault();
          setEnhancedSelectOpen(wrapper, false, { restoreFocus: true });
        }
        return;
      }

      if (!option) return;
      const wrapper = option.closest(".nc-select");
      if (!wrapper) return;
      const options = Array.from(wrapper.querySelectorAll("[data-nc-select-option]:not(:disabled)"));
      const currentIndex = options.indexOf(option);
      if (event.key === "Escape") {
        event.preventDefault();
        setEnhancedSelectOpen(wrapper, false, { restoreFocus: true });
      } else if (event.key === "Home") {
        event.preventDefault();
        focusEnhancedSelectOption(wrapper, "first");
      } else if (event.key === "End") {
        event.preventDefault();
        focusEnhancedSelectOption(wrapper, "last");
      } else if (event.key === "ArrowDown" && currentIndex >= 0) {
        event.preventDefault();
        options[Math.min(options.length - 1, currentIndex + 1)]?.focus();
      } else if (event.key === "ArrowUp" && currentIndex >= 0) {
        event.preventDefault();
        options[Math.max(0, currentIndex - 1)]?.focus();
      } else if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        option.click();
      }
    });

    window.addEventListener("storage", refreshDashboardDataFromStore);
    window.addEventListener("focus", refreshDashboardDataFromStore);
    window.addEventListener("resize", scheduleViewportSync, { passive: true });

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
      const sectionCard = event.target.closest("[data-overview-section-card]");
      if (sectionCard) {
        activePrimaryPage = "overview";
        sidebarActionOverride = null;
        activeSiteId = sectionCard.dataset.siteId;
        activeZoneId = sectionCard.dataset.zoneId;
        activeViewScope = "zone";
        normalizeActiveSelection();
        persistActiveContext();
        resetTrendSelectionForContextChange();
        renderSiteOptions();
        renderZoneOptions();
        resetCurrentReadingsFromActiveZone();
        renderDashboard();
        syncTopLevelRoute("/");
        return;
      }

      const areaCard = event.target.closest("[data-overview-area-card]");
      if (areaCard) {
        activePrimaryPage = "overview";
        sidebarActionOverride = null;
        activeSiteId = areaCard.dataset.overviewAreaCard;
        activeViewScope = "zone";
        normalizeActiveSelection({ preferCurrentZone: false });
        persistActiveContext();
        renderSiteOptions();
        renderZoneOptions();
        resetCurrentReadingsFromActiveZone();
        renderDashboard();
        syncTopLevelRoute("/");
        return;
      }

      const feedbackButton = event.target.closest("[data-triage-feedback]");
      if (feedbackButton) {
        const action = (backendTodayActions || []).find((item) => item.id === feedbackButton.dataset.actionId);
        requestTodayPriorityFeedback(feedbackButton.dataset.triageFeedback, action);
        return;
      }

      const actionButton = event.target.closest("[data-triage-action]");
      if (!actionButton) return;

      const action = actionButton.dataset.triageAction;
      if (action === "readings") {
        if (actionButton.dataset.siteId) {
          activeSiteId = actionButton.dataset.siteId;
          normalizeActiveSelection({ preferCurrentZone: false });
          renderSiteOptions();
          renderZoneOptions();
        }
        runDashboardAction("readings");
        return;
      }
      if (action === "trend") {
        if (actionButton.dataset.siteId && actionButton.dataset.zoneId) {
          activeSiteId = actionButton.dataset.siteId;
          activeZoneId = actionButton.dataset.zoneId;
          activeViewScope = "zone";
          normalizeActiveSelection();
          resetCurrentReadingsFromActiveZone();
        }
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
      if (action === "readings") {
        if (actionButton.dataset.siteId) {
          activeSiteId = actionButton.dataset.siteId;
          normalizeActiveSelection({ preferCurrentZone: false });
        }
        runDashboardAction("readings");
        return;
      }
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

      const feedbackButton = event.target.closest("[data-today-feedback]");
      if (feedbackButton) {
        requestTodayPriorityFeedback(feedbackButton.dataset.todayFeedback);
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

      if (event.target.closest("[data-today-compare-page]")) {
        runDashboardAction("readings");
        return;
      }

      const alert = event.target.closest("[data-today-alert-site-id]");
      if (!alert) return;
      openZoneDetail(alert.dataset.todayAlertSiteId, alert.dataset.todayAlertZoneId);
    });

    elements.metricsGrid.addEventListener("click", (event) => {
      const areaSectionButton = event.target.closest("[data-area-reading-section]");
      if (areaSectionButton) {
        activeSiteId = areaSectionButton.dataset.areaReadingSite;
        activeZoneId = areaSectionButton.dataset.areaReadingSection;
        activeViewScope = "zone";
        normalizeActiveSelection();
        resetTrendSelectionForContextChange();
        resetCurrentReadingsFromActiveZone();
        renderSiteOptions();
        renderZoneOptions();
        renderDashboard();
        return;
      }

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

    elements.trendPresentationBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-trend-presentation]");
      if (!button) return;
      const nextPresentation = button.dataset.trendPresentation;
      if (!['raw', 'smoothed'].includes(nextPresentation) || nextPresentation === activeTrendPresentation) return;
      activeTrendPresentation = nextPresentation;
      renderDashboard();
    });

    elements.trendScaleBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-trend-scale]");
      if (!button) return;
      const nextScaleMode = button.dataset.trendScale;
      if (!["detail", "target"].includes(nextScaleMode) || nextScaleMode === activeTrendScaleMode) return;
      activeTrendScaleMode = nextScaleMode;
      renderDashboard();
    });

    elements.trendHistoryExportButton.addEventListener("click", openCsvExportModal);

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
      normalizeActiveSelection({ preferCurrentZone: false });
      resetTrendSelectionForContextChange();
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
      normalizeActiveSelection();
      resetTrendSelectionForContextChange();
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      renderDashboard();
    });

    elements.historySection.addEventListener("change", (event) => {
      const input = event.target.closest("[data-trend-comparison-zone]");
      if (!(input instanceof HTMLInputElement)) return;
      const zoneId = input.dataset.trendComparisonZone;
      if (!zoneId) return;
      const selected = new Set(trendComparisonZoneIds);
      if (input.checked) {
        if (selected.size >= 6) {
          input.checked = false;
          return;
        }
        selected.add(zoneId);
      } else {
        selected.delete(zoneId);
      }
      trendComparisonZoneIds = [...selected];
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
      const dashboardActionButton = event.target.closest("[data-dashboard-action]");
      if (dashboardActionButton) {
        event.preventDefault();
        runDashboardAction(dashboardActionButton.dataset.dashboardAction);
        return;
      }
      const retryButton = event.target.closest("[data-dashboard-retry]");
      if (retryButton) {
        retryDashboardView(retryButton);
        return;
      }
      const languageButton = event.target.closest("[data-language-option]");
      if (!languageButton) return;
      setInterfaceLanguage(languageButton.dataset.languageOption);
    });

    document.addEventListener("change", (event) => {
      const languageSelect = event.target.closest?.("[data-language-select]");
      if (languageSelect instanceof HTMLSelectElement) setInterfaceLanguage(languageSelect.value);
    });

    window.addEventListener("neurocrop:unauthorized", () => {
      if (unauthorizedStateHandled) return;
      unauthorizedStateHandled = true;
      window.sessionStorage.removeItem(loginSessionKey);
      resetTeamAccessState();
      resetPlatformOrganizationState();
      setHeaderAccountMenuOpen(false);
      setLoginState(null);
      elements.loginPassword.value = "";
      elements.loginError.textContent = diagnosticText(
        "Your session has ended. Please sign in again.",
        "Jūsų sesija baigėsi. Prisijunkite dar kartą."
      );
      elements.loginError.hidden = false;
      elements.loginEmail.focus();
    });

    window.addEventListener("online", updateClientConnectionStatus);
    window.addEventListener("offline", updateClientConnectionStatus);
    window.addEventListener("neurocrop:api-connection", (event) => {
      apiTransportConnected = event.detail?.connected !== false;
      updateClientConnectionStatus();
    });
    document.addEventListener("visibilitychange", () => {
      updateClientConnectionStatus();
      if (!document.hidden) refreshLiveDashboardData();
    });
    window.setInterval(updateClientConnectionStatus, 15000);
    window.setInterval(refreshLiveDashboardData, dashboardRefreshIntervalMs);

      renderSiteOptions();
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      resetLocationForm();
      resetBlockForm();
      resetNodeForm();
      const initialDashboardRoute = resolveDashboardRoute(window.location.pathname);
      activePrimaryPage = initialDashboardRoute.page;
      activeNodeDetailId = initialDashboardRoute.page === "nodes" ? initialDashboardRoute.nodeId || null : null;
      if (activePrimaryPage === "blocks") syncBlocksManagementContext();
      if (initialDashboardRoute.page === "history") {
        activeWorkspaceFocus = "all";
        setExperienceMode("detailed");
      }
      if (initialDashboardRoute.page === "readings") {
        activeWorkspaceFocus = "all";
        activeWorkbenchLensKey = "all";
        setExperienceMode("detailed");
      }
      renderDashboard();
      initializeLoginGate();
