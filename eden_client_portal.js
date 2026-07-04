(function () {
  if (window.__customMenuInjected) return;
  window.__customMenuInjected = true;

  (async function () {
    console.log("🚀 Injecting custom menu (adaptive)...");

    // ----- Cookie helpers -----
    function getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(";").shift();
      return null;
    }

    let contactId, locationId;
    try {
      const catCookie = getCookie("cat");
      if (!catCookie) throw new Error('"cat" cookie not found');
      const decoded = atob(catCookie);
      const data = JSON.parse(decoded);
      contactId = data.contactId;
      locationId = data.locationId;
      if (!contactId || !locationId) throw new Error("Missing contactId or locationId");
      console.log("✅ Contact ID:", contactId);
      console.log("✅ Location ID:", locationId);
    } catch (err) {
      console.error("❌ Failed to parse cat cookie:", err);
      return;
    }

    const API_KEY = "pit-65bf3e6f-96d0-4b48-a262-f12f57d4b7d7";
    const PIPELINE_NAME = "Property Maintenance";
    // const PIPELINE_ID = "cNoHwKrEOwZk0NDKX3hn";
    const PIPELINE_CACHE_KEY = "customMenu:pipelinesCache:v1";
    const CUSTOM_FIELDS_CACHE_KEY = "customMenu:opportunityCustomFieldsCache:v1";
    let pipelineCacheMemory = null;
    let customFieldsCacheMemory = null;

    function readPipelineCache() {
      if (pipelineCacheMemory) return pipelineCacheMemory;
      try {
        const raw = localStorage.getItem(PIPELINE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.pipelines)) return null;
        pipelineCacheMemory = parsed;
        return parsed;
      } catch (err) {
        console.warn("⚠️ Failed to read pipeline cache:", err);
        return null;
      }
    }

    function writePipelineCache(data) {
      pipelineCacheMemory = data;
      try {
        localStorage.setItem(PIPELINE_CACHE_KEY, JSON.stringify(data));
      } catch (err) {
        console.warn("⚠️ Failed to store pipeline cache:", err);
      }
    }

    function readCustomFieldsCache() {
      if (customFieldsCacheMemory) return customFieldsCacheMemory;
      try {
        const raw = localStorage.getItem(CUSTOM_FIELDS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.customFields)) return null;
        customFieldsCacheMemory = parsed;
        return parsed;
      } catch (err) {
        console.warn("⚠️ Failed to read custom fields cache:", err);
        return null;
      }
    }

    function writeCustomFieldsCache(data) {
      customFieldsCacheMemory = data;
      try {
        localStorage.setItem(CUSTOM_FIELDS_CACHE_KEY, JSON.stringify(data));
      } catch (err) {
        console.warn("⚠️ Failed to store custom fields cache:", err);
      }
    }

    function getPipelineByNameFromCache(name, pipelinesData) {
      const data = pipelinesData || readPipelineCache();
      if (!data || !Array.isArray(data.pipelines)) return null;
      return data.pipelines.find((pipeline) => pipeline.name === name) || null;
    }

    function getPipelineByIdFromCache(pipelineId, pipelinesData) {
      const data = pipelinesData || readPipelineCache();
      if (!data || !Array.isArray(data.pipelines) || !pipelineId) return null;
      return data.pipelines.find((pipeline) => pipeline.id === pipelineId) || null;
    }

    function getStageMetaForOpportunity(opportunity, pipelinesData) {
      const pipeline =
        getPipelineByIdFromCache(opportunity.pipelineId || opportunity.pipeline_id, pipelinesData) ||
        getPipelineByNameFromCache(PIPELINE_NAME, pipelinesData);
      const stageId = opportunity.pipelineStageId || opportunity.stageId || opportunity.stage_id || null;
      const stage = pipeline && Array.isArray(pipeline.stages)
        ? pipeline.stages.find((item) => item.id === stageId)
        : null;

      return {
        pipelineName: pipeline ? pipeline.name : PIPELINE_NAME,
        pipelineId: pipeline ? pipeline.id : opportunity.pipelineId || opportunity.pipeline_id || null,
        stageId,
        stageName: stage ? stage.name : opportunity.pipelineStageName || opportunity.stageName || "Unknown stage",
        stageColor: stage && stage.color ? stage.color : "#64748B",
        stagePosition: stage && typeof stage.position === "number" ? stage.position : null,
      };
    }

    function formatCurrency(amount) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount)) return "—";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(numericAmount);
    }

    function formatDate(value) {
      if (!value) return "N/A";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    function normalizeFieldKey(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    function humanizeFieldKey(value) {
      return String(value || "")
        .replace(/^opportunity\./i, "")
        .replace(/[_\.]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function getOpportunityValueMap(opportunity) {
      const valueMap = new Map();
      const rawFields = Array.isArray(opportunity && opportunity.customFields) ? opportunity.customFields : [];
      rawFields.forEach((field) => {
        if (!field) return;
        const fieldId = field.id ? String(field.id) : "";
        const fieldValue =
          field.fieldValueString ??
          field.fieldValue ??
          field.value ??
          field.textValue ??
          field.dateValue ??
          field.numberValue ??
          "";
        if (fieldId) valueMap.set(fieldId, fieldValue);
      });
      return valueMap;
    }

    function getCustomFieldLabel(definition) {
      if (!definition) return "Field";
      return definition.name || humanizeFieldKey(definition.fieldKey) || definition.id || "Field";
    }

    function getCustomFieldDefinitionsByKey(customFieldsData) {
      const byId = new Map();
      const byFieldKey = new Map();
      const byNormalizedKey = new Map();
      const definitions = Array.isArray(customFieldsData && customFieldsData.customFields) ? customFieldsData.customFields : [];

      definitions.forEach((definition) => {
        if (!definition) return;
        if (definition.id) byId.set(String(definition.id), definition);
        if (definition.fieldKey) {
          byFieldKey.set(String(definition.fieldKey), definition);
          byNormalizedKey.set(normalizeFieldKey(definition.fieldKey), definition);
        }
        if (definition.name) byNormalizedKey.set(normalizeFieldKey(definition.name), definition);
      });

      return { byId, byFieldKey, byNormalizedKey, definitions };
    }

    function getFieldValueFromOpportunity(opportunity, fieldKeys, customFieldsData) {
      const definitions = getCustomFieldDefinitionsByKey(customFieldsData);
      const valueMap = getOpportunityValueMap(opportunity);
      const requestedKeys = Array.isArray(fieldKeys) ? fieldKeys : [fieldKeys];

      for (const rawKey of requestedKeys) {
        const normalizedKey = normalizeFieldKey(rawKey);
        const directDefinition =
          definitions.byFieldKey.get(String(rawKey)) ||
          definitions.byNormalizedKey.get(normalizedKey) ||
          null;

        if (directDefinition && directDefinition.id && valueMap.has(String(directDefinition.id))) {
          const value = valueMap.get(String(directDefinition.id));
          if (value !== undefined && value !== null && value !== "") return value;
        }

        const opportunityFields = Array.isArray(opportunity && opportunity.customFields) ? opportunity.customFields : [];
        const byFieldKeyMatch = opportunityFields.find((field) => normalizeFieldKey(field && (field.fieldKey || field.name)) === normalizedKey);
        if (byFieldKeyMatch) {
          const value =
            byFieldKeyMatch.fieldValueString ??
            byFieldKeyMatch.fieldValue ??
            byFieldKeyMatch.value ??
            byFieldKeyMatch.textValue ??
            byFieldKeyMatch.dateValue ??
            byFieldKeyMatch.numberValue ??
            "";
          if (value !== undefined && value !== null && value !== "") return value;
        }
      }

      return "";
    }

    function getOpportunityStageGroup(opportunity, stageMeta) {
      const stageName = String((stageMeta && stageMeta.stageName) || opportunity.pipelineStageName || opportunity.stageName || "").toLowerCase();
      if (/closed/.test(stageName)) return "closed";
      if (/completed|resolved|done/.test(stageName)) return "completed";
      return "active";
    }

    function openMaintainerDetailsModal(opportunity, stageMeta, customFieldsData) {
      const maintainerName = getFieldValueFromOpportunity(opportunity, ["opportunity.maintainer_name", "maintainer_name"], customFieldsData) || "N/A";
      const maintainerPhone = getFieldValueFromOpportunity(opportunity, ["opportunity.maintainer_phone", "maintainer_phone"], customFieldsData) || "N/A";
      const maintainerEmail = getFieldValueFromOpportunity(opportunity, ["opportunity.maintainer_email", "maintainer_email"], customFieldsData) || "N/A";
      const issueDescription = getFieldValueFromOpportunity(opportunity, ["opportunity.issue_description", "issue_description"], customFieldsData) || "N/A";
      const maintenanceInstructions = getFieldValueFromOpportunity(opportunity, ["opportunity.maintenance_instructions", "maintenance_instructions"], customFieldsData) || "N/A";

      showModal(
        "Maintainer Details",
        (body) => {
          body.style.cssText = "padding: 0; overflow-y: auto; flex: 1; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);";
          body.innerHTML = `
            <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
              <div style="border: 1px solid #dbe3ee; border-radius: 18px; background: #fff; padding: 18px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);">
                <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 12px;">
                  <div>
                    <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; margin-bottom: 6px;">Maintenance Request</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #0f172a;">${escapeHtml(opportunity.name || "Maintenance Request")}</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; margin-bottom: 6px;">Stage</div>
                    <div style="display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 999px; background: #f1f5f9; color: #334155; font-size: 0.75rem; font-weight: 700;">${escapeHtml(stageMeta && stageMeta.stageName ? stageMeta.stageName : "Unknown")}</div>
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
                  ${[
                    ["Maintainer Name", maintainerName],
                    ["Maintainer Phone", maintainerPhone],
                    ["Maintainer Email", maintainerEmail],
                    ["Issue Description", issueDescription],
                  ].map(([label, value]) => `
                    <div style="border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; padding: 14px;">
                      <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; margin-bottom: 6px;">${label}</div>
                      <div style="font-size: 0.95rem; color: #0f172a; font-weight: 600; line-height: 1.5; word-break: break-word;">${escapeHtml(String(value))}</div>
                    </div>
                  `).join("")}
                </div>
              </div>
            </div>
          `;
        },
        "760px"
      );
    }

    function isClosedOpportunity(opportunity, stageMeta) {
      const status = String(opportunity.status || "").toLowerCase();
      const stageName = String((stageMeta && stageMeta.stageName) || opportunity.pipelineStageName || opportunity.stageName || "").toLowerCase();
      return /closed|completed|cancelled|canceled|won|done/.test(status) || /closed|completed|resolved|done/.test(stageName);
    }

    // ----- Modal -----
    function showModal(title, contentGenerator, width = "650px") {
      const oldOverlay = document.querySelector(".custom-modal-overlay");
      if (oldOverlay) oldOverlay.remove();

      const overlay = document.createElement("div");
      overlay.className = "custom-modal-overlay";
      overlay.style.cssText = `
        position: fixed; top:0; left:0; width:100%; height:100%;
        background: rgba(0,0,0,0.6); display: flex; align-items: center;
        justify-content: center; z-index: 1000000; backdrop-filter: blur(2px);
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        background: white; border-radius: 16px; width: ${width};
        max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column;
        box-shadow: 0 25px 40px rgba(0,0,0,0.2); font-family: system-ui, sans-serif;
      `;

      const header = document.createElement("div");
      header.style.cssText = `
        padding: 1rem 1.5rem; border-bottom: 1px solid #e2e8f0;
        display: flex; justify-content: space-between; align-items: center;
        font-weight: 600; font-size: 1.25rem;
      `;
      const titleSpan = document.createElement("span");
      titleSpan.textContent = title;
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.style.cssText =
        "background:none; border:none; font-size:1.8rem; cursor:pointer; line-height:1; padding:0 8px;";
      header.appendChild(titleSpan);
      header.appendChild(closeBtn);

      const body = document.createElement("div");
      body.style.cssText = "padding: 1.5rem; overflow-y: auto; flex: 1;";

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      if (typeof contentGenerator === "function") contentGenerator(body);
      else body.innerHTML = contentGenerator;

      const closeModal = () => overlay.remove();
      closeBtn.addEventListener("click", closeModal);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    // ----- Maintenance form -----
    function openMaintenanceForm() {
      const baseUrl = "https://links.parksidetownhouses.com/widget/form/OJSge0tmzT3CXjjfmSf2";
      const url = `${baseUrl}?contact_id=${encodeURIComponent(contactId)}&locationId=${encodeURIComponent(locationId)}`;
      showModal(
        "Submit Maintenance Request",
        (body) => {
          const iframe = document.createElement("iframe");
          iframe.src = url;
          iframe.style.cssText = "width:100%; height:600px; border:none; border-radius:8px; background: white;";
          iframe.title = "Maintenance Request Form";
          body.appendChild(iframe);
        },
        "750px"
      );
    }

    async function getPipelineIdByName(name) {
      const pipelinesData = await getPipelinesData();
      const pipeline = getPipelineByNameFromCache(name, pipelinesData);
      return pipeline ? pipeline.id : null;
    }

    async function getPipelinesData(forceRefresh = false) {
      if (!forceRefresh) {
        const cached = readPipelineCache();
        if (cached && Array.isArray(cached.pipelines) && cached.pipelines.length) {
          return cached;
        }
      }

      const url = "https://services.leadconnectorhq.com/opportunities/pipelines?locationId=" + encodeURIComponent(locationId);
      const headers = {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        Version: "2021-07-28",
      };

      try {
        const response = await fetch(url, { method: "GET", headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const normalized = {
          savedAt: Date.now(),
          pipelines: Array.isArray(data.pipelines) ? data.pipelines : [],
        };
        writePipelineCache(normalized);
        return normalized;
      } catch (err) {
        console.error("Error fetching pipeline data:", err);
        return readPipelineCache() || { savedAt: Date.now(), pipelines: [] };
      }
    }

    async function getOpportunityCustomFieldsData(forceRefresh = false) {
      if (!forceRefresh) {
        const cached = readCustomFieldsCache();
        if (cached && Array.isArray(cached.customFields) && cached.customFields.length) {
          return cached;
        }
      }

      const url = "https://services.leadconnectorhq.com/locations/" + encodeURIComponent(locationId) + "/customFields?model=opportunity";
      const headers = {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Version: "2021-07-28",
      };

      try {
        const response = await fetch(url, { method: "GET", headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const normalized = {
          savedAt: Date.now(),
          customFields: Array.isArray(data.customFields) ? data.customFields : [],
        };
        writeCustomFieldsCache(normalized);
        return normalized;
      } catch (err) {
        console.error("Error fetching opportunity custom fields:", err);
        return readCustomFieldsCache() || { savedAt: Date.now(), customFields: [] };
      }
    }


    // ----- Opportunities fetch -----
    async function getOpportunities() {
      const pipelinesData = await getPipelinesData();
      const pipeline = getPipelineByNameFromCache(PIPELINE_NAME, pipelinesData);
      const pipelineId = pipeline ? pipeline.id : null;
      if (!pipelineId) {
        console.warn("⚠️ Property Maintenance pipeline not found in cache");
        return [];
      }

      const url = "https://services.leadconnectorhq.com/opportunities/search";
      const headers = {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        Version: "2021-07-28",
      };
      const body = {
        locationId: locationId,
        filters: [
          { field: "contact_id", operator: "eq", value: contactId },
          { field: "pipeline_id", operator: "eq", value: [pipelineId] },
        ],
        query: "",
        sort: [{ field: "date_added", direction: "desc" }],
        limit: 100,
        additionalDetails: {
          notes: false,
          tasks: false,
          calendarEvents: false,
          unReadConversations: false,
        },
        includeTopRelations: true,
      };
      try {
        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];

        return opportunities.map((opportunity) => ({
          ...opportunity,
          __pipelineMeta: getStageMetaForOpportunity(opportunity, pipelinesData),
        }));
      } catch (err) {
        console.error("Error fetching opportunities:", err);
        return [];
      }
    }

    // ----- Transactions fetch -----
    async function getTransactions() {
      const url = `https://services.leadconnectorhq.com/payments/transactions?altId=${locationId}&altType=location&contactId=${contactId}`;
      const headers = {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Version: "2021-07-28",
      };
      try {
        const response = await fetch(url, { method: "GET", headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.data || [];
      } catch (err) {
        console.error("Error fetching transactions:", err);
        return [];
      }
    }

    function escapeHtml(str) {
      if (!str) return "";
      return str.replace(/[&<>]/g, function (m) {
        if (m === "&") return "&amp;";
        if (m === "<") return "&lt;";
        if (m === ">") return "&gt;";
        return m;
      });
    }

    // ----- Opportunities modal -----
    async function openOpportunitiesModal() {
      showModal(
        "Maintenance Requests",
        async (body) => {
          body.style.cssText = "padding: 0; overflow-y: auto; flex: 1; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);";
          body.innerHTML = '<div style="text-align:center; padding:2.5rem; color:#475569;">Loading maintenance requests...</div>';
          const [opportunities, customFieldsData] = await Promise.all([
            getOpportunities(),
            getOpportunityCustomFieldsData(),
          ]);
          if (!opportunities.length) {
            body.innerHTML = `
              <div style="text-align:center; padding:3rem 1rem; color:#475569;">
                <div style="font-size:1.1rem; font-weight:700; color:#0f172a; margin-bottom:0.4rem;">No maintenance requests found</div>
                <div style="font-size:0.92rem;">Requests will appear here once they are submitted.</div>
              </div>
            `;
            return;
          }

          const groupedOpportunities = {
            active: [],
            completed: [],
            closed: [],
          };

          opportunities.forEach((opportunity) => {
            const stageMeta = opportunity.__pipelineMeta || {};
            const group = getOpportunityStageGroup(opportunity, stageMeta);
            groupedOpportunities[group].push(opportunity);
          });

          Object.keys(groupedOpportunities).forEach((groupKey) => {
            groupedOpportunities[groupKey].sort((left, right) => {
              const leftDate = left.updatedAt ? new Date(left.updatedAt).getTime() : left.createdAt ? new Date(left.createdAt).getTime() : 0;
              const rightDate = right.updatedAt ? new Date(right.updatedAt).getTime() : right.createdAt ? new Date(right.createdAt).getTime() : 0;
              return rightDate - leftDate;
            });
          });

          const activeCount = groupedOpportunities.active.length;
          const completedCount = groupedOpportunities.completed.length;
          const closedCount = groupedOpportunities.closed.length;

          const sortedOpportunities = [...opportunities].sort((left, right) => {
            const leftClosed = isClosedOpportunity(left, left.__pipelineMeta);
            const rightClosed = isClosedOpportunity(right, right.__pipelineMeta);
            if (leftClosed !== rightClosed) return leftClosed ? 1 : -1;

            const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
            const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
            return rightDate - leftDate;
          });

          const tabDefinitions = [
            { key: "active", label: "Active Requests", count: activeCount },
            { key: "completed", label: "Completed", count: completedCount },
            { key: "closed", label: "Closed", count: closedCount },
          ];

          const container = document.createElement("div");
          container.style.cssText = "padding: 20px; display: flex; flex-direction: column; gap: 16px;";

          const summary = document.createElement("div");
          summary.style.cssText = "display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px;";
          summary.innerHTML = `
            <div style="border:1px solid #dbe3ee; border-radius:16px; padding:14px 16px; background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);">
              <div style="font-size:0.74rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700;">Active</div>
              <div style="font-size:1.7rem; font-weight:800; color:#0f172a; line-height:1.1; margin-top:4px;">${activeCount}</div>
            </div>
            <div style="border:1px solid #dbe3ee; border-radius:16px; padding:14px 16px; background:linear-gradient(180deg,#fbfbfd 0%,#f4f6fa 100%);">
              <div style="font-size:0.74rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700;">Completed</div>
              <div style="font-size:1.7rem; font-weight:800; color:#0f172a; line-height:1.1; margin-top:4px;">${completedCount}</div>
            </div>
            <div style="border:1px solid #dbe3ee; border-radius:16px; padding:14px 16px; background:linear-gradient(180deg,#fffafa 0%,#fef3f2 100%);">
              <div style="font-size:0.74rem; text-transform:uppercase; letter-spacing:0.08em; color:#b42318; font-weight:700;">Closed</div>
              <div style="font-size:1.7rem; font-weight:800; color:#0f172a; line-height:1.1; margin-top:4px;">${closedCount}</div>
            </div>
          `;
          container.appendChild(summary);

          const tabBar = document.createElement("div");
          tabBar.style.cssText = "display:flex; gap:10px; flex-wrap:wrap;";
          const listContainer = document.createElement("div");

          function getTabButtonStyle(isSelected, tone) {
            const selectedTone = tone === "closed" ? ["#fff1f0", "#b42318", "#fda29b"] : tone === "completed" ? ["#ecfeff", "#0e7490", "#99f6e4"] : ["#ecfdf3", "#067647", "#abefc6"];
            const background = isSelected ? selectedTone[0] : "#fff";
            const color = isSelected ? selectedTone[1] : "#334155";
            const borderColor = isSelected ? selectedTone[2] : "#dbe3ee";
            return `border:1px solid ${borderColor}; background:${background}; color:${color};`;
          }

          function renderCards(tabKey) {
            listContainer.innerHTML = "";
            const items = groupedOpportunities[tabKey] || [];

            if (!items.length) {
              listContainer.innerHTML = `
                <div style="border:1px dashed #cbd5e1; border-radius:18px; padding:24px; text-align:center; color:#64748b; background:#fff;">
                  No ${escapeHtml(tabKey)} maintenance requests.
                </div>
              `;
              return;
            }

            const cardsWrapper = document.createElement("div");
            cardsWrapper.style.cssText = "display:flex; flex-direction:column; gap:14px;";

            items.forEach((opp) => {
              const stageMeta = opp.__pipelineMeta || {};
              const amount = formatCurrency(opp.monetaryValue);
              const createdDate = formatDate(opp.createdAt);
              const updatedDate = formatDate(opp.updatedAt);
              const stageBadge = stageMeta.stageName || "Unknown stage";
              const stageColor = stageMeta.stageColor || "#64748B";
              const stageGroup = getOpportunityStageGroup(opp, stageMeta);
              const maintainerName = getFieldValueFromOpportunity(opp, ["opportunity.maintainer_name", "maintainer_name"], customFieldsData) || "N/A";
              const maintainerPhone = getFieldValueFromOpportunity(opp, ["opportunity.maintainer_phone", "maintainer_phone"], customFieldsData) || "N/A";
              const maintainerEmail = getFieldValueFromOpportunity(opp, ["opportunity.maintainer_email", "maintainer_email"], customFieldsData) || "N/A";
              const issueDescription = getFieldValueFromOpportunity(opp, ["opportunity.issue_description", "issue_description"], customFieldsData) || "N/A";
              const statusTone = stageGroup === "closed" ? "closed" : stageGroup === "completed" ? "completed" : "active";

              const card = document.createElement("div");
              card.style.cssText = "border:1px solid #dbe3ee; border-radius:20px; background:#fff; box-shadow:0 10px 30px rgba(15, 23, 42, 0.05); overflow:hidden;";
              card.innerHTML = `
                <div style="height:5px; background:${stageColor};"></div>
                <div style="padding:18px; display:flex; flex-direction:column; gap:14px;">
                  <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
                    <div style="min-width:0; flex:1;">
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                        <span style="display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; background:${statusTone === "closed" ? "#fff1f0" : statusTone === "completed" ? "#ecfeff" : "#ecfdf3"}; color:${statusTone === "closed" ? "#b42318" : statusTone === "completed" ? "#0e7490" : "#067647"}; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">${escapeHtml(stageBadge)}</span>
                        <span style="display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; background:#f1f5f9; color:#334155; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">${escapeHtml(stageGroup === "active" ? "Active Request" : stageGroup === "completed" ? "Completed" : "Closed")}</span>
                      </div>
                      <div style="font-size:1.08rem; font-weight:800; color:#0f172a; line-height:1.35; margin-bottom:8px;">${escapeHtml(opp.name || "Maintenance Request")}</div>
                      <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; color:#64748b; font-size:0.86rem;">
                        <div><strong style="color:#334155; font-weight:700;">Request Opened:</strong> ${createdDate}</div>
                        <div><strong style="color:#334155; font-weight:700;">Last Updated:</strong> ${updatedDate}</div>
                        <div hidden><strong style="color:#334155; font-weight:700;">Source:</strong> ${escapeHtml(opp.source || "Maintenance Form")}</div>
                        <div hidden><strong style="color:#334155; font-weight:700;">Pipeline:</strong> ${escapeHtml(stageMeta.pipelineName || PIPELINE_NAME)}</div>
                      </div>
                    </div>
                    <div style="text-align:right; min-width:120px;" hidden>
                      <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700; margin-bottom:4px;">Amount</div>
                      <div style="font-size:1.25rem; font-weight:800; color:#0f172a;">${amount}</div>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px;">
                    ${[
                      ["Maintainer", maintainerName],
                      ["Phone", maintainerPhone],
                      ["Email", maintainerEmail],
                    ].map(([label, value]) => `
                      <div style="border:1px solid #e2e8f0; border-radius:14px; background:#f8fafc; padding:12px;">
                        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700; margin-bottom:5px;">${label}</div>
                        <div style="font-size:0.92rem; color:#0f172a; font-weight:600; line-height:1.45; word-break:break-word;">${escapeHtml(String(value))}</div>
                      </div>
                    `).join("")}
                  </div>

                  <div style="border:1px solid #e2e8f0; border-radius:16px; background:#f8fafc; padding:14px;">
                    <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700; margin-bottom:6px;">Issue Description</div>
                    <div style="font-size:0.95rem; color:#334155; line-height:1.7; white-space:pre-wrap;">${escapeHtml(String(issueDescription))}</div>
                  </div>

                  <div style="display:flex; justify-content:flex-end;">
                    <button type="button" class="maintainer-details-btn" style="border:1px solid #0f172a; background:#0f172a; color:#fff; padding:10px 14px; border-radius:12px; font-size:0.9rem; font-weight:700; cursor:pointer;">
                      Maintainer Details
                    </button>
                  </div>
                </div>
              `;

              const detailsButton = card.querySelector(".maintainer-details-btn");
              detailsButton.addEventListener("click", () => openMaintainerDetailsModal(opp, stageMeta, customFieldsData));
              cardsWrapper.appendChild(card);
            });

            listContainer.appendChild(cardsWrapper);
          }

          tabDefinitions.forEach((tab) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `${tab.label} (${tab.count})`;
            button.style.cssText = `
              border-radius: 999px;
              padding: 10px 14px;
              font-size: 0.86rem;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.15s ease;
              ${getTabButtonStyle(tab.key === "active", tab.key)}
            `;
            button.addEventListener("click", () => {
              tabBar.querySelectorAll("button").forEach((otherButton) => {
                const isSelected = otherButton === button;
                const key = otherButton.getAttribute("data-tab-key") || "active";
                otherButton.style.cssText = `
                  border-radius: 999px;
                  padding: 10px 14px;
                  font-size: 0.86rem;
                  font-weight: 700;
                  cursor: pointer;
                  transition: all 0.15s ease;
                  ${getTabButtonStyle(isSelected, key)}
                `;
              });
              renderCards(tab.key);
            });
            button.setAttribute("data-tab-key", tab.key);
            tabBar.appendChild(button);
          });

          const header = document.createElement("div");
          header.style.cssText = "display:flex; flex-direction:column; gap:10px;";
          header.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
              <div>
                <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700; margin-bottom:6px;">Property Maintenance</div>
                <div style="font-size:1.25rem; font-weight:800; color:#0f172a;">Maintenance Requests</div>
              </div>
              <div style="text-align:right; color:#64748b; font-size:0.9rem; line-height:1.5;">
                <div><strong style="color:#0f172a;">Active:</strong> ${activeCount}</div>
                <div><strong style="color:#0f172a;">Completed:</strong> ${completedCount}</div>
                <div><strong style="color:#0f172a;">Closed:</strong> ${closedCount}</div>
              </div>
            </div>
          `;

          body.innerHTML = "";
          body.appendChild(container);
          container.insertBefore(header, container.firstChild);
          container.insertBefore(tabBar, header.nextSibling);
          container.appendChild(listContainer);

          tabBar.querySelector('button[data-tab-key="active"]').style.cssText = `
            border-radius: 999px;
            padding: 10px 14px;
            font-size: 0.86rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            ${getTabButtonStyle(true, "active")}
          `;
          renderCards("active");
        },
        "920px"
      );
    }

    // ----- Transactions modal -----
    async function openTransactionsModal() {
      showModal(
        "Transactions",
        async (body) => {
          body.innerHTML = '<div style="text-align:center; padding:2.5rem; color:#475569;">Loading transactions...</div>';
          const transactions = await getTransactions();
          if (!transactions.length) {
            body.innerHTML = `
              <div style="text-align:center; padding:2.5rem 1rem; color:#475569;">
                <div style="font-size:1.05rem; font-weight:600; color:#0f172a; margin-bottom:0.35rem;">No transactions found</div>
                <div style="font-size:0.9rem;">Payments and refunds will appear here when available.</div>
              </div>
            `;
            return;
          }

          const totalAmount = transactions.reduce((sum, transaction) => {
            const numericAmount = Number(transaction.amount);
            return Number.isFinite(numericAmount) ? sum + numericAmount : sum;
          }, 0);

          const container = document.createElement("div");
          container.style.cssText = "display:flex; flex-direction:column; gap:14px;";

          const header = document.createElement("div");
          header.style.cssText = `
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:12px;
          `;
          header.innerHTML = `
            <div style="border:1px solid #dbe3ee; border-radius:16px; padding:14px 16px; background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);">
              <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700;">Transactions</div>
              <div style="font-size:1.7rem; font-weight:800; color:#0f172a; line-height:1.1; margin-top:4px;">${transactions.length}</div>
            </div>
            <div style="border:1px solid #dbe3ee; border-radius:16px; padding:14px 16px; background:linear-gradient(180deg,#fbfbfd 0%,#f4f6fa 100%);">
              <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; font-weight:700;">Total Amount</div>
              <div style="font-size:1.7rem; font-weight:800; color:#0f172a; line-height:1.1; margin-top:4px;">${formatCurrency(totalAmount)}</div>
            </div>
          `;
          container.appendChild(header);

          const table = document.createElement("table");
          table.style.cssText = "width:100%; border-collapse: separate; border-spacing:0; overflow:hidden; border:1px solid #dbe3ee; border-radius:18px; background:#fff; box-shadow:0 10px 30px rgba(15, 23, 42, 0.05);";

          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");
          headerRow.style.cssText = "background:linear-gradient(180deg,#0f172a 0%,#111827 100%); color:#fff;";
          ["Date", "Description", "Status", "Amount"].forEach((h) => {
            const th = document.createElement("th");
            th.style.cssText = "padding:14px 16px; text-align:left; font-size:0.75rem; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:inherit;";
            th.textContent = h;
            if (h === "Amount") th.style.textAlign = "right";
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);

          const tbody = document.createElement("tbody");
          transactions.forEach((tx) => {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid #e2e8f0";
            row.style.transition = "background 0.15s ease";
            row.addEventListener("mouseenter", () => {
              row.style.background = "#f8fafc";
            });
            row.addEventListener("mouseleave", () => {
              row.style.background = "#fff";
            });

            const dateCell = document.createElement("td");
            dateCell.style.padding = "14px 16px";
            dateCell.style.color = "#0f172a";
            dateCell.textContent = formatDate(tx.createdAt);
            row.appendChild(dateCell);

            const descCell = document.createElement("td");
            descCell.style.padding = "14px 16px";
            descCell.style.color = "#0f172a";
            descCell.style.fontWeight = "600";
            descCell.textContent = tx.entitySourceName || tx.entityType || "Transaction";
            row.appendChild(descCell);

            const statusCell = document.createElement("td");
            statusCell.style.padding = "14px 16px";
            const status = String(tx.status || "unknown").toLowerCase();
            const isSuccess = status === "succeeded" || status === "success" || status === "paid";
            const isFailure = status === "failed" || status === "failure" || status === "declined";
            const badge = document.createElement("span");
            badge.style.cssText = `
              display:inline-flex;
              align-items:center;
              padding:4px 10px;
              border-radius:999px;
              font-size:0.72rem;
              font-weight:700;
              text-transform:uppercase;
              letter-spacing:0.06em;
              background:${isSuccess ? "#ecfdf3" : isFailure ? "#fff1f0" : "#f1f5f9"};
              color:${isSuccess ? "#067647" : isFailure ? "#b42318" : "#334155"};
            `;
            badge.textContent = isSuccess ? "Succeeded" : isFailure ? "Failed" : tx.status || "Unknown";
            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            const amountCell = document.createElement("td");
            amountCell.style.padding = "14px 16px";
            amountCell.style.textAlign = "right";
            amountCell.style.fontWeight = "800";
            amountCell.style.color = isFailure ? "#b42318" : "#0f172a";
            amountCell.textContent = formatCurrency(tx.amount);
            row.appendChild(amountCell);

            tbody.appendChild(row);
          });
          table.appendChild(tbody);

          body.innerHTML = "";
          container.appendChild(table);
          body.appendChild(container);
        },
        "750px"
      );
    }

    // ----- Helper: wait for element -----
    function waitForElement(selector, timeout = 5000) {
      return new Promise((resolve) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const observer = new MutationObserver(() => {
          const found = document.querySelector(selector);
          if (found) {
            observer.disconnect();
            resolve(found);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeout);
      });
    }

    // ----- Desktop icons (SVG) -----
    const desktopWrenchIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5 text-clientportal-font-primary"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21 21 17.25l-5.83-5.83M11.42 15.17l-4.88 4.88a2.25 2.25 0 01-3.18-3.18l4.88-4.88M11.42 15.17l3.15-3.15M5.25 5.25L9 9M9 9l3.75-3.75M9 9l-3.75 3.75M18.75 5.25L15 9M15 9l3.75 3.75M15 9l-3.75-3.75"/></svg>`;
    const desktopListIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5 text-clientportal-font-primary"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>`;
    const desktopTxIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5 text-clientportal-font-primary"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75L5.25 21 2.25 23.25M21.75 18.75L18.75 21 21.75 23.25M12 3.75v16.5M8.25 9.75L12 6l3.75 3.75M8.25 14.25L12 18l3.75-3.75"/></svg>`;

    // ----- Mobile icon URLs -----
    const mobileIconUrls = [
      "https://img.icons8.com/windows/32/request-service.png",
      "https://img.icons8.com/windows/32/ingredients-list.png",
      "https://img.icons8.com/material-outlined/24/ledger.png",
    ];
    const mobileLabels = ["Request Service", "List", "Maintenance List"];
    const mobileHandlers = [openMaintenanceForm, openOpportunitiesModal, openTransactionsModal];

    // ----- Breakpoint -----
    const MOBILE_BREAKPOINT = 768;

    // ----- Mobile injection (with new_mobile_icons class and margin-right) -----
    async function injectMobile() {
      console.log("📱 Injecting mobile top bar icons...");
      const notifBtn = await waitForElement("#btn-notification");
      if (!notifBtn) {
        console.warn("⚠️ Mobile notification button not found");
        return;
      }
      const rightContainer = notifBtn.closest(".flex.items-center");
      if (!rightContainer) {
        console.warn("⚠️ Mobile right container not found");
        return;
      }

      // Add class and margin to the parent of all icons (existing + new)
      rightContainer.classList.add("new_mobile_icons");
      rightContainer.style.marginRight = "80px";

      // Remove any previously injected mobile buttons
      rightContainer.querySelectorAll(".custom-mobile-btn").forEach(el => el.remove());

      // Helper to create an icon button from an image URL
      function createMobileIconButton(iconUrl, label, clickHandler) {
        const btn = document.createElement("button");
        btn.className = "n-button n-button--default-type n-button--medium-type quaternary icon-only custom-mobile-btn";
        btn.setAttribute("aria-label", label);
        btn.style.cssText = `
          --n-bezier: cubic-bezier(.4,0,.2,1);
          --n-ripple-duration:.6s;
          --n-opacity-disabled:0.5;
          --n-wave-opacity:0.6;
          font-weight:400;
          --n-color:#0000;
          --n-color-hover:rgba(46,51,56,.09);
          --n-color-pressed:rgba(46,51,56,.13);
          --n-color-focus:rgba(46,51,56,.09);
          --n-color-disabled:#0000;
          --n-ripple-color:#0000;
          --n-text-color:rgba(52,64,84,1);
          --n-text-color-hover:rgba(52,64,84,1);
          --n-text-color-pressed:rgba(52,64,84,1);
          --n-text-color-focus:rgba(52,64,84,1);
          --n-text-color-disabled:rgba(52,64,84,1);
          --n-border:1px solid rgb(224,224,230);
          --n-border-hover:1px solid #004EEB;
          --n-border-pressed:1px solid #155EEF;
          --n-border-focus:1px solid #004EEB;
          --n-border-disabled:1px solid rgb(224,224,230);
          --n-width:34px;
          --n-height:34px;
          --n-font-size:14px;
          --n-padding:initial;
          --n-icon-size:18px;
          --n-icon-margin:6px;
          --n-border-radius:34px;
          margin-right: 0;
        `;
        const img = document.createElement("img");
        img.src = iconUrl;
        img.alt = label;
        img.style.width = "20px";
        img.style.height = "20px";
        const span = document.createElement("span");
        span.className = "n-button__content";
        span.appendChild(img);
        btn.appendChild(span);
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          clickHandler();
        });
        return btn;
      }

      // Insert icons in reverse order so they appear left-to-right as: Request Service, List, Maintenance List
      for (let i = mobileIconUrls.length - 1; i >= 0; i--) {
        const btn = createMobileIconButton(mobileIconUrls[i], mobileLabels[i], mobileHandlers[i]);
        rightContainer.insertBefore(btn, rightContainer.firstChild);
      }

      console.log("✅ Mobile icons injected with new_mobile_icons wrapper and margin-right 50px");
    }

    // ----- Desktop injection -----
    async function injectDesktop() {
      console.log("🖥️ Injecting desktop sidebar menu items...");
      const avatarSection = await waitForElement(
        ".flex.flex-col.items-center.justify-center.border-0.border-b"
      );
      if (!avatarSection) {
        console.warn("⚠️ Desktop avatar section not found");
        return;
      }
      const menuContainer = avatarSection.nextElementSibling;
      if (!menuContainer) {
        console.warn("⚠️ Desktop menu container not found");
        return;
      }

      menuContainer.querySelectorAll(".custom-desktop-item").forEach(el => el.remove());

      function createMenuItem(iconSvg, label, clickHandler) {
        const div = document.createElement("div");
        div.className =
          "grid grid-cols-6 items-center border-0 border-b border-solid border-clientportal-fill cursor-pointer px-6 py-4 hover:bg-clientportal-fill custom-desktop-item";
        div.style.cursor = "pointer";

        const iconCol = document.createElement("div");
        iconCol.className = "col-span-1 mt-2";
        iconCol.innerHTML = iconSvg;

        const labelCol = document.createElement("div");
        labelCol.className = "col-span-4 text-clientportal-font-primary hl-text-md-medium";
        labelCol.innerText = label;

        const btnCol = document.createElement("div");
        btnCol.className = "col-span-1 flex justify-end";
        const btn = document.createElement("button");
        btn.className = "n-button n-button--default-type n-button--medium-type quaternary icon-only";
        btn.setAttribute("aria-label", label);
        btn.style.cssText = `--n-bezier: cubic-bezier(.4,0,.2,1); --n-ripple-duration:.6s; --n-opacity-disabled:0.5; --n-wave-opacity:0.6; font-weight:400; --n-color:#0000; --n-color-hover:rgba(46,51,56,.09); --n-color-pressed:rgba(46,51,56,.13); --n-color-focus:rgba(46,51,56,.09); --n-color-disabled:#0000; --n-ripple-color:#0000; --n-text-color:rgba(52,64,84,1); --n-text-color-hover:rgba(52,64,84,1); --n-text-color-pressed:rgba(52,64,84,1); --n-text-color-focus:rgba(52,64,84,1); --n-text-color-disabled:rgba(52,64,84,1); --n-border:1px solid rgb(224,224,230); --n-border-hover:1px solid #004EEB; --n-border-pressed:1px solid #155EEF; --n-border-focus:1px solid #004EEB; --n-border-disabled:1px solid rgb(224,224,230); --n-width:34px; --n-height:34px; --n-font-size:14px; --n-padding:initial; --n-icon-size:18px; --n-icon-margin:6px; --n-border-radius:34px;`;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5 text-clientportal-primary"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16l4-4m0 0l-4-4m4 4H8m14 0c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"></path></svg>`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          clickHandler();
        });
        btnCol.appendChild(btn);

        div.appendChild(iconCol);
        div.appendChild(labelCol);
        div.appendChild(btnCol);
        div.addEventListener("click", (e) => {
          if (!e.target.closest("button")) clickHandler();
        });
        return div;
      }

      const desktopItems = [
        { icon: desktopWrenchIcon, label: "Submit Maintenance Request", handler: openMaintenanceForm },
        { icon: desktopListIcon, label: "Maintenance Requests", handler: openOpportunitiesModal },
        { icon: desktopTxIcon, label: "Transactions", handler: openTransactionsModal },
      ];

      let insertAfter = null;
      const existingItems = menuContainer.querySelectorAll(":scope > .grid");
      if (existingItems.length) insertAfter = existingItems[existingItems.length - 1];

      desktopItems.forEach(item => {
        const el = createMenuItem(item.icon, item.label, item.handler);
        if (insertAfter) {
          insertAfter.insertAdjacentElement("afterend", el);
          insertAfter = el;
        } else {
          menuContainer.appendChild(el);
          insertAfter = el;
        }
      });

      console.log("✅ Desktop menu items injected");
    }

    // ----- Viewport decision & reactivity -----
    let currentViewportIsMobile = null;
    async function injectForViewport() {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      if (mobile === currentViewportIsMobile) return;
      currentViewportIsMobile = mobile;
      if (mobile) {
        await injectMobile();
      } else {
        await injectDesktop();
      }
    }

    let resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(injectForViewport, 200);
    }
    window.addEventListener("resize", onResize);

    // Initial injection
    await injectForViewport();
    console.log("✅ Custom menu adaptive script ready. Contact ID:", contactId);
  })();
})();
