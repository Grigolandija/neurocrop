    const interfaceLanguageStorageKey = "neurocrop-interface-language-v1";
    const originalInterfaceText = new WeakMap();
    const appliedInterfaceText = new WeakMap();
    const originalInterfaceAttributes = new WeakMap();
    const appliedInterfaceAttributes = new WeakMap();
    const pendingInterfaceLanguageRoots = new Set();
    let interfaceLanguageApplyQueued = false;
    let interfaceLanguageRequestId = 0;
    let interfaceLanguage = (() => {
      try {
        const storedLanguage = window.localStorage.getItem(interfaceLanguageStorageKey);
        if (storedLanguage === "lt" || storedLanguage === "en") return storedLanguage;
        const settings = JSON.parse(window.localStorage.getItem("neurocrop-dashboard-settings-v1") || "{}");
        return settings.preferences?.locale === "lt-LT" ? "lt" : "en";
      } catch (error) {
        return "en";
      }
    })();

    let lithuanianInterfaceText = window.NeuroCropLithuanianText || {};

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

      const overviewDeviation = core.match(/^(\d+) Sections? (?:is|are) up to (.+) (above|below) target\.$/i);
      if (overviewDeviation) {
        const count = Number(overviewDeviation[1]);
        const sectionWord = count === 1 ? "sekcija" : "sekcijos";
        const direction = overviewDeviation[3].toLowerCase() === "above" ? "virš tikslo" : "žemiau tikslo";
        return `${leading}${count} ${sectionWord} nuo tikslo nukrypusi iki ${overviewDeviation[2]} ${direction}.${trailing}`;
      }

      const cropProfileOutside = core.match(/^(.+) is outside the active crop-profile target in (\d+) of (\d+) Sections\.$/i);
      if (cropProfileOutside) {
        const metric = lithuanianInterfaceText[cropProfileOutside[1]] || cropProfileOutside[1];
        return `${leading}${metric} neatitinka aktyvaus kultūros profilio tikslo ${cropProfileOutside[2]} iš ${cropProfileOutside[3]} sekcijų.${trailing}`;
      }

      const canopyHeatRisk = core.match(/^Air temperature is (.+) above target\. Low relative humidity increases drying demand, while VPD remains inside its configured target\. This is an emerging canopy heat risk; leaf temperature and persistence over time would confirm plant-level heat stress\.$/i);
      if (canopyHeatRisk) {
        return `${leading}Oro temperatūra yra ${canopyHeatRisk[1]} virš tikslo. Maža santykinė drėgmė didina džiūvimo poreikį, o VPD išlieka nustatytose tikslinėse ribose. Tai besiformuojanti lapijos perkaitimo rizika; lapų temperatūra ir būklės trukmė padėtų patvirtinti augalų šiluminį stresą.${trailing}`;
      }

      const patterns = [
        [/^(\d+)\s+sec ago$/i, "prieš $1 sek."],
        [/^(\d+)\s+min ago$/i, "prieš $1 min."],
        [/^(\d+)\s+h ago$/i, "prieš $1 val."],
        [/^(\d+)\s+needs action$/i, "$1 reikia veiksmo"],
        [/^(\d+)\s+watch$/i, "$1 stebima"],
        [/^(\d+)\s+stable$/i, "$1 stabilios"],
        [/^Affects\s+(\d+)\s+of\s+(\d+)\s+Sections$/i, "Paveikia $1 iš $2 sekcijų"],
        [/^(\d+)\s+of\s+(\d+)\s+nodes reporting$/i, "$1 iš $2 mazgų siunčia duomenis"],
        [/^(\d+)\s+of\s+(\d+)\s+nodes$/i, "$1 iš $2 mazgų"],
        [/^(\d+)\s+actions?\s+·\s+(\d+)\s+watch conditions?$/i, "$1 veiksmai · $2 stebimos sąlygos"],
        [/^Review\s+(\d+)\s+affected Sections?$/i, "Peržiūrėti $1 paveiktas sekcijas"],
        [/^The Section median stays visible\. Select up to 5 Nodes\s+·\s+(\d+)\/5 selected\.$/i, "Sekcijos mediana lieka matoma. Pasirinkite iki 5 mazgų · pasirinkta $1/5."],
        [/^Section median\s+\+\s+(\d+)\s+Nodes?$/i, "Sekcijos mediana + $1 mazgai"],
        [/^View evidence for\s+(.+)$/i, "Peržiūrėti sekcijos „$1“ duomenų pagrindimą"],
        [/^View all\s+(\d+)\s+Sections$/i, "Peržiūrėti visas $1 sekcijas"],
        [/^(Increase|Decrease)\s+by\s+(.+)$/i, (_, direction, amount) => `${direction.toLowerCase() === "increase" ? "Padidinti" : "Sumažinti"} per ${amount}`],
        [/^(.+)\s+is outside its target range\.?$/i, (_, metric) => `${lithuanianInterfaceText[metric] || metric} neatitinka tikslinių ribų`],
        [/^(.+)\s+(.+)\s+·\s+target\s+(.+)$/i, (_, metric, value, target) => `${lithuanianInterfaceText[metric] || metric} ${value} · tikslas ${target}`],
        [/^(.+)\s+above target$/i, "$1 virš tikslo"],
        [/^(.+)\s+below target$/i, "$1 žemiau tikslo"],
        [/^(\d+)\s+sections monitored$/i, "Stebimos sekcijos: $1"],
        [/^(\d+)\s+active\s+·\s+(\d+)\s+pending$/i, "$1 aktyvūs · $2 laukia"],
        [/^(\d+)\s+configured nodes$/i, "Sukonfigūruoti mazgai: $1"],
        [/^(\d+)\s+active areas$/i, "Aktyvios erdvės: $1"],
        [/^(\d+)\s+active sections$/i, "Aktyvios sekcijos: $1"],
        [/^(\d+)\s+connected nodes$/i, "Prijungti mazgai: $1"],
        [/^(\d+)\s+assigned nodes$/i, "Priskirti mazgai: $1"],
        [/^(\d+)\s+areas$/i, "$1 erdvės"],
        [/^(\d+)\s+sections$/i, "$1 sekcijos"],
        [/^(\d+)\s+actions$/i, "$1 veiksmai"],
        [/^(\d+)\s+sensor sources?$/i, "$1 sensorių šaltiniai"],
        [/^(.+)\s+across sections$/i, "$1 visose sekcijose"],
        [/^Join\s+(.+)$/i, "Prisijungti prie „$1“"],
        [/^Last active\s+(.+)$/i, "Paskutinį kartą aktyvi $1"],
        [/^(.+)\s+·\s+expires\s+(.+)$/i, "$1 · galioja iki $2"],
        [/^(.+)\s+role updated\.?$/i, "Atnaujintas naudotojo $1 vaidmuo."],
        [/^Invitation for\s+(.+)\s+revoked\.?$/i, "Kvietimas adresu $1 atšauktas."],
        [/^Time\s*\((.+)\)$/i, "Laikas ($1)"],
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

    function queryInterfaceElements(root, selector) {
      const elements = [];
      if (root instanceof Element && root.matches(selector)) elements.push(root);
      if (root?.querySelectorAll) elements.push(...root.querySelectorAll(selector));
      return elements;
    }

    function applyInterfaceLanguage(root = document.body) {
      document.documentElement.lang = interfaceLanguage;
      queryInterfaceElements(root, "[data-language-option]").forEach((button) => {
        const isActive = button.dataset.languageOption === interfaceLanguage;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      queryInterfaceElements(root, "[data-language-select]").forEach((select) => {
        select.value = interfaceLanguage;
      });

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parentTag = node.parentElement?.tagName;
        if (parentTag !== "SCRIPT" && parentTag !== "STYLE") {
          if (!originalInterfaceText.has(node) || (appliedInterfaceText.has(node) && appliedInterfaceText.get(node) !== node.nodeValue)) {
            originalInterfaceText.set(node, node.nodeValue);
          }
          const englishText = originalInterfaceText.get(node);
          const nextText = interfaceLanguage === "lt" ? translateInterfaceText(englishText) : englishText;
          appliedInterfaceText.set(node, nextText);
          if (node.nodeValue !== nextText) node.nodeValue = nextText;
        }
        node = walker.nextNode();
      }

      queryInterfaceElements(root, "[placeholder], [title], [aria-label]").forEach((element) => {
        ["placeholder", "title", "aria-label"].forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          const originals = originalInterfaceAttributes.get(element) || {};
          const applied = appliedInterfaceAttributes.get(element) || {};
          const currentValue = element.getAttribute(attribute) || "";
          if (!(attribute in originals) || (attribute in applied && applied[attribute] !== currentValue)) {
            originals[attribute] = currentValue;
            originalInterfaceAttributes.set(element, originals);
          }
          const nextValue = interfaceLanguage === "lt" ? translateInterfaceText(originals[attribute]).trim() : originals[attribute];
          applied[attribute] = nextValue;
          appliedInterfaceAttributes.set(element, applied);
          if (currentValue !== nextValue) element.setAttribute(attribute, nextValue);
        });
      });
    }

    function queueInterfaceLanguageApply(root = document.body) {
      const nextRoot = root instanceof Element ? root : root?.parentElement;
      if (!nextRoot || !nextRoot.isConnected) return;

      if (nextRoot === document.body) {
        pendingInterfaceLanguageRoots.clear();
        pendingInterfaceLanguageRoots.add(document.body);
      } else if (!pendingInterfaceLanguageRoots.has(document.body)) {
        let isCovered = false;
        pendingInterfaceLanguageRoots.forEach((pendingRoot) => {
          if (pendingRoot.contains(nextRoot)) isCovered = true;
          else if (nextRoot.contains(pendingRoot)) pendingInterfaceLanguageRoots.delete(pendingRoot);
        });
        if (!isCovered) pendingInterfaceLanguageRoots.add(nextRoot);
      }

      if (interfaceLanguageApplyQueued) return;
      interfaceLanguageApplyQueued = true;
      window.requestAnimationFrame(() => {
        interfaceLanguageApplyQueued = false;
        const roots = [...pendingInterfaceLanguageRoots];
        pendingInterfaceLanguageRoots.clear();
        roots.forEach((pendingRoot) => {
          if (pendingRoot.isConnected) applyInterfaceLanguage(pendingRoot);
        });
      });
    }

    function commitInterfaceLanguage(nextLanguage) {
      interfaceLanguage = nextLanguage;
      try {
        window.localStorage.setItem(interfaceLanguageStorageKey, interfaceLanguage);
        const settingsKey = "neurocrop-dashboard-settings-v1";
        const settings = JSON.parse(window.localStorage.getItem(settingsKey) || "{}");
        window.localStorage.setItem(settingsKey, JSON.stringify({
          ...settings,
          preferences: {
            ...(settings.preferences || {}),
            locale: interfaceLanguage === "lt" ? "lt-LT" : "en-GB"
          }
        }));
      } catch (error) {
        // Language still works for the active session if storage is unavailable.
      }
      renderDashboard();
      applyInterfaceLanguage();
      window.dispatchEvent(new CustomEvent("neurocrop:language-change", { detail: { language: interfaceLanguage } }));
    }

    function setInterfaceLanguage(nextLanguage) {
      const language = nextLanguage === "lt" ? "lt" : "en";
      const requestId = ++interfaceLanguageRequestId;
      if (language === "lt" && !Object.keys(lithuanianInterfaceText).length && window.NeuroCropLoadLithuanianTranslations) {
        void window.NeuroCropLoadLithuanianTranslations().then(
          () => {
            if (requestId !== interfaceLanguageRequestId) return;
            lithuanianInterfaceText = window.NeuroCropLithuanianText || {};
            commitInterfaceLanguage(language);
          },
          () => {
            if (requestId === interfaceLanguageRequestId) commitInterfaceLanguage(language);
          }
        );
        return;
      }
      commitInterfaceLanguage(language);
    }

    window.NeuroCropI18n = {
      getLanguage: () => interfaceLanguage,
      setLanguage: setInterfaceLanguage,
      translate: translateInterfaceText
    };

    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => queueInterfaceLanguageApply(node));
          return;
        }
        queueInterfaceLanguageApply(mutation.target);
      });
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"]
    });

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
      name: "Default",
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
    const apiCropProfileKeys = new Set();
    let hasHydratedApiCropProfiles = false;
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
      if (!isApiDataMode()) return true;
      if (!hasHydratedApiCropProfiles) return !legacyStarterCropProfileKeys.has(profileKey);
      return apiCropProfileKeys.has(profileKey);
    }

    function getVisibleCropProfileEntries() {
      return Object.entries(cropProfiles).filter(([profileKey]) => isVisibleSettingsCropProfile(profileKey));
    }

    function applyApiCropProfiles(payload) {
      const apiProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
      apiCropProfileKeys.clear();
      Object.keys(cropProfiles).forEach((profileKey) => {
        if (!builtInCropProfileKeys.has(profileKey)) delete cropProfiles[profileKey];
      });

      apiProfiles.forEach((profile) => {
        const profileId = normalizeCropProfileKey(profile?.id || profile?.key || profile?.slug);
        if (!profileId || !profile?.metrics || typeof profile.metrics !== "object") return;
        apiCropProfileKeys.add(profileId);
        cropProfiles[profileId] = {
          ...getCompleteCropProfile(cropProfiles[profileId] || {}),
          id: profileId,
          name: profileId === "default" ? "Default" : String(profile.name || cropProfiles[profileId]?.name || profileId),
          heroName: String(profile.heroName || profile.hero_name || cropProfiles[profileId]?.heroName || profile.name || profileId),
          stage: String(profile.stage || profile.growthStage || profile.growth_stage || cropProfiles[profileId]?.stage || ""),
          hint: String(profile.hint || cropProfiles[profileId]?.hint || ""),
          requiresReview: Boolean(profile.requiresReview ?? profile.requires_review ?? false),
          metrics: getCompleteCropProfileMetrics(profile.metrics)
        };
      });
      hasHydratedApiCropProfiles = true;
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
      dashboardSidebar: document.getElementById("dashboardSidebar"),
      sidebarMobileOpen: document.getElementById("sidebarMobileOpen"),
      sidebarMobileClose: document.getElementById("sidebarMobileClose"),
      sidebarScrim: document.getElementById("sidebarScrim"),
      sidebarAlertCount: document.getElementById("sidebarAlertCount"),
      sidebarWorkspaceHealth: document.getElementById("sidebarWorkspaceHealth"),
      sidebarWorkspaceHealthLabel: document.getElementById("sidebarWorkspaceHealthLabel"),
      sidebarWorkspaceHealthMeta: document.getElementById("sidebarWorkspaceHealthMeta"),
      sidebarUserTile: document.getElementById("sidebarUserTile"),
      sidebarUserInitials: document.getElementById("sidebarUserInitials"),
      sidebarUserName: document.getElementById("sidebarUserName"),
      sidebarUserRole: document.getElementById("sidebarUserRole"),
      sidebarAccountMenu: document.getElementById("sidebarAccountMenu"),
      sidebarSignOutButton: document.getElementById("sidebarSignOutButton"),
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
      alertsManagementSection: document.getElementById("alertsManagementSection"),
      actionsManagementSection: document.getElementById("actionsManagementSection"),
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

    function hideRetiredOverviewSurfaces() {
      [
        elements.experienceModeSection,
        elements.overviewTriageSection,
        elements.heroStatusPanel,
        elements.todayPriorityPanel,
        elements.metricsSection,
        elements.historySection,
        elements.sensorHealthSection,
        elements.alertsSection,
        elements.opsDockSection,
        elements.detailedDiagnosticsSection,
        elements.zoneImpactSection,
        elements.advancedToolsPanel
      ].forEach((element) => {
        if (element) element.hidden = true;
      });
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

    function getSidebarUserPresentation(session) {
      const email = String(session?.email || "").trim();
      const rawName = String(session?.name || session?.displayName || email.split("@")[0] || "NeuroCrop user")
        .replace(/[._-]+/g, " ")
        .trim();
      const words = rawName.split(/\s+/).filter(Boolean);
      const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "NeuroCrop user";
      const initials = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("") || "NC";
      const role = session?.isPlatformAdmin ? "Platform admin" : session?.isSuperAdmin ? "Organization admin" : "Workspace member";
      return { name, initials, role };
    }

    function updateSidebarUser(session) {
      const user = getSidebarUserPresentation(session);
      elements.sidebarUserInitials.textContent = user.initials;
      elements.sidebarUserName.textContent = user.name;
      elements.sidebarUserRole.textContent = user.role;
    }

    function setSidebarAccountMenuOpen(isOpen) {
      const nextOpen = Boolean(isOpen);
      elements.sidebarAccountMenu.hidden = !nextOpen;
      elements.sidebarUserTile.setAttribute("aria-expanded", String(nextOpen));
    }

    function setSidebarOpen(isOpen) {
      const nextOpen = Boolean(isOpen);
      elements.dashboardSidebar.classList.toggle("rail-open", nextOpen);
      elements.sidebarScrim.hidden = !nextOpen;
      elements.sidebarMobileOpen.setAttribute("aria-expanded", String(nextOpen));
      document.body.dataset.sidebarOpen = String(nextOpen);
      if (!nextOpen) setSidebarAccountMenuOpen(false);
    }

    function updateSidebarWorkspaceStatus(alertCount = 0) {
      const nodes = dashboardData.sites.flatMap((site) =>
        (site.zones || []).flatMap((zone) =>
          (zone.batteryNodes || []).map((node) => ({ node, zone }))
        )
      );
      const onlineCount = nodes.filter(({ node, zone }) => getNodeFreshness(node, zone).transportStatus === "live").length;
      const totalCount = nodes.length;
      const allOnline = totalCount > 0 && onlineCount === totalCount;

      elements.sidebarAlertCount.textContent = String(alertCount);
      elements.sidebarAlertCount.hidden = alertCount === 0;
      elements.sidebarWorkspaceHealth.dataset.state = allOnline ? "online" : totalCount > 0 ? "attention" : "unknown";
      elements.sidebarWorkspaceHealthLabel.textContent = allOnline ? "Systems online" : totalCount > 0 ? "System attention" : "No nodes configured";
      elements.sidebarWorkspaceHealthMeta.textContent = totalCount > 0 ? `${onlineCount} of ${totalCount} nodes` : "Register a node to begin";
    }

    function setLoginState(session, options = {}) {
      const normalizedSession = normalizeLoginSession(session);
      const signedIn = Boolean(normalizedSession?.email);
      elements.loginScreen.hidden = signedIn;
      elements.dashboardShell.hidden = !signedIn;
      updateSidebarUser(normalizedSession);
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
        const [nextDashboardData, nodeInventoryResponse] = await Promise.all([
          window.NeuroCropApi.getDashboard(),
          window.NeuroCropApi.getNodes().catch((error) => {
            console.warn("NeuroCrop API node inventory load failed; using assigned dashboard nodes.", error);
            return null;
          })
        ]);
        if (!isCurrentRequest()) return;
        if (Array.isArray(nodeInventoryResponse?.nodes)) {
          backendNodeInventory = nodeInventoryResponse.nodes;
        }
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
        const [latestReadings, todayActionsResponse, actionHistoryResponse, alertsResponse] = await Promise.all([
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
          }),
          window.NeuroCropApi.getAlerts("all").catch((error) => {
            console.warn("NeuroCrop API alert workflow load failed; using the local cache.", error);
            return null;
          })
        ]);
        if (!isCurrentRequest() || nextZone.id !== getActiveZone()?.id) return;
        if (Array.isArray(todayActionsResponse?.actions)) backendTodayActions = todayActionsResponse.actions;
        if (Array.isArray(actionHistoryResponse?.items)) backendActionHistory = actionHistoryResponse.items;
        if (Array.isArray(alertsResponse?.alerts)) {
          backendAlertsCanonicalLoaded = true;
          backendAlertRecords = Object.fromEntries(alertsResponse.alerts.map((record) => [
            record.id,
            {
              ...record,
              item: record.context || {}
            }
          ]));
        }
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
      const reactWorkspaceMounted = (activePrimaryPage === "overview" && document.getElementById("overviewWorkspaceMount")?.childElementCount > 0)
        || (activePrimaryPage === "readings" && document.getElementById("readingsWorkspaceMount")?.childElementCount > 0);
      if (document.hidden || reactWorkspaceMounted || !signedIn || !livePage || !isApiDataMode()) return;
      hydrateDashboardFromApi({ preserveCurrentOnError: true, silent: true });
    }

    function refreshDataForActivePage() {
      const dataPage = ["overview", "readings", "history"].includes(activePrimaryPage);
      const signedIn = Boolean(getLoginSession()?.email);
      const isStale = Date.now() - lastDashboardHydratedAt >= dashboardRefreshTtlMs;
      const reactWorkspaceMounted = (activePrimaryPage === "overview" && document.getElementById("overviewWorkspaceMount")?.childElementCount > 0)
        || (activePrimaryPage === "readings" && document.getElementById("readingsWorkspaceMount")?.childElementCount > 0);
      if (reactWorkspaceMounted || !dataPage || !signedIn || !isApiDataMode() || !isStale) return;
      hydrateDashboardFromApi({ preserveCurrentOnError: true, silent: true });
    }

    async function initializeLoginGate() {
      if (window.NeuroCropApi?.isConnected()) {
        try {
          const response = await window.NeuroCropApi.getCurrentUser();
          const session = normalizeLoginSession(response?.user || { email: "" });
          if (!session.email) throw new Error("Authenticated user email is missing.");
          persistLoginSession(session);
          // A refresh must preserve a protected deep link. Only a fresh root entry
          // resets to Overview; explicit sign-in still resets below.
          const restoringProtectedRoute = window.location.pathname !== "/";
          setLoginState(session, { resetWorkspace: !restoringProtectedRoute });
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
        setSidebarAccountMenuOpen(false);
        setSidebarOpen(false);
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
        window.dispatchEvent(new CustomEvent("neurocrop:context-change", {
          detail: { siteId: activeSiteId, zoneId: activeZoneId }
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
      backendNodeInventory = null;
      backendAlertRecords = {};
      backendAlertsCanonicalLoaded = false;
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
    let currentAlertsPageItems = [];
    let backendAlertRecords = {};
    let backendAlertsCanonicalLoaded = false;
    const reviewedAlertsStorageKey = "neurocrop-reviewed-alerts-v1";
    let activeSensorHealthFilterKey = "focus";
    let activeInspectionRouteFilterKey = "focus";
    let activeWorkspaceFocus = "all";
    let activeTrendMetricKey = "";
    let expandedLiveMetricKey = "";
    let trendHistoryRequestId = 0;
    let trendHistoryByKey = {};
    let trendHistoryStatusByKey = {};
    let dynamicsBySectionId = {};
    let dynamicsStatusBySectionId = {};
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
    let backendNodeInventory = null;
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
    let activeCropProfileEditorSection = "climate";
    let activeSettingsProfileKey = activeProfileKey;
    let activeSettingsPanelKey = "profiles";
    let isCropProfileEditorOpen = false;
    let isCropProfileCreateOpen = false;
    let isCropProfileLibraryOpen = false;
    let activeCropProfileLibraryCrop = "all";
    let profileDeleteDialogKey = "";
    let settingsProfileEditorDrafts = {};
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
      actions: { page: "actions", route: "/actions" },
      settings: { page: "settings", route: "/settings" },
      organization: { page: "settings", route: "/organization", sidebarAction: "organization" },
      admin: { page: "admin", route: "/admin" },
      "admin/integrations": { page: "admin", route: "/admin/integrations" },
      "crop-profiles": { page: "settings", route: "/crop-profiles", sidebarAction: "crop-profiles" },
      simulator: { page: "settings", route: "/simulator", sidebarAction: "simulator" }
    };
    let locationFormState = { mode: "create", siteId: "", name: "" };
    let blockFormState = { mode: "create", siteId: activeSiteId, zoneId: "", name: "", profile: activeProfileKey, sensorCount: "4" };
    let nodeFormState = { siteId: activeSiteId, zoneId: activeZoneId, devEui: "" };
    let managementModalState = null;
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
        && (nextRoute.sidebarAction || null) === sidebarActionOverride
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
      sidebarActionOverride = nextRoute.sidebarAction || null;
      closeContextMenus();

      if (activePrimaryPage === "overview") {
        setExperienceMode("simple", { render: false, force: true });
      } else if (activePrimaryPage === "alerts") {
        activeWorkspaceFocus = "all";
      } else if (activePrimaryPage === "history" || activePrimaryPage === "readings") {
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
        alerts: "alertsManagementSection",
        actions: "actionsManagementSection",
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
      if (!event.data) return;
      if (event.data.type === "neurocrop:route") {
        applyDashboardRoute(event.data.route);
        return;
      }
      if (event.data.type !== "neurocrop:open-trend") return;

      const sectionId = String(event.data.sectionId || "");
      const requestedAreaId = String(event.data.areaId || "");
      const site = dashboardData.sites.find((item) =>
        item.id === requestedAreaId || (item.zones || []).some((zone) => zone.id === sectionId)
      );
      const zone = site?.zones?.find((item) => item.id === sectionId);
      if (!site || !zone) return;

      activeSiteId = site.id;
      activeZoneId = zone.id;
      activeProfileKey = zone.profile || activeProfileKey;
      persistActiveContext();
      renderSiteOptions();
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      openTrendHistory(String(event.data.metricKey || ""));
    });

    window.addEventListener("neurocrop:overview-area-change", (event) => {
      const requestedAreaId = String(event.detail?.siteId || "");
      const site = dashboardData.sites.find((item) => item.id === requestedAreaId);
      if (!site || site.id === activeSiteId) return;

      sidebarActionOverride = null;
      activeSiteId = site.id;
      normalizeActiveSelection({ preferCurrentZone: false });
      resetTrendSelectionForContextChange();
      renderZoneOptions();
      resetCurrentReadingsFromActiveZone();
      closeContextMenus();
      renderSiteOptions();
      persistActiveContext();
      scheduleDashboardRender();
    });

    function isDetailedExperience() {
      return activeExperienceMode === "detailed";
    }

    function setExperienceMode(nextMode, options = {}) {
      const { scroll = false, force = false, render = true } = options;
      const detailedRouteActive = activePrimaryPage === "history" || activePrimaryPage === "readings";
      const normalizedMode = detailedRouteActive && nextMode === "detailed" ? "detailed" : "simple";
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
      if (activePrimaryPage !== "history" && activePrimaryPage !== "readings") return;
      setExperienceMode("detailed");
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
      if (!adjustment) {
        setManagementModalError(diagnosticText("Describe the actual change or finding.", "Aprašykite realų pakeitimą arba radinį."));
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
      return !["batteryLevel", "lux"].includes(key);
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
        const medianResult = hasFiniteMetricValue(apiObservation.value)
          ? evaluateNodeValue(Number(apiObservation.value))
          : { value: null, state: "unavailable", severity: 0 };
        const outsideReadings = readings.filter((reading) => reading.metricResult.state !== "optimal");

        return {
          installedCount: Number(apiObservation.reportingSensors) || readings.length,
          reportingCount: readings.length,
          readings,
          medianValue: Number(apiObservation.value),
          medianResult,
          min: hasFiniteMetricValue(apiObservation.range?.min) ? Number(apiObservation.range.min) : Math.min(...values),
          max: hasFiniteMetricValue(apiObservation.range?.max) ? Number(apiObservation.range.max) : Math.max(...values),
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
      const levels = (zone?.batteryNodes || [])
        .map((node) => node.level)
        .filter(hasFiniteMetricValue)
        .map(Number);
      if (levels.length === 0) return null;
      return roundValue(Math.min(...levels), definition.decimals);
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
        .filter(([, observation]) => observation && hasFiniteMetricValue(observation.value))
        .map(([metricKey, observation]) => [metricKey, Number(observation.value)]));
    }

    function hasFiniteMetricValue(value) {
      return value !== null
        && value !== undefined
        && value !== ""
        && typeof value !== "boolean"
        && Number.isFinite(Number(value));
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
      if (!hasFiniteMetricValue(rawValue)) return getUnavailableMetricEvaluation(definition, "No live data");
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
      return availableMetrics.has(metricKey) || hasFiniteMetricValue(readings?.[metricKey]);
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
        in_progress: diagnosticText("In progress", "Vykdoma"),
        completed: diagnosticText("Awaiting verification", "Laukiama patvirtinimo"),
        deferred: diagnosticText("Deferred", "Atidėta"),
        failed: diagnosticText("Could not complete", "Nepavyko atlikti")
      };
      const actionInProgress = persistedFeedback?.status === "in_progress";
      const feedbackControls = action?.backendAction ? `
        <div class="today-priority-feedback" data-saving="${localFeedback?.saving === true}">
          <span class="today-priority-feedback-label">${actionInProgress ? diagnosticText("Record what was performed", "Užregistruokite, kas atlikta") : diagnosticText("Start this check before changing equipment", "Pradėkite patikrą prieš keisdami įrangą")}</span>
          <div class="today-priority-feedback-actions" role="group" aria-label="${diagnosticText("Record action outcome", "Išsaugoti veiksmo rezultatą")}">
            ${actionInProgress
              ? `<button type="button" data-today-feedback="completed" ${localFeedback?.saving ? "disabled" : ""}><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i>${diagnosticText("Record work", "Užregistruoti darbą")}</button>
                 <button type="button" data-today-feedback="failed" ${localFeedback?.saving ? "disabled" : ""}><i class="fa-solid fa-xmark" aria-hidden="true"></i>${diagnosticText("Could not complete", "Nepavyko")}</button>`
              : `<button type="button" data-today-feedback="in_progress" ${localFeedback?.saving || persistedFeedback?.status === "completed" ? "disabled" : ""}><i class="fa-solid fa-play" aria-hidden="true"></i>${diagnosticText("Start check", "Pradėti patikrą")}</button>
                 <button type="button" data-today-feedback="deferred" ${localFeedback?.saving || persistedFeedback?.status === "deferred" ? "disabled" : ""}><i class="fa-regular fa-clock" aria-hidden="true"></i>${diagnosticText("Defer", "Atidėti")}</button>`}
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
      } else if (activePrimaryPage === "alerts") {
        activeAction = "alerts";
      } else if (activePrimaryPage === "actions") {
        activeAction = "actions";
      } else if (activePrimaryPage === "settings") {
        activeAction = sidebarActionOverride === "crop-profiles"
          ? "crop-profiles"
          : sidebarActionOverride === "simulator"
            ? "simulator"
          : sidebarActionOverride === "organization"
            ? "organization"
            : "settings";
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
        case "alerts":
          activePrimaryPage = "alerts";
          sidebarActionOverride = null;
          activeWorkspaceFocus = "all";
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/alerts");
          scrollToSection("alertsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "actions":
          activePrimaryPage = "actions";
          sidebarActionOverride = null;
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/actions");
          scrollToSection("actionsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "crop-profiles":
          activePrimaryPage = "settings";
          activeSettingsPanelKey = "profiles";
          isCropProfileEditorOpen = false;
          isCropProfileCreateOpen = false;
          activeCropProfileEditorSection = "climate";
          if (cropProfiles[activeProfileKey]) activeSettingsProfileKey = activeProfileKey;
          sidebarActionOverride = "crop-profiles";
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/crop-profiles");
          scrollToSection("settingsManagementSection", { behavior: "auto", highlight: false });
          return;
        case "simulator":
          activePrimaryPage = "settings";
          sidebarActionOverride = "simulator";
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/simulator");
          scrollToSection("settingsManagementSection", { behavior: "auto", highlight: false });
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
        case "organization":
          activePrimaryPage = "settings";
          if (cropProfiles[activeProfileKey]) activeSettingsProfileKey = activeProfileKey;
          sidebarActionOverride = "organization";
          closeContextMenus();
          renderDashboard();
          syncTopLevelRoute("/organization");
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
        const submittedAction = status === "completed" && action.workflowAction
          ? action.workflowAction
          : action;
        const response = await window.NeuroCropApi.submitTodayActionFeedback(action.id, {
          status,
          action: submittedAction,
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
          in_progress: diagnosticText("In progress", "Vykdoma"),
          completed: diagnosticText("Awaiting verification", "Laukiama patvirtinimo"),
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

    function renderAlertsManagementPage(globalSnapshots = []) {
      currentAlertsPageItems = buildAlertsPageItems(globalSnapshots);
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

    function resetTrendSelectionForContextChange() {
      activeTrendMetricKey = "";
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

    function openTrendHistory(metricKey) {
      if (metricKey) {
        activeTrendMetricKey = metricKey;
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
        const hasLiveValue = hasFiniteMetricValue(readings?.[key]);
        const metricAvailableSet = isConfigured && !availableMetrics.has(key)
          ? new Set([...availableMetrics, key])
          : availableMetrics;
        return {
          key,
          scoreWeight: hasFiniteMetricValue(definition.scoreWeight) ? clamp(Number(definition.scoreWeight), 0, 3) : 1,
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
      const hasBaselineValue = hasFiniteMetricValue(rawBaselineValue);
      const hasCurrentValue = hasFiniteMetricValue(rawCurrentValue);
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
        in_progress: diagnosticText("In progress", "Vykdoma"),
        completed: diagnosticText("Awaiting verification", "Laukiama patvirtinimo"),
        deferred: diagnosticText("Deferred", "Atidėta"),
        failed: diagnosticText("Could not complete", "Nepavyko atlikti")
      };
      const actionInProgress = persistedFeedback?.status === "in_progress";
      const persistedText = persistedFeedback
        ? `${feedbackLabels[persistedFeedback.status] || persistedFeedback.status} · ${new Date(persistedFeedback.createdAt).toLocaleString(interfaceLanguage === "lt" ? "lt-LT" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}`
        : "";
      return `
        <div class="triage-feedback" data-saving="${localFeedback?.saving === true}">
          <span>${actionInProgress ? diagnosticText("Record what was performed", "Užregistruokite, kas atlikta") : diagnosticText("Start this check before changing equipment", "Pradėkite patikrą prieš keisdami įrangą")}</span>
          <div class="triage-feedback-actions" role="group" aria-label="${diagnosticText("Record action outcome", "Išsaugoti veiksmo rezultatą")}">
            ${actionInProgress
              ? `<button type="button" data-triage-feedback="completed" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving ? "disabled" : ""}><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i>${diagnosticText("Record work", "Užregistruoti darbą")}</button>
                 <button type="button" data-triage-feedback="failed" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving ? "disabled" : ""}><i class="fa-solid fa-xmark" aria-hidden="true"></i>${diagnosticText("Could not complete", "Nepavyko")}</button>`
              : `<button type="button" data-triage-feedback="in_progress" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving || persistedFeedback?.status === "completed" ? "disabled" : ""}><i class="fa-solid fa-play" aria-hidden="true"></i>${diagnosticText("Start check", "Pradėti patikrą")}</button>
                 <button type="button" data-triage-feedback="deferred" data-action-id="${escapeAttribute(action.id)}" ${localFeedback?.saving || persistedFeedback?.status === "deferred" ? "disabled" : ""}><i class="fa-regular fa-clock" aria-hidden="true"></i>${diagnosticText("Defer", "Atidėti")}</button>`}
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

      if (activePrimaryPage === "overview") {
        hideRetiredOverviewSurfaces();
        document.body.dataset.dashboardState = "neutral";
        document.body.dataset.viewScope = "site";
        document.body.dataset.primaryPage = "overview";
        return;
      }

      if (activePrimaryPage === "actions") {
        elements.experienceModeSection.hidden = true;
        elements.locationsManagementSection.hidden = true;
        elements.blocksManagementSection.hidden = true;
        elements.nodesManagementSection.hidden = true;
        elements.alertsManagementSection.hidden = true;
        elements.actionsManagementSection.hidden = false;
        elements.settingsManagementSection.hidden = true;
        elements.overviewTriageSection.hidden = true;
        elements.heroStatusPanel.hidden = true;
        elements.todayPriorityPanel.hidden = true;
        elements.metricsSection.hidden = true;
        elements.historySection.hidden = true;
        elements.sensorHealthSection.hidden = true;
        elements.alertsSection.hidden = true;
        elements.opsDockSection.hidden = true;
        elements.detailedDiagnosticsSection.hidden = true;
        elements.zoneImpactSection.hidden = true;
        document.body.dataset.primaryPage = "actions";
        return;
      }

      if (activePrimaryPage === "alerts") {
        const snapshots = dashboardData.sites.flatMap((systemSite) =>
          (systemSite.zones || []).map((systemZone) => evaluateZoneSnapshot(systemSite, systemZone))
        );
        elements.experienceModeSection.hidden = true;
        elements.locationsManagementSection.hidden = true;
        elements.blocksManagementSection.hidden = true;
        elements.nodesManagementSection.hidden = true;
        elements.alertsManagementSection.hidden = false;
        elements.actionsManagementSection.hidden = true;
        elements.settingsManagementSection.hidden = true;
        elements.overviewTriageSection.hidden = true;
        elements.heroStatusPanel.hidden = true;
        elements.todayPriorityPanel.hidden = true;
        elements.metricsSection.hidden = true;
        elements.historySection.hidden = true;
        elements.sensorHealthSection.hidden = true;
        elements.alertsSection.hidden = true;
        elements.opsDockSection.hidden = true;
        elements.detailedDiagnosticsSection.hidden = true;
        elements.zoneImpactSection.hidden = true;
        renderAlertsManagementPage(snapshots);
        updateSidebarWorkspaceStatus(getAlertsPageView(currentAlertsPageItems).open.length);
        document.body.dataset.dashboardState = "neutral";
        document.body.dataset.primaryPage = "alerts";
        return;
      }

      elements.alertsManagementSection.hidden = true;
      elements.actionsManagementSection.hidden = true;

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
      const reactOverviewOwnsRoute = activePrimaryPage === "overview";
      renderSiteOptions();
      renderZoneOptions();
      updateSidebarActionState();

      if (reactOverviewOwnsRoute) {
        hideRetiredOverviewSurfaces();
        document.body.dataset.dashboardState = "neutral";
        document.body.dataset.primaryPage = "overview";
        return;
      }

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
      elements.alertsManagementSection.hidden = true;
      elements.actionsManagementSection.hidden = true;
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

      elements.overviewTriageSection.hidden = reactOverviewOwnsRoute;
      if (!reactOverviewOwnsRoute) {
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
      }

      document.body.dataset.dashboardState = "neutral";
      document.body.dataset.primaryPage = activePrimaryPage;
    }

    function renderEmptyWorkspaceState() {
      const workspaceDependentPages = new Set(["blocks", "nodes", "readings", "history"]);
      const hasUnassignedNodeInventory = activePrimaryPage === "nodes"
        && Array.isArray(backendNodeInventory)
        && backendNodeInventory.length > 0;
      if (workspaceDependentPages.has(activePrimaryPage) && !hasUnassignedNodeInventory) {
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
      const isAlertsPage = activePrimaryPage === "alerts";
      const isActionsPage = activePrimaryPage === "actions";
      const isSettingsPage = activePrimaryPage === "settings";
      const isAdminPage = activePrimaryPage === "admin";
      const showWorkspaceSetup = activePrimaryPage !== "overview"
        && !isLocationsPage && !isBlocksPage && !isNodesPage && !isAlertsPage
        && !isActionsPage && !isSettingsPage && !isAdminPage;

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
      elements.alertsManagementSection.hidden = !isAlertsPage;
      elements.actionsManagementSection.hidden = !isActionsPage;
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

      if (isAlertsPage) renderAlertsManagementPage([]);

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

    const reactOwnedPrimaryPages = new Set([
      "overview",
      "locations",
      "blocks",
      "nodes",
      "alerts",
      "actions",
      "readings",
      "history",
      "settings",
      "admin"
    ]);

    function renderReactOwnedRouteShell() {
      if (!reactOwnedPrimaryPages.has(activePrimaryPage)) return false;

      const isLocationsPage = activePrimaryPage === "locations";
      const isBlocksPage = activePrimaryPage === "blocks";
      const isNodesPage = activePrimaryPage === "nodes";
      const isAlertsPage = activePrimaryPage === "alerts";
      const isActionsPage = activePrimaryPage === "actions";
      const isReadingsPage = activePrimaryPage === "readings";
      const isHistoryPage = activePrimaryPage === "history";
      const isSettingsPage = activePrimaryPage === "settings" || activePrimaryPage === "admin";

      elements.experienceModeSection.hidden = true;
      elements.locationsManagementSection.hidden = !isLocationsPage;
      elements.blocksManagementSection.hidden = !isBlocksPage;
      elements.nodesManagementSection.hidden = !isNodesPage;
      elements.alertsManagementSection.hidden = !isAlertsPage;
      elements.actionsManagementSection.hidden = !isActionsPage;
      elements.settingsManagementSection.hidden = !isSettingsPage;
      elements.overviewTriageSection.hidden = true;
      elements.heroStatusPanel.hidden = true;
      elements.todayPriorityPanel.hidden = true;
      elements.metricsSection.hidden = !isReadingsPage;
      elements.historySection.hidden = !isHistoryPage;
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

      if (backendAlertsCanonicalLoaded) {
        currentAlertsPageItems = buildAlertsPageItems([]);
      }
      updateSidebarWorkspaceStatus(getAlertsPageView(currentAlertsPageItems).open.length);
      updateSidebarActionState();
      document.body.dataset.dashboardState = "neutral";
      document.body.dataset.primaryPage = activePrimaryPage;
      applyInterfaceLanguage();
      syncStickyOffsets();
      return true;
    }

    function renderDashboardUnsafe(options = {}) {
      const isLocationsPage = activePrimaryPage === "locations";
      const isBlocksPage = activePrimaryPage === "blocks";
      const isNodesPage = activePrimaryPage === "nodes";
      const isAlertsPage = activePrimaryPage === "alerts";
      const isActionsPage = activePrimaryPage === "actions";
      const isOverviewPage = activePrimaryPage === "overview";
      const isReadingsPage = activePrimaryPage === "readings";
      const isHistoryPage = activePrimaryPage === "history";
      const isSettingsPage = activePrimaryPage === "settings";
      const isAdminPage = activePrimaryPage === "admin";
      const isManagementPage = isLocationsPage || isBlocksPage || isNodesPage || isAlertsPage || isActionsPage || isSettingsPage || isAdminPage;
      const isPrimaryWorkspacePage = isOverviewPage || isManagementPage || isHistoryPage || isReadingsPage;
      if (renderReactOwnedRouteShell()) return;
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
        const hasLiveValue = hasFiniteMetricValue(readings?.[key]);
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
      currentAlertsPageItems = buildAlertsPageItems(globalSnapshots);
      const alertsPageView = getAlertsPageView(currentAlertsPageItems);
      updateSidebarWorkspaceStatus(alertsPageView.open.length);
      if (isAlertsPage) renderAlertsManagementPage(globalSnapshots);
      if (isOverviewPage) {
        hideRetiredOverviewSurfaces();
        document.body.dataset.dashboardState = globalState;
        document.body.dataset.primaryPage = "overview";
        updateSidebarActionState();
        syncStickyOffsets();
        applyInterfaceLanguage();
        persistActiveContext();
        return;
      }
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
      // Overview is fully owned by the React workspace. The retired dashboard
      // renderer must never populate its former surfaces during refresh.

      elements.experienceModeTitle.textContent = isDetailedExperienceMode ? "Detailed analysis view" : "Simple client view";
      elements.experienceModeSummary.textContent = isDetailedExperienceMode
        ? isSiteView
          ? `Detailed analysis is open for ${site.name}. It includes system alerts, extra filters, sensor power, inspection route, and scenario tools.`
          : `Detailed analysis is open for ${zone.name}. It includes system alerts, extra filters, sensor power, inspection route, and scenario tools.`
        : isSiteView
          ? `Simple view keeps only the current location situation, the main average readings, and the next step for ${site.name}.`
          : `Simple view keeps only the current score, the main readings behind it, and the next step for ${zone.name}.`;
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
      elements.alertsManagementSection.hidden = !isAlertsPage;
      elements.actionsManagementSection.hidden = !isActionsPage;
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

      // The React Trends workspace owns /history; legacy chart DOM is not mounted.
      elements.historySection.hidden = !isHistoryPage;

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
      if (activePrimaryPage === "overview") {
        hideRetiredOverviewSurfaces();
        return;
      }
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
        const sharedDashboardContext = {
          sites: Array.isArray(dashboardData.sites) ? dashboardData.sites : [],
          siteId: activeSiteId,
          zoneId: activeZoneId
        };
        window.NeuroCropDashboardContext = sharedDashboardContext;
        window.dispatchEvent(new CustomEvent("neurocrop:dashboard-context", {
          detail: sharedDashboardContext
        }));
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
      if (form.dataset.managementModalForm === "action-completion") {
        submitActionCompletionModal();
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
        setSidebarOpen(false);
      });
    });

    elements.sidebarMobileOpen.addEventListener("click", () => setSidebarOpen(true));
    elements.sidebarMobileClose.addEventListener("click", () => setSidebarOpen(false));
    elements.sidebarScrim.addEventListener("click", () => setSidebarOpen(false));

    elements.sidebarUserTile.addEventListener("click", (event) => {
      event.stopPropagation();
      setSidebarAccountMenuOpen(elements.sidebarAccountMenu.hidden);
    });

    elements.sidebarSignOutButton.addEventListener("click", signOut);

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

      if (
        !elements.sidebarAccountMenu.hidden &&
        !event.target.closest("#sidebarAccountMenu") &&
        !event.target.closest("#sidebarUserTile")
      ) {
        setSidebarAccountMenuOpen(false);
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
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1280) setSidebarOpen(false);
    }, { passive: true });

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

      if (event.key === "Escape" && elements.dashboardSidebar.classList.contains("rail-open")) {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }

      if (event.key === "Escape" && !elements.sidebarAccountMenu.hidden) {
        event.preventDefault();
        setSidebarAccountMenuOpen(false);
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
      // Protected workspaces can mount behind the login gate when the browser
      // restores a deep URL. Their anonymous 401 must not clear autofilled
      // credentials or masquerade as an expired interactive session.
      const authenticatedWorkspaceWasVisible = !elements.dashboardShell.hidden;
      if (!authenticatedWorkspaceWasVisible) {
        elements.loginError.hidden = true;
        elements.loginSubmit.disabled = false;
        return;
      }
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
    window.addEventListener("neurocrop:workspace-structure-changed", async (event) => {
      const requestedRoute = String(event.detail?.route || "");
      await hydrateDashboardFromApi({ preserveCurrentOnError: true });
      if (!requestedRoute) {
        renderDashboard();
        return;
      }
      applyDashboardRoute(requestedRoute.split(/[?#]/, 1)[0]);
      syncTopLevelRoute(requestedRoute);
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
