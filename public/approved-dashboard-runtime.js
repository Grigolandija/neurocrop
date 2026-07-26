/* eslint-disable no-unused-vars -- Transitional shell state remains until the remaining legacy controls are migrated. */
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
    let dashboardRenderTimeoutId = null;
    let activeAlertRailFilterKey = "all";
    let backendAlertRecords = {};
    let backendAlertsCanonicalLoaded = false;
    let activeSensorHealthFilterKey = "focus";
    let activeInspectionRouteFilterKey = "focus";
    let activeWorkspaceFocus = "all";
    let activeTrendMetricKey = "";
    let expandedLiveMetricKey = "";
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
    let activeNodeDetailId = null;
    let activeCropProfileEditorSection = "climate";
    let activeSettingsProfileKey = activeProfileKey;
    let activeSettingsPanelKey = "profiles";
    let isCropProfileEditorOpen = false;
    let isCropProfileCreateOpen = false;
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



    function isGrowthMetricKey(key) {
      return key !== "batteryLevel";
    }

    function isScoreMetricKey(key) {
      return !["batteryLevel", "lux"].includes(key);
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








    function median(values) {
      if (!values.length) return null;
      const sorted = [...values].sort((left, right) => left - right);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
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








    function getHealthStateLabel(state) {
      if (state === "critical") return "Critical";
      if (state === "warning") return "Needs attention";
      if (state === "unknown") return "No data";
      return "Good";
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





    function resetTrendSelectionForContextChange() {
      activeTrendMetricKey = "";
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





    function setHeaderBatteryDropdownOpen(isOpen) {
      isHeaderBatteryDropdownOpen = Boolean(isOpen);
      elements.headerBatteryDropdown.classList.toggle("is-open", isHeaderBatteryDropdownOpen);
      elements.headerBatteryDropdown.setAttribute("aria-hidden", String(!isHeaderBatteryDropdownOpen));
      elements.headerBatteryIndicator.setAttribute("aria-expanded", String(isHeaderBatteryDropdownOpen));
    }





    function diagnosticText(english, lithuanian) {
      return interfaceLanguage === "lt" ? lithuanian : english;
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
        updateSidebarWorkspaceStatus(
          Object.values(backendAlertRecords).filter((record) => record?.managed === true && record?.active === true).length
        );
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

      const activeAlertCount = backendAlertsCanonicalLoaded
        ? Object.values(backendAlertRecords).filter((record) => record?.managed === true && record?.active === true).length
        : 0;
      updateSidebarWorkspaceStatus(activeAlertCount);
      updateSidebarActionState();
      document.body.dataset.dashboardState = "neutral";
      document.body.dataset.primaryPage = activePrimaryPage;
      applyInterfaceLanguage();
      syncStickyOffsets();
      return true;
    }

    function renderDashboardUnsafe() {
      if (renderReactOwnedRouteShell()) return;
      activePrimaryPage = "overview";
      sidebarActionOverride = null;
      syncTopLevelRoute("/", { replace: true });
      renderReactOwnedRouteShell();
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
