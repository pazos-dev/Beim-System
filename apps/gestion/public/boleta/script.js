const TERMS_STORAGE_KEY = "beim_boleta_garantia_v2";
const SERVICES_STORAGE_KEY = "beim_boleta_servicios_v1";
const MODELS_STORAGE_KEY = "beim_boleta_modelos_v1";
const BRANDS_STORAGE_KEY = "beim_boleta_marcas_v1";
const DELETED_BRANDS_STORAGE_KEY = "beim_boleta_marcas_borradas_v1";
const DELETED_MODELS_STORAGE_KEY = "beim_boleta_modelos_borrados_v1";
const DELETED_SERVICES_STORAGE_KEY = "beim_boleta_servicios_borrados_v1";
const VISUAL_STORAGE_KEY = "beim_boleta_inspeccion_visual_v1";
const RECEIPTS_STORAGE_KEY = "beim_boleta_indice_boletas_v1";
const MANAGEMENT_STORAGE_KEY = "sistema-gestion-data-v1";
const BOLETA_API_BASE = `${window.location.origin}/api/beim/receipts`;
const BOLETA_PARAMS = new URLSearchParams(window.location.search);
const BOLETA_ACTOR_ID = BOLETA_PARAMS.get("userId") || "";
const BOLETA_INITIAL_QUERY = BOLETA_PARAMS.get("q") || "";
const BOLETA_INITIAL_NEXT_NUMBER = BOLETA_PARAMS.get("nextNumber") || "";

// --- Adaptacion para Beim gestion (D8: copia vendered embebida) ---
// La boleta original guardaba contra /api/beim/receipts o en localStorage.
// Esta copia, cuando corre dentro del iframe de /app/ordenes/nueva, crea la
// orden en la API de gestion con idempotencia por intento y notifica al padre.
const GESTION_ORDENES_API = `${window.location.origin}/api/gestion/ordenes`;
const GESTION_BOOTSTRAP_API = `${window.location.origin}/api/gestion/bootstrap`;
const IS_EMBEDDED_IN_GESTION = window.self !== window.top;
const GESTION_CLIENT_SELECT_ID = "gestion-client-select";
let gestionIdempotencyKey = null;

const DEFAULT_BRANDS = [
  "Samsung",
  "Apple",
  "Xiaomi",
  "Motorola",
  "Huawei",
  "Honor",
  "Oppo",
  "Realme",
  "Vivo",
  "Nokia",
  "LG",
  "Sony",
  "Tecno",
  "Infinix",
  "ZTE",
  "OnePlus",
];

const DEFAULT_MODELS = [
  ["Samsung", "A01"], ["Samsung", "A02"], ["Samsung", "A03"], ["Samsung", "A04"], ["Samsung", "A05"],
  ["Samsung", "A10"], ["Samsung", "A11"], ["Samsung", "A12"], ["Samsung", "A13"], ["Samsung", "A14"], ["Samsung", "A15"],
  ["Samsung", "A20"], ["Samsung", "A21s"], ["Samsung", "A22"], ["Samsung", "A23"], ["Samsung", "A24"],
  ["Samsung", "A30"], ["Samsung", "A31"], ["Samsung", "A32"], ["Samsung", "A33"], ["Samsung", "A34"],
  ["Samsung", "A50"], ["Samsung", "A51"], ["Samsung", "A52"], ["Samsung", "A53"], ["Samsung", "A54"],
  ["Samsung", "S20"], ["Samsung", "S21"], ["Samsung", "S22"], ["Samsung", "S23"], ["Samsung", "S24"],
  ["Apple", "iPhone 6"], ["Apple", "iPhone 6s"], ["Apple", "iPhone 7"], ["Apple", "iPhone 8"], ["Apple", "iPhone X"],
  ["Apple", "iPhone XR"], ["Apple", "iPhone XS"], ["Apple", "iPhone 11"], ["Apple", "iPhone 12"], ["Apple", "iPhone 13"],
  ["Apple", "iPhone 14"], ["Apple", "iPhone 15"], ["Apple", "iPhone 16"], ["Apple", "iPad"],
  ["Xiaomi", "Redmi 9"], ["Xiaomi", "Redmi 9A"], ["Xiaomi", "Redmi 10"], ["Xiaomi", "Redmi 10C"], ["Xiaomi", "Redmi 12"],
  ["Xiaomi", "Redmi 13C"], ["Xiaomi", "Redmi Note 8"], ["Xiaomi", "Redmi Note 9"], ["Xiaomi", "Redmi Note 10"],
  ["Xiaomi", "Redmi Note 11"], ["Xiaomi", "Redmi Note 12"], ["Xiaomi", "Redmi Note 13"], ["Xiaomi", "Poco X3"],
  ["Xiaomi", "Poco X4"], ["Xiaomi", "Poco X5"],
  ["Motorola", "Moto E6"], ["Motorola", "Moto E7"], ["Motorola", "Moto E13"], ["Motorola", "Moto E20"],
  ["Motorola", "Moto E22"], ["Motorola", "Moto G8"], ["Motorola", "Moto G9"], ["Motorola", "Moto G10"],
  ["Motorola", "Moto G20"], ["Motorola", "Moto G22"], ["Motorola", "Moto G30"], ["Motorola", "Moto G32"],
  ["Motorola", "Moto G50"], ["Motorola", "Moto G60"], ["Motorola", "Moto G71"],
  ["Huawei", "P20"], ["Huawei", "P30"], ["Huawei", "P40"], ["Huawei", "Y5"], ["Huawei", "Y6"], ["Huawei", "Y7"], ["Huawei", "Y9"],
  ["Honor", "X7"], ["Honor", "X8"], ["Honor", "X9"],
  ["Oppo", "A15"], ["Oppo", "A16"], ["Oppo", "A54"],
  ["Realme", "C11"], ["Realme", "C21"], ["Realme", "C35"],
  ["Vivo", "Y11"], ["Vivo", "Y20"], ["Vivo", "Y21"],
  ["Tecno", "Spark 8"], ["Tecno", "Spark 10"],
  ["Infinix", "Hot 10"], ["Infinix", "Hot 11"],
  ["Nokia", "C20"], ["LG", "K10"], ["LG", "K40"], ["Sony", "Xperia"], ["ZTE", "Blade A5"], ["OnePlus", "Nord"],
];

const DEFAULT_TERMS = `El equipo ingresa para diagnóstico o reparación según la falla reportada por el cliente.
La garantía cubre únicamente el trabajo realizado y las piezas instaladas por BEIM.
La garantía no cubre golpes, humedad, manipulación de terceros, uso indebido, nuevas fallas o daños no relacionados con la reparación.
El cliente declara haber revisado la inspección visual indicada en esta boleta.
Todo equipo debe retirarse con esta boleta o documento de identidad del titular.
Pasados 180 días desde la notificación de entrega, presupuesto o imposibilidad de reparación, si el cliente no retira el equipo ni responde a los avisos de contacto, el equipo será considerado abandonado. BEIM podrá disponer del equipo para cubrir gastos de diagnóstico, reparación, almacenamiento, administración o reciclaje, sin derecho a reclamo posterior.`;

const DEFAULT_SERVICES = [
  "Cambio de pantalla",
  "Cambio de pin de carga",
  "Cambio de cámara",
  "Cambio de tapa",
  "Reparación en placa",
  "Cambio de lens de cámara",
  "Cambio de parlante",
  "Cambio de micrófono",
  "Cambio de auricular",
  "Cambio de batería",
  "Diagnóstico",
  "Mantenimiento",
];

const DEFAULT_VISUAL_OPTIONS = [
  "Pantalla partida o dañada",
  "Equipo no enciende",
  "Equipo no carga",
  "Marco doblado",
  "Tapa partida",
  "Lens de cámara partido",
  "Lens de cámara rayado",
  "Pin de carga sucio",
  "Batería inflada",
  "Pantalla despegada",
  "Cámara frontal expuesta",
  "Cámara trasera expuesta",
  "Micrófono no funciona",
  "Auricular no funciona",
  "Parlante no funciona",
  "Cámara frontal no funciona",
  "Cámara trasera no funciona",
  "Sin señal",
  "Sin bandeja SIM",
  "Sin tapa",
  "Sin pantalla",
];

const form = document.querySelector("#ticket-form");
const printBtn = document.querySelector("#print-btn");
const saveBtn = document.querySelector("#save-btn");
const clearBtn = document.querySelector("#clear-btn");
const editTermsBtn = document.querySelector("#edit-terms-btn");
const addModelBtn = document.querySelector("#add-model-btn");
const addServiceBtn = document.querySelector("#add-service-btn");
const addVisualBtn = document.querySelector("#add-visual-btn");
const searchBox = document.querySelector("#search-box");
const searchBtn = document.querySelector("#search-btn");
const receiptResults = document.querySelector("#receipt-results");
const drawPatternBtn = document.querySelector("#draw-pattern-btn");
const brandOptions = document.querySelector("#brand-options");
const modelOptions = document.querySelector("#model-options");
const modelPicker = document.querySelector("#model-picker");
const serviceChecks = document.querySelector("#service-checks");
const serviceSummary = document.querySelector("#service-summary");
const priceSuggestion = document.querySelector("#price-suggestion");
const serviceSearch = document.querySelector("#service-search");
const selectedServicesPanel = document.querySelector("#selected-services");
const serviceEmpty = document.querySelector("#service-empty");
const serviceSelectionCount = document.querySelector("#service-selection-count");
const servicePickerDone = document.querySelector("#service-picker-done");
const serviceDropdown = document.querySelector(".service-dropdown");
const receiptServiceLines = document.querySelector("#receipt-service-lines");
const servicePriceEditor = document.querySelector("#service-price-editor");
const servicePriceOverrides = new Map();
const visualChecks = document.querySelector("#visual-checks");
const visualPreview = document.querySelector("#visual-preview");
const patternDialog = document.querySelector("#pattern-dialog");
const patternPad = document.querySelector("#pattern-pad");
const patternSequence = document.querySelector("#pattern-sequence");
const clearPatternBtn = document.querySelector("#clear-pattern-btn");
const savePatternBtn = document.querySelector("#save-pattern-btn");
const patternPreview = document.querySelector("#pattern-preview");
const termsDialog = document.querySelector("#terms-dialog");
const termsEditor = document.querySelector("#terms-editor");
const termsPreview = document.querySelector("#terms-preview");
const saveTermsBtn = document.querySelector("#save-terms-btn");
const resetTermsBtn = document.querySelector("#reset-terms-btn");
const serviceCreateDialog = document.querySelector("#service-create-dialog");
const serviceCreateForm = document.querySelector("#service-create-form");
const serviceCreateInput = document.querySelector("#service-create-input");
const serviceCreateError = document.querySelector("#service-create-error");
const serviceCreateCancel = document.querySelector("#service-create-cancel");
const saveErrorDialog = document.querySelector("#save-error-dialog");
const saveErrorMessage = document.querySelector("#save-error-message");
const saveErrorClose = document.querySelector("#save-error-close");
const saveErrorRetry = document.querySelector("#save-error-retry");
const receiptNumber = document.querySelector("#receipt-number");
const modelColorPreview = document.querySelector("#model-color-preview");
const moduleTabs = Array.from(document.querySelectorAll("[data-module-tab]"));
const modulePanels = Array.from(document.querySelectorAll("[data-module-panel]"));
const repairsList = document.querySelector("#repairs-list");
const stockList = document.querySelector("#stock-list");
const cashList = document.querySelector("#cash-list");
const clientsList = document.querySelector("#clients-list");
const refreshRepairsBtn = document.querySelector("#refresh-repairs-btn");
const refreshStockBtn = document.querySelector("#refresh-stock-btn");
const refreshCashBtn = document.querySelector("#refresh-cash-btn");
const refreshClientsBtn = document.querySelector("#refresh-clients-btn");

const previewFields = Array.from(document.querySelectorAll("[data-preview]"));
let savedReceipt = null;
let latestReceiptResults = [];
let managementReceipts = [];
let stockProducts = [];

const REPAIR_STATUSES = [
  "Ingresado",
  "En diagnóstico",
  "Presupuestado",
  "Esperando repuesto",
  "En reparación",
  "Listo para retirar",
  "Entregado",
  "Cancelado",
];

function formatCurrentDateTime() {
  return new Intl.DateTimeFormat("es-UY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function createReceiptNumber() {
  if (BOLETA_INITIAL_NEXT_NUMBER) {
    return formatReceiptNumber(BOLETA_INITIAL_NEXT_NUMBER);
  }
  return formatReceiptNumber(getNextLocalReceiptNumber());
}

function getNextLocalReceiptNumber() {
  return getReceipts().reduce((highest, receipt) => {
    const number = Number(String(receipt.number || "").replace(/\D/g, ""));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 999) + 1;
}

function getTerms() {
  return localStorage.getItem(TERMS_STORAGE_KEY) || DEFAULT_TERMS;
}

function setTerms(value) {
  const nextValue = String(value || "").trim() || DEFAULT_TERMS;
  localStorage.setItem(TERMS_STORAGE_KEY, nextValue);
  termsPreview.textContent = printableTerms();
}

function printableTerms() {
  const base = getTerms();
  const warranty = getFieldValue("warrantyOffered") || "30 días";
  const line = `Tiempo de garantía ofrecida: ${warranty}.`;
  return base.toLowerCase().includes("tiempo de garantía ofrecida")
    ? base.replace(/tiempo de garantía ofrecida:.*$/im, line)
    : `${line}\n${base}`;
}

function getServices() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERVICES_STORAGE_KEY) || "[]");
    const deleted = getDeletedServices();
    const merged = [...DEFAULT_SERVICES, ...parsed]
      .map((service) => String(service || "").trim())
      .filter((service) => service && !deleted.some((item) => item.toLowerCase() === service.toLowerCase()));
    return [...new Set(merged)].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  } catch {
    return [...DEFAULT_SERVICES].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }
}

function getDeletedServices() {
  try {
    return JSON.parse(localStorage.getItem(DELETED_SERVICES_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setServices(services) {
  const sorted = [...new Set(services)]
    .map((service) => String(service || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(sorted));
  renderServices();
}

function selectedServices() {
  return Array.from(serviceChecks.querySelectorAll("input[type='checkbox']:checked"))
    .map((item) => item.value.trim())
    .filter(Boolean);
}

function selectedServicesText() {
  const selected = selectedServices();
  return selected.length ? selected.join(", ") : "-";
}

function normalizedCatalogText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function comparableDeviceModel(value) {
  return normalizedCatalogText(value).replace(/\bpromo\b/g, "").replace(/\s+/g, " ").trim();
}

function deviceModelMatches(productModel, selectedModel) {
  const product = comparableDeviceModel(productModel);
  const selected = comparableDeviceModel(selectedModel);
  if (!product || !selected) return false;
  if (product === selected) return true;
  const productTokens = product.split(" ").filter(Boolean);
  const selectedTokens = selected.split(" ").filter(Boolean);
  const selectedInsideProduct = selectedTokens.every((token) => productTokens.includes(token));
  const productInsideSelected = productTokens.every((token) => selectedTokens.includes(token));
  return selectedInsideProduct || productInsideSelected;
}

function managementServiceCatalog() {
  try {
    const stored = JSON.parse(localStorage.getItem(MANAGEMENT_STORAGE_KEY) || "{}");
    return Array.isArray(stored.services) ? stored.services.filter((service) => service && service.active !== false) : [];
  } catch {
    return [];
  }
}

function managementCatalogState() {
  try { return JSON.parse(localStorage.getItem(MANAGEMENT_STORAGE_KEY) || "{}"); } catch { return {}; }
}

function matchingStockProduct(selectedService, brand, model) {
  const stored = managementCatalogState();
  const categories = [...(stored.productCategories || []), ...(stored.webProductCategories || [])];
  const products = Array.isArray(stored.products) ? stored.products : [];
  const candidates = products.filter((product) => {
    const category = categories.find((item) => String(item.id) === String(product.categoryId));
    return product.active !== false
      && Number(product.stock || 0) > 0
      && normalizedCatalogText(product.brand) === brand
      && deviceModelMatches(product.model, model)
      && serviceCategoryMatches(selectedService, { category: category?.name || "", name: product.name || "" });
  }).sort((left, right) => Number(right.stock || 0) - Number(left.stock || 0));
  const product = candidates[0];
  if (!product) return null;
  const category = categories.find((item) => String(item.id) === String(product.categoryId));
  return { name: selectedService, category: category?.name || "Stock", brand: product.brand, model: product.model, salePrice: Number(product.salePrice || product.price || 0), costPrice: Number(product.costPrice || 0), productId: product.id, productName: product.name || "", fromStock: true };
}

function serviceCategoryMatches(selectedService, catalogService) {
  const selected = normalizedCatalogText(selectedService);
  const category = normalizedCatalogText(catalogService.category);
  const name = normalizedCatalogText(catalogService.name);
  if (category && (selected.includes(category) || category.includes(selected))) return true;
  const aliases = {
    pantalla: ["pantalla", "display"], carga: ["carga", "pin", "flex"], camara: ["camara", "lens"],
    tapa: ["tapa", "trasera"], placa: ["placa"], parlante: ["parlante", "altavoz"],
    microfono: ["microfono"], auricular: ["auricular"], bateria: ["bateria"],
    diagnostico: ["diagnostico"], mantenimiento: ["mantenimiento"]
  };
  const selectedAlias = Object.values(aliases).find((words) => words.some((word) => selected.includes(word)));
  if (selectedAlias && selectedAlias.some((word) => category.includes(word) || name.includes(word))) return true;
  const ignored = new Set(["cambio", "servicio", "reparacion", "venta", "instalacion", "colocacion", "para", "con", "del"]);
  const selectedTokens = selected.split(" ").filter((word) => word.length >= 4 && !ignored.has(word));
  const catalogText = `${category} ${name}`;
  return selectedTokens.some((word) => catalogText.includes(word) || (word.endsWith("s") && catalogText.includes(word.slice(0, -1))));
}

function matchingPricedService(selectedService) {
  const brand = normalizedCatalogText(getFieldValue("deviceBrand"));
  const model = comparableDeviceModel(getFieldValue("deviceModel"));
  if (!brand || !model) return null;
  const stockProduct = matchingStockProduct(selectedService, brand, model);
  const configuredService = managementServiceCatalog().find((service) =>
    normalizedCatalogText(service.brand) === brand
    && deviceModelMatches(service.model, model)
    && serviceCategoryMatches(selectedService, service)
    && Number(service.salePrice || 0) >= 0
  ) || null;
  if (configuredService && stockProduct) {
    return {
      ...configuredService,
      costPrice: Number(stockProduct.costPrice || 0),
      productId: stockProduct.productId,
      productName: stockProduct.productName,
      fromStock: true
    };
  }
  return configuredService || stockProduct;
}

function autofillPriceFromCatalog() {
  const selected = selectedServices();
  const brand = getFieldValue("deviceBrand");
  const model = getFieldValue("deviceModel");
  if (!selected.length) {
    if (priceSuggestion) priceSuggestion.textContent = "Se completa al seleccionar un servicio con precio predefinido.";
    return;
  }
  if (!brand || !model) {
    if (priceSuggestion) priceSuggestion.textContent = "Elegí la marca y el modelo para buscar el precio predefinido.";
    return;
  }

  const matches = selected.map((service) => ({ selected: service, catalog: matchingPricedService(service) }));
  const priced = matches.filter((item) => item.catalog);
  if (!priced.length) {
    if (priceSuggestion) priceSuggestion.textContent = "No hay un precio predefinido para este equipo y servicio. Ingresalo manualmente.";
    return;
  }

  const total = priced.reduce((sum, item) => sum + Number(item.catalog.salePrice || 0), 0);
  const totalCost = priced.reduce((sum, item) => sum + Number(item.catalog.costPrice || 0), 0);
  form.elements.price.value = String(total);
  form.elements.cost.value = totalCost > 0 ? String(totalCost) : "";
  form.elements.price.dataset.autofilled = "true";
  const missing = matches.length - priced.length;
  const source = priced.length === 1 ? priced[0].catalog.category : `${priced.length} servicios`;
  if (priceSuggestion) priceSuggestion.textContent = `Precio sugerido según ${source} para ${brand} ${model}${missing ? `. Falta definir ${missing} servicio manualmente` : ""}. Podés modificarlo.`;
}

function receiptLineItems() {
  const selected = selectedServices();
  const items = selected.map((label) => {
    const catalog = matchingPricedService(label);
    return {
      label,
      description: catalog?.name || label,
      type: normalizedCatalogText(label).startsWith("venta") ? "Venta" : "Servicio",
      price: servicePriceOverrides.has(label) ? servicePriceOverrides.get(label) : (catalog ? Number(catalog.salePrice || 0) : null),
      cost: catalog ? Number(catalog.costPrice || 0) : 0,
      itemType: "service",
      productId: catalog?.productId || "",
      consumesStock: Boolean(catalog?.fromStock || (catalog && Number(catalog.costPrice || 0) > 0))
    };
  });
  return items;
}

function renderServicePriceEditor() {
  if (!servicePriceEditor) return;
  const selected = selectedServices();
  servicePriceEditor.hidden = selected.length === 0;
  servicePriceEditor.innerHTML = selected.map((label) => {
    const catalog = matchingPricedService(label);
    const hasOverride = servicePriceOverrides.has(label);
    const value = hasOverride ? servicePriceOverrides.get(label) : (catalog ? Number(catalog.salePrice || 0) : "");
    return `<div class="service-price-row ${catalog && !hasOverride ? "catalog-price" : "manual-price"}">
      <span><strong>${escapeHtml(label)}</strong><small>${catalog && !hasOverride ? "Precio predefinido" : "Precio manual"}</small></span>
      <div class="service-price-input"><span>$</span><input type="number" min="0" step="0.01" inputmode="decimal" aria-label="Precio de ${escapeHtml(label)}" data-service-line-price="${escapeHtml(label)}" value="${value}" placeholder="Ingresar precio"></div>
    </div>`;
  }).join("");
}

function updateTotalFromServicePrices() {
  const items = receiptLineItems();
  const priced = items.filter((item) => item.price !== null && Number.isFinite(Number(item.price)));
  form.elements.price.value = priced.length ? String(priced.reduce((sum, item) => sum + Number(item.price), 0)) : "";
  form.elements.price.dataset.autofilled = "true";
  renderReceiptServiceLines();
  updatePreview();
}

function formatReceiptPrice(value) {
  if (value === null || !Number.isFinite(Number(value))) return "A definir";
  return `$ ${Number(value).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function renderReceiptServiceLines() {
  if (!receiptServiceLines) return;
  const items = receiptLineItems();
  receiptServiceLines.innerHTML = items.length ? items.map((item) => `
    <div class="receipt-service-line">
      <span><small>${item.type}</small>${escapeHtml(item.label)}</span>
      <strong>${formatReceiptPrice(item.price)}</strong>
    </div>
  `).join("") : `<div class="receipt-service-empty">Sin servicios o ventas seleccionados</div>`;
}

function getVisualOptions() {
  try {
    const custom = JSON.parse(localStorage.getItem(VISUAL_STORAGE_KEY) || "[]")
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return [...new Set([...DEFAULT_VISUAL_OPTIONS, ...custom])];
  } catch {
    return [...DEFAULT_VISUAL_OPTIONS];
  }
}

function setVisualOptions(options) {
  const custom = options
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => !DEFAULT_VISUAL_OPTIONS.some((base) => base.toLowerCase() === item.toLowerCase()));
  localStorage.setItem(VISUAL_STORAGE_KEY, JSON.stringify([...new Set(custom)]));
}

function selectedVisualItems() {
  return Array.from(visualChecks.querySelectorAll("input[type='checkbox']:checked"))
    .map((item) => item.value.trim())
    .filter(Boolean);
}

function selectedVisualText() {
  const selected = selectedVisualItems();
  return selected.length ? selected.map((item) => `- ${item}`).join("\n") : "-";
}

function renderVisualOptions() {
  const selected = new Set(selectedVisualItems().map((item) => item.toLowerCase()));
  visualChecks.innerHTML = "";
  getVisualOptions().forEach((option) => {
    const label = document.createElement("label");
    label.className = "visual-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = option;
    checkbox.checked = selected.has(option.toLowerCase());
    checkbox.addEventListener("change", updatePreview);
    const text = document.createElement("span");
    text.textContent = option;
    label.append(checkbox, text);
    visualChecks.append(label);
  });
}

function addVisualOption() {
  const option = String(prompt("Escribe la condición visual:") || "").trim();
  if (!option) return;
  const options = getVisualOptions();
  if (!options.some((item) => item.toLowerCase() === option.toLowerCase())) {
    setVisualOptions([...options, option]);
  }
  renderVisualOptions();
  const checkbox = Array.from(visualChecks.querySelectorAll("input[type='checkbox']"))
    .find((item) => item.value.toLowerCase() === option.toLowerCase());
  if (checkbox) checkbox.checked = true;
  updatePreview();
}

function renderServices() {
  const selected = new Set(selectedServices().map((service) => service.toLowerCase()));
  serviceChecks.innerHTML = "";
  getServices().forEach((service) => {
    const label = document.createElement("label");
    label.className = "check-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = service;
    checkbox.checked = selected.has(service.toLowerCase());
    checkbox.addEventListener("change", () => {
      if (!checkbox.checked) servicePriceOverrides.delete(service);
      autofillPriceFromCatalog();
      updatePreview();
      updateServicePickerState();
    });
    label.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openServiceContextMenu(service);
    });

    const text = document.createElement("span");
    text.textContent = service;

    label.append(checkbox, text);
    serviceChecks.append(label);
  });
  updateServiceSummary();
  filterServiceOptions();
  updateServicePickerState();
}

function filterServiceOptions() {
  const query = normalizedCatalogText(serviceSearch?.value);
  let visible = 0;
  serviceChecks.querySelectorAll(".check-option").forEach((label) => {
    const matches = !query || normalizedCatalogText(label.textContent).includes(query);
    label.hidden = !matches;
    if (matches) visible += 1;
  });
  if (serviceEmpty) serviceEmpty.hidden = visible > 0;
}

function updateServicePickerState() {
  const selected = selectedServices();
  renderServicePriceEditor();
  if (serviceSelectionCount) serviceSelectionCount.textContent = selected.length
    ? `${selected.length} servicio${selected.length === 1 ? "" : "s"} seleccionado${selected.length === 1 ? "" : "s"}`
    : "Ningún servicio seleccionado";
  if (!selectedServicesPanel) return;
  selectedServicesPanel.hidden = selected.length === 0;
  selectedServicesPanel.innerHTML = selected.map((service) => `<button type="button" data-remove-selected-service="${escapeHtml(service)}" title="Quitar ${escapeHtml(service)}">${escapeHtml(service)} <span>×</span></button>`).join("");
}

function renderBrands() {
  brandOptions.innerHTML = "";
  getBrands().forEach((brand) => {
    const option = document.createElement("option");
    option.value = brand;
    brandOptions.append(option);
  });
}

function getBrands() {
  let custom = [];
  let deleted = [];
  try {
    custom = JSON.parse(localStorage.getItem(BRANDS_STORAGE_KEY) || "[]");
    deleted = JSON.parse(localStorage.getItem(DELETED_BRANDS_STORAGE_KEY) || "[]");
  } catch {
    custom = [];
    deleted = [];
  }

  return [...new Set([...DEFAULT_BRANDS, ...custom].map((item) => String(item || "").trim()).filter(Boolean))]
    .filter((brand) => !deleted.some((item) => item.toLowerCase() === brand.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function getModelsForCurrentBrand() {
  const brand = getFieldValue("deviceBrand").toLowerCase();
  const customModels = getCustomModels();
  const deletedModels = getDeletedModels();
  return [...new Set([...DEFAULT_MODELS, ...customModels]
    .filter(([modelBrand]) => !brand || modelBrand.toLowerCase() === brand)
    .filter(([modelBrand, model]) => !deletedModels.some((item) =>
      item.brand.toLowerCase() === modelBrand.toLowerCase() &&
      item.model.toLowerCase() === model.toLowerCase()
    ))
    .map(([, model]) => model)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })))]
}

function renderModels() {
  const models = getModelsForCurrentBrand();

  modelOptions.innerHTML = "";
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    modelOptions.append(option);
  });
  renderModelPicker(models);
}

function getDeletedModels() {
  try {
    return JSON.parse(localStorage.getItem(DELETED_MODELS_STORAGE_KEY) || "[]")
      .map((item) => ({ brand: String(item.brand || "").trim(), model: String(item.model || "").trim() }))
      .filter((item) => item.brand && item.model);
  } catch {
    return [];
  }
}

function getCustomModels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY) || "[]");
    return parsed
      .map((item) => [String(item.brand || "").trim(), String(item.model || "").trim()])
      .filter(([brand, model]) => brand && model);
  } catch {
    return [];
  }
}

function setCustomModels(models) {
  const sorted = [...models].sort((a, b) => {
    const brandCompare = a[0].localeCompare(b[0], "es", { sensitivity: "base" });
    return brandCompare || a[1].localeCompare(b[1], "es", { sensitivity: "base" });
  });
  localStorage.setItem(
    MODELS_STORAGE_KEY,
    JSON.stringify(sorted.map(([brand, model]) => ({ brand, model })))
  );
}

function addCurrentModel() {
  const brand = getFieldValue("deviceBrand");
  const model = getFieldValue("deviceModel");

  if (!model) {
    alert("Escribe el modelo que quieres añadir.");
    return;
  }

  if (!brand) {
    alert("Selecciona o escribe primero la marca del equipo.");
    return;
  }

  const customModels = getCustomModels();
  const exists = [...DEFAULT_MODELS, ...customModels].some(
    ([itemBrand, itemModel]) =>
      itemBrand.toLowerCase() === brand.toLowerCase() &&
      itemModel.toLowerCase() === model.toLowerCase()
  );

  if (!exists) {
    setCustomModels([...customModels, [brand, model]]);
  }

  renderModels();
  form.elements.deviceModel.value = model;
  updatePreview();
}

function learnCurrentBrandAndModel() {
  const brand = getFieldValue("deviceBrand");
  const model = getFieldValue("deviceModel");
  if (!brand) return;

  let customBrands = [];
  try { customBrands = JSON.parse(localStorage.getItem(BRANDS_STORAGE_KEY) || "[]"); } catch { customBrands = []; }
  if (![...DEFAULT_BRANDS, ...customBrands].some((item) => String(item).toLowerCase() === brand.toLowerCase())) {
    localStorage.setItem(BRANDS_STORAGE_KEY, JSON.stringify([...customBrands, brand]));
  }

  if (model) {
    const customModels = getCustomModels();
    if (![...DEFAULT_MODELS, ...customModels].some(([itemBrand, itemModel]) => itemBrand.toLowerCase() === brand.toLowerCase() && itemModel.toLowerCase() === model.toLowerCase())) {
      setCustomModels([...customModels, [brand, model]]);
    }
  }
  renderBrands();
  renderModels();
}

function editCurrentBrand() {
  const oldBrand = getFieldValue("deviceBrand");
  if (!oldBrand) return;
  const newBrand = String(prompt("Editar marca:", oldBrand) || "").trim();
  if (!newBrand || newBrand.toLowerCase() === oldBrand.toLowerCase()) return;

  const brands = getBrands().filter((brand) => brand.toLowerCase() !== oldBrand.toLowerCase());
  localStorage.setItem(BRANDS_STORAGE_KEY, JSON.stringify([...brands, newBrand]));

  const customModels = getCustomModels().map(([brand, model]) => [
    brand.toLowerCase() === oldBrand.toLowerCase() ? newBrand : brand,
    model,
  ]);
  setCustomModels(customModels);

  form.elements.deviceBrand.value = newBrand;
  renderBrands();
  renderModels();
  updatePreview();
}

function deleteCurrentBrand() {
  const brand = getFieldValue("deviceBrand");
  if (!brand || !confirm(`¿Eliminar la marca "${brand}"?`)) return;
  const deleted = JSON.parse(localStorage.getItem(DELETED_BRANDS_STORAGE_KEY) || "[]");
  localStorage.setItem(DELETED_BRANDS_STORAGE_KEY, JSON.stringify([...new Set([...deleted, brand])]));
  form.elements.deviceBrand.value = "";
  renderBrands();
  renderModels();
  updatePreview();
}

function editCurrentModel() {
  const brand = getFieldValue("deviceBrand");
  const oldModel = getFieldValue("deviceModel");
  if (!brand || !oldModel) return;
  const newModel = String(prompt("Editar modelo:", oldModel) || "").trim();
  if (!newModel || newModel.toLowerCase() === oldModel.toLowerCase()) return;

  const customModels = getCustomModels().filter(
    ([itemBrand, itemModel]) =>
      itemBrand.toLowerCase() !== brand.toLowerCase() ||
      itemModel.toLowerCase() !== oldModel.toLowerCase()
  );
  setCustomModels([...customModels, [brand, newModel]]);

  const deleted = getDeletedModels();
  localStorage.setItem(DELETED_MODELS_STORAGE_KEY, JSON.stringify([...deleted, { brand, model: oldModel }]));
  form.elements.deviceModel.value = newModel;
  renderModels();
  updatePreview();
}

function deleteCurrentModel() {
  const brand = getFieldValue("deviceBrand");
  const model = getFieldValue("deviceModel");
  if (!brand || !model || !confirm(`¿Eliminar el modelo "${model}"?`)) return;
  const deleted = getDeletedModels();
  localStorage.setItem(DELETED_MODELS_STORAGE_KEY, JSON.stringify([...deleted, { brand, model }]));
  form.elements.deviceModel.value = "";
  renderModels();
  updatePreview();
}

function editModelValue(model) {
  const brand = getFieldValue("deviceBrand");
  if (!brand || !model) return;
  form.elements.deviceModel.value = model;
  editCurrentModel();
  showModelPicker();
}

function deleteModelValue(model) {
  const brand = getFieldValue("deviceBrand");
  if (!brand || !model) return;
  form.elements.deviceModel.value = model;
  deleteCurrentModel();
  showModelPicker();
}

function openModelContextMenu(model) {
  const action = String(prompt(`Modelo: ${model}\nEscribe "editar" o "eliminar":`) || "").trim().toLowerCase();
  if (action === "editar") editModelValue(model);
  if (action === "eliminar") deleteModelValue(model);
}

function renderModelPicker(models = getModelsForCurrentBrand()) {
  modelPicker.innerHTML = "";
  models.forEach((model) => {
    const row = document.createElement("div");
    row.className = "model-option";

    const select = document.createElement("button");
    select.type = "button";
    select.className = "model-select";
    select.textContent = model;
    select.addEventListener("click", () => {
      form.elements.deviceModel.value = model;
      modelPicker.hidden = true;
      updatePreview();
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "model-action";
    edit.textContent = "Editar";
    edit.addEventListener("click", () => editModelValue(model));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "model-action";
    remove.textContent = "Eliminar";
    remove.addEventListener("click", () => deleteModelValue(model));

    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openModelContextMenu(model);
    });
    row.append(select, edit, remove);
    modelPicker.append(row);
  });
}

function showModelPicker() {
  renderModels();
  modelPicker.hidden = modelPicker.children.length === 0;
}

function openServiceContextMenu(service) {
  const action = String(prompt(`Servicio: ${service}\nEscribe "editar" o "eliminar":`) || "").trim().toLowerCase();
  if (action === "editar") {
    const next = String(prompt("Editar servicio:", service) || "").trim();
    if (!next || next.toLowerCase() === service.toLowerCase()) return;
    const services = getServices().filter((item) => item.toLowerCase() !== service.toLowerCase());
    setServices([...services, next]);
    const deleted = getDeletedServices();
    localStorage.setItem(DELETED_SERVICES_STORAGE_KEY, JSON.stringify([...new Set([...deleted, service])]));
    renderServices();
    const checkbox = Array.from(serviceChecks.querySelectorAll("input[type='checkbox']"))
      .find((item) => item.value.toLowerCase() === next.toLowerCase());
    if (checkbox) checkbox.checked = true;
    updatePreview();
  } else if (action === "eliminar") {
    if (!confirm(`¿Eliminar el servicio "${service}"?`)) return;
    const deleted = getDeletedServices();
    localStorage.setItem(DELETED_SERVICES_STORAGE_KEY, JSON.stringify([...new Set([...deleted, service])]));
    renderServices();
    updatePreview();
  }
}

function requestNewServiceName() {
  serviceCreateInput.value = "";
  serviceCreateError.textContent = "";
  serviceCreateDialog.showModal();
  requestAnimationFrame(() => serviceCreateInput.focus());
  return new Promise((resolve) => {
    const finish = (value) => {
      serviceCreateForm.removeEventListener("submit", submit);
      serviceCreateCancel.removeEventListener("click", cancel);
      serviceCreateDialog.removeEventListener("cancel", cancel);
      if (serviceCreateDialog.open) serviceCreateDialog.close();
      resolve(value);
    };
    const cancel = (event) => { event?.preventDefault(); finish(""); };
    const submit = (event) => {
      event.preventDefault();
      const value = String(serviceCreateInput.value || "").trim();
      if (value.length < 2) {
        serviceCreateError.textContent = "Escribe un nombre de al menos 2 caracteres.";
        serviceCreateInput.focus();
        return;
      }
      finish(value);
    };
    serviceCreateForm.addEventListener("submit", submit);
    serviceCreateCancel.addEventListener("click", cancel);
    serviceCreateDialog.addEventListener("cancel", cancel);
  });
}

async function addCurrentService() {
  const service = await requestNewServiceName();
  if (!service) return;

  const services = getServices();
  if (!services.some((item) => item.toLowerCase() === service.toLowerCase())) {
    setServices([...services, service]);
  }

  renderServices();
  const checkbox = Array.from(serviceChecks.querySelectorAll("input[type='checkbox']"))
    .find((item) => item.value.toLowerCase() === service.toLowerCase());
  if (checkbox) checkbox.checked = true;
  autofillPriceFromCatalog();
  updatePreview();
}

function updateServiceSummary() {
  const text = selectedServicesText();
  serviceSummary.textContent = text === "-" ? "Seleccionar servicios" : text;
}

function getFieldValue(name) {
  const field = form.elements[name];
  return field ? String(field.value || "").trim() : "";
}

function modelWithColor() {
  const model = getFieldValue("deviceModel");
  const color = getFieldValue("deviceColor");
  if (!model && !color) return "-";
  if (!model) return color;
  if (!color) return model;
  return `${model} ${color.toLowerCase()}`;
}

function deliveryText() {
  const number = getFieldValue("deliveryTime");
  const unit = getFieldValue("deliveryUnit");
  if (!number) return "-";
  if (unit === "h") return number === "1" ? "1 hora" : `${number} horas`;
  if (unit === "d") return number === "1" ? "1 día" : `${number} días`;
  return number;
}

function parsePattern(value) {
  return String(value || "")
    .split(/[-,;\s]+/)
    .map((item) => Number.parseInt(item, 10))
    .filter((item, index, arr) => item >= 1 && item <= 9 && arr.indexOf(item) === index);
}

function patternSvg(value) {
  const points = parsePattern(value);
  if (!points.length) return "<span class=\"muted-small\">Sin patrón</span>";
  const coords = {
    1: [18, 18], 2: [47, 18], 3: [76, 18],
    4: [18, 47], 5: [47, 47], 6: [76, 47],
    7: [18, 76], 8: [47, 76], 9: [76, 76],
  };
  const lines = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return `<line x1="${coords[point][0]}" y1="${coords[point][1]}" x2="${coords[next][0]}" y2="${coords[next][1]}" />`;
  }).join("");
  const dots = Object.entries(coords).map(([key, [x, y]]) => {
    const selected = points.includes(Number(key));
    return `<g><circle cx="${x}" cy="${y}" r="7" class="${selected ? "selected" : ""}"></circle><text x="${x}" y="${y + 3}">${key}</text></g>`;
  }).join("");
  return `<svg class="pattern-drawing" viewBox="0 0 94 94" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="92" height="92" rx="8"></rect>${lines}${dots}</svg><small>${value}</small>`;
}

function fillDefaultDate() {
  form.elements.entryDate.value = formatCurrentDateTime();
  receiptNumber.textContent = createReceiptNumber();
}

function updatePreview() {
  previewFields.forEach((node) => {
    const key = node.dataset.preview;
    node.textContent = key === "serviceToDo" ? selectedServicesText() : getFieldValue(key) || "-";
  });
  const deliveryNode = document.querySelector('[data-preview="deliveryTime"]');
  if (deliveryNode) deliveryNode.textContent = deliveryText();
  const visualItems = selectedVisualItems();
  visualPreview.innerHTML = visualItems.length
    ? visualItems.map((item) => `<div>- ${item}</div>`).join("")
    : "<div>-</div>";
  modelColorPreview.textContent = modelWithColor();
  patternPreview.innerHTML = patternSvg(getFieldValue("unlockPattern"));
  termsPreview.textContent = printableTerms();
  renderReceiptServiceLines();
  updateServiceSummary();
}

function clearForm() {
  savedReceipt = null;
  servicePriceOverrides.clear();
  form.reset();
  fillDefaultDate();
  loadNextReceiptNumber();
  updatePreview();
}

function hasReceiptDraft() {
  const meaningfulFields = ["clientName", "clientId", "clientPhone", "deviceBrand", "deviceModel", "deviceColor", "reportedIssue", "deliveryTime", "price", "cost", "unlockCode", "unlockPassword", "unlockPattern"];
  return meaningfulFields.some((name) => Boolean(getFieldValue(name)))
    || selectedServices().length > 0
    || selectedVisualItems().length > 0;
}

function openTermsEditor() {
  termsEditor.value = getTerms();
  if (typeof termsDialog.showModal === "function") {
    termsDialog.showModal();
  } else {
    termsDialog.setAttribute("open", "");
  }
}

function closeTermsEditor() {
  if (typeof termsDialog.close === "function") {
    termsDialog.close();
  } else {
    termsDialog.removeAttribute("open");
  }
}

async function printReceipt() {
  const receipt = savedReceipt || await saveReceipt();
  if (!receipt) return;
  savedReceipt = receipt;
  receiptNumber.textContent = formatReceiptNumber(receipt.number);
  updatePreview();
  preparePrintCopies();
  window.print();
  window.setTimeout(() => {
    cleanupPrintCopies();
    clearForm();
  }, 250);
}

async function saveReceiptOnly() {
  const receipt = await saveReceipt();
  if (!receipt) return;
  savedReceipt = receipt;
  receiptNumber.textContent = formatReceiptNumber(receipt.number);
  updatePreview();
  alert(`Boleta ${formatReceiptNumber(receipt.number)} guardada correctamente.`);
  return receipt;
}

function preparePrintCopies() {
  cleanupPrintCopies();
  const receipt = document.querySelector("#receipt");
  const previewPanel = document.querySelector(".preview-panel");
  if (!receipt || !previewPanel) return;
  const copy = receipt.cloneNode(true);
  copy.id = "receipt-copy-2";
  copy.classList.add("print-copy");
  previewPanel.append(copy);
}

function cleanupPrintCopies() {
  document.querySelectorAll(".print-copy").forEach((node) => node.remove());
}

function saveReceiptIndex() {
  const receipts = getReceipts();
  receipts.push({
    number: receiptNumber.textContent,
    date: getFieldValue("entryDate"),
    model: getFieldValue("deviceModel"),
    brand: getFieldValue("deviceBrand"),
  });
  localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(receipts.slice(-300)));
}

function getReceipts() {
  try {
    return JSON.parse(localStorage.getItem(RECEIPTS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function searchReceipts() {
  const query = String(searchBox.value || "").trim().toLowerCase();
  if (!query) {
    alert("Escribe un número de orden, modelo o fecha para buscar.");
    return;
  }
  const results = getReceipts().filter((item) =>
    [item.number, item.date, item.model, item.brand].some((value) =>
      String(value || "").toLowerCase().includes(query)
    )
  );
  alert(results.length
    ? results.map((item) => `${item.number} | ${item.date} | ${item.brand || ""} ${item.model || ""}`).join("\n")
    : "No encontré boletas con esa búsqueda.");
}

let patternDraft = [];

function formatReceiptNumber(number) {
  return `N° ${String(number || 1000).padStart(4, "0")}`;
}

function boletaApiUrl(path = "", params = {}) {
  const url = new URL(`${BOLETA_API_BASE}${path}`, window.location.origin);
  if (BOLETA_ACTOR_ID) url.searchParams.set("actorId", BOLETA_ACTOR_ID);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) url.searchParams.set(key, value);
  });
  return url.toString();
}

async function boletaApiRequest(path = "", options = {}) {
  const response = await fetch(boletaApiUrl(path, options.params), {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "No se pudo completar la solicitud.");
  }
  return payload;
}

async function loadNextReceiptNumber() {
  if (BOLETA_INITIAL_NEXT_NUMBER) {
    receiptNumber.textContent = formatReceiptNumber(BOLETA_INITIAL_NEXT_NUMBER);
    return;
  }
  if (!BOLETA_ACTOR_ID) return;
  try {
    const payload = await boletaApiRequest("/next-number");
    receiptNumber.textContent = formatReceiptNumber(payload.nextNumber);
  } catch (error) {
    console.warn("No se pudo obtener el proximo numero de boleta.", error);
  }
}

function collectReceiptPayload() {
  return {
    number: Number(String(receiptNumber.textContent || "").replace(/\D/g, "")),
    clientName: getFieldValue("clientName"),
    clientId: getFieldValue("clientId"),
    clientPhone: getFieldValue("clientPhone"),
    entryDate: getFieldValue("entryDate"),
    deviceBrand: getFieldValue("deviceBrand"),
    deviceModel: getFieldValue("deviceModel"),
    deviceColor: getFieldValue("deviceColor"),
    services: selectedServices(),
    serviceItems: receiptLineItems().map((item) => ({ description: item.description, type: item.type, price: item.price, cost: item.cost, itemType: item.itemType, productId: item.productId || "", consumesStock: item.consumesStock, approvalStatus: "Pendiente", quantity: 1 })),
    reportedIssue: getFieldValue("reportedIssue"),
    visualItems: selectedVisualItems(),
    deliveryTime: getFieldValue("deliveryTime"),
    deliveryUnit: getFieldValue("deliveryUnit"),
    warrantyOffered: getFieldValue("warrantyOffered"),
    price: getFieldValue("price"),
    cost: getFieldValue("cost"),
    unlockCode: getFieldValue("unlockCode"),
    unlockPassword: getFieldValue("unlockPassword"),
    unlockPattern: getFieldValue("unlockPattern"),
    terms: printableTerms(),
  };
}

function loadManagementState() {
  try {
    const saved = JSON.parse(localStorage.getItem(MANAGEMENT_STORAGE_KEY) || "{}");
    return {
      clients: Array.isArray(saved.clients) ? saved.clients : [],
      orders: Array.isArray(saved.orders) ? saved.orders : [],
      productCategories: Array.isArray(saved.productCategories) ? saved.productCategories : [],
      products: Array.isArray(saved.products) ? saved.products : [],
      sales: Array.isArray(saved.sales) ? saved.sales : [],
      expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
    };
  } catch {
    return { clients: [], orders: [], productCategories: [], products: [], sales: [], expenses: [] };
  }
}

function saveManagementState(nextState) {
  localStorage.setItem(MANAGEMENT_STORAGE_KEY, JSON.stringify(nextState));
}

function managementUid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function receiptOrderNumber(receipt) {
  return `OT-${String(receipt.number || 1).padStart(4, "0")}`;
}

function syncReceiptWithManagement(receipt) {
  const management = loadManagementState();
  const clientDocument = String(receipt.clientId || "").trim() || "-";
  const clientName = String(receipt.clientName || "").trim() || "Cliente sin nombre";
  const clientPhone = String(receipt.clientPhone || "").trim() || "-";
  let client = management.clients.find((item) => {
    return clientDocument !== "-" && String(item.document || "").trim() === clientDocument;
  });

  if (!client) {
    client = management.clients.find((item) => {
      return String(item.name || "").trim().toLowerCase() === clientName.toLowerCase();
    });
  }

  if (client) {
    client.name = clientName;
    client.document = clientDocument;
    client.phone = clientPhone;
    client.email = client.email || "-";
  } else {
    client = {
      id: managementUid("c"),
      name: clientName,
      document: clientDocument,
      phone: clientPhone,
      email: "-",
    };
    management.clients.push(client);
  }

  const orderNumber = receiptOrderNumber(receipt);
  const order = {
    id: `boleta-${receipt.id || managementUid("o")}`,
    receiptId: receipt.id || "",
    number: orderNumber,
    clientId: client.id,
    clientName: client.name,
    clientDocument: client.document,
    clientPhone: client.phone,
    device: [receipt.deviceBrand, receipt.deviceModel, receipt.deviceColor].filter(Boolean).join(" ") || "-",
    brand: receipt.deviceBrand || "-",
    model: receipt.deviceModel || "-",
    color: receipt.deviceColor || "-",
    problem: receipt.reportedIssue || "-",
    diagnosis: (receipt.visualItems || []).join(", ") || "-",
    services: receipt.services || [],
    deliveryTime: [receipt.deliveryTime, receipt.deliveryUnit].filter(Boolean).join(" "),
    warrantyOffered: receipt.warrantyOffered || "-",
    unlockCode: receipt.unlockCode || "",
    unlockPassword: receipt.unlockPassword || "",
    unlockPattern: receipt.unlockPattern || "",
    terms: receipt.terms || "",
    status: "En diagnostico",
    budget: Number(String(receipt.price || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
    cost: Number(String(receipt.cost || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
    paid: 0,
    date: new Date().toISOString().slice(0, 10),
  };

  const existingIndex = management.orders.findIndex((item) => {
    return item.receiptId === receipt.id || item.number === orderNumber;
  });
  if (existingIndex >= 0) {
    management.orders[existingIndex] = { ...management.orders[existingIndex], ...order };
  } else {
    management.orders.push(order);
  }

  saveManagementState(management);
}

function gestionClientSelect() {
  return document.getElementById(GESTION_CLIENT_SELECT_ID);
}

function parseLocalNumber(value) {
  const cleaned = String(value || "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function loadGestionClients() {
  const select = gestionClientSelect();
  if (!select) return;
  try {
    const response = await fetch(GESTION_BOOTSTRAP_API, { method: "GET" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || "No se pudieron cargar los clientes.");
    }
    const clientes = Array.isArray(payload?.data?.clientes) ? payload.data.clientes : [];
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = clientes.length ? "Seleccionar cliente…" : "Sin clientes disponibles";
    select.append(placeholder);
    for (const cliente of clientes) {
      const option = document.createElement("option");
      option.value = String(cliente.id || "");
      const phone = String(cliente.phone || "").trim();
      option.textContent = phone ? `${cliente.displayName} (${phone})` : cliente.displayName;
      select.append(option);
    }
  } catch (error) {
    console.warn("No se pudieron cargar los clientes de gestion.", error);
  }
}

// D8: submit -> POST /api/gestion/ordenes con x-idempotency-key (UUID por
// intento, reutilizado en el retry del mismo intento), mapeando equipo/tiempo
// al input extendido. El desbloqueo NO se persiste.
function buildGestionOrderInput(receipt) {
  const clientSelect = gestionClientSelect();
  const clienteId = String(clientSelect?.value || "").trim();
  const estimatedTime = Number(String(receipt.deliveryTime || "").replace(/\D/g, ""));
  const total = parseLocalNumber(receipt.price);
  return {
    clienteId,
    deviceBrand: String(receipt.deviceBrand || "").trim() || undefined,
    deviceModel: String(receipt.deviceModel || "").trim() || undefined,
    deviceColor: String(receipt.deviceColor || "").trim() || undefined,
    estimatedTime: Number.isFinite(estimatedTime) && estimatedTime > 0 ? estimatedTime : undefined,
    estimatedTimeUnit: receipt.deliveryUnit || undefined,
    boletaNumero: formatReceiptNumber(receipt.number),
    total: Number.isFinite(total) ? total : undefined,
  };
}

async function saveGestionReceipt(receipt) {
  const input = buildGestionOrderInput(receipt);
  if (!input.clienteId) {
    throw new Error("Seleccioná un cliente de gestión antes de guardar la orden.");
  }
  if (gestionIdempotencyKey === null) {
    gestionIdempotencyKey = crypto.randomUUID();
  }
  const response = await fetch(GESTION_ORDENES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": gestionIdempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error?.message || "No se pudo crear la orden en gestión.");
  }
  return payload?.data;
}

async function saveGestionEmbeddedReceipt() {
  const receipt = {
    id: `gestion-${Date.now().toString(36)}`,
    number: getNextLocalReceiptNumber(),
    createdAt: new Date().toISOString(),
    ...collectReceiptPayload(),
  };
  try {
    const created = await saveGestionReceipt(receipt);
    const payload = {
      numero: created?.numero,
      boletaNumero: created?.boletaNumero,
      id: created?.id,
    };
    if (window.parent && window.parent !== window.self) {
      window.parent.postMessage({ type: "ORDEN_CREADA", payload }, window.location.origin);
    }
    gestionIdempotencyKey = null;
    return { ...receipt, number: created?.numero || receipt.number };
  } catch (error) {
    const retry = await showReceiptSaveError(error);
    if (retry) return saveGestionEmbeddedReceipt();
    gestionIdempotencyKey = null;
    return null;
  }
}

async function saveReceipt() {
  learnCurrentBrandAndModel();
  if (IS_EMBEDDED_IN_GESTION) {
    return saveGestionEmbeddedReceipt();
  }
  if (!BOLETA_ACTOR_ID) {
    const receipt = {
      id: `local-${Date.now().toString(36)}`,
      number: getNextLocalReceiptNumber(),
      createdAt: new Date().toISOString(),
      ...collectReceiptPayload(),
    };
    const receipts = getReceipts().filter((item) => String(item.id) !== String(receipt.id));
    receipts.push(receipt);
    localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(receipts.slice(-300)));
    syncReceiptWithManagement(receipt);
    return receipt;
  }
  try {
    const payload = await boletaApiRequest("", {
      method: "POST",
      body: collectReceiptPayload(),
    });
    if (payload.receipt) {
      syncReceiptWithManagement(payload.receipt);
    }
    return payload.receipt;
  } catch (error) {
    const retry = await showReceiptSaveError(error);
    if (retry) return saveReceipt();
    return null;
  }
}

function showReceiptSaveError(error) {
  const rawMessage = String(error?.message || "");
  const technicalError = /bind|par[aá]metro|sentencia preparada|prepared|database|base de datos|interno|sql/i.test(rawMessage);
  saveErrorMessage.textContent = technicalError
    ? "Ocurrió un inconveniente al comunicarnos con la base de datos. Los datos de la orden permanecen en pantalla."
    : (rawMessage || "No pudimos completar el guardado. Los datos de la orden permanecen en pantalla.");
  saveErrorDialog.showModal();
  requestAnimationFrame(() => saveErrorRetry.focus());
  return new Promise((resolve) => {
    const finish = (retry) => {
      saveErrorClose.removeEventListener("click", close);
      saveErrorRetry.removeEventListener("click", retrySave);
      saveErrorDialog.removeEventListener("cancel", close);
      if (saveErrorDialog.open) saveErrorDialog.close();
      resolve(retry);
    };
    const close = (event) => { event?.preventDefault(); finish(false); };
    const retrySave = () => finish(true);
    saveErrorClose.addEventListener("click", close);
    saveErrorRetry.addEventListener("click", retrySave);
    saveErrorDialog.addEventListener("cancel", close);
  });
}

async function searchReceiptsInDatabase() {
  const query = String(searchBox.value || "").trim().toLowerCase();
  if (!query) {
    alert("Escribe un numero de boleta, modelo, cedula o nombre del cliente para buscar.");
    return;
  }
  if (!BOLETA_ACTOR_ID) {
    const results = getReceipts().filter((receipt) => {
      return [
        receipt.number,
        receipt.deviceModel,
        receipt.clientId,
        receipt.clientName,
        receipt.entryDate,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
    renderReceiptResults(results);
    return results;
  }
  try {
    const payload = await boletaApiRequest("", { params: { query } });
    renderReceiptResults(payload.receipts || []);
    return payload.receipts || [];
  } catch (error) {
    alert(error.message);
    return [];
  }
}

function renderReceiptResults(results) {
  if (!receiptResults) return;
  latestReceiptResults = Array.isArray(results) ? results : [];
  receiptResults.hidden = false;
  receiptResults.innerHTML = latestReceiptResults.length ? `
    <div class="results-head">
      <strong>Boletas encontradas</strong>
      <span>${latestReceiptResults.length} resultado${latestReceiptResults.length === 1 ? "" : "s"}</span>
    </div>
    <div class="results-list">
      ${latestReceiptResults.map((item, index) => `
        <button class="result-card" type="button" data-load-receipt="${index}">
          <strong>${formatReceiptNumber(item.number)}</strong>
          <span>${escapeHtml(item.clientName || "-")} | CI: ${escapeHtml(item.clientId || "-")}</span>
          <span>${escapeHtml([item.deviceBrand, item.deviceModel, item.deviceColor].filter(Boolean).join(" ") || "-")}</span>
          <small>${escapeHtml(item.entryDate || item.createdAt || "")}</small>
        </button>
      `).join("")}
    </div>
  ` : `<p class="empty-results">No encontre boletas con esa busqueda.</p>`;
  receiptResults.querySelectorAll("[data-load-receipt]").forEach((button) => {
    button.addEventListener("click", () => loadReceiptIntoForm(latestReceiptResults[Number(button.dataset.loadReceipt)]));
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function setActiveModule(moduleName) {
  moduleTabs.forEach((button) => button.classList.toggle("active", button.dataset.moduleTab === moduleName));
  modulePanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.modulePanel === moduleName));
  if (moduleName === "reparaciones") loadManagementReceipts();
  if (moduleName === "stock") loadStockProducts();
  if (moduleName === "caja") loadCashSummary();
  if (moduleName === "clientes") loadClientSummary();
}

async function loadManagementReceipts() {
  try {
    const payload = await boletaApiRequest("");
    managementReceipts = payload.receipts || [];
    renderRepairsList();
  } catch (error) {
    if (repairsList) repairsList.innerHTML = `<div class="management-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderRepairsList() {
  if (!repairsList) return;
  repairsList.innerHTML = managementReceipts.length ? managementReceipts.map((receipt) => `
    <article class="management-card">
      <div>
        <strong>${formatReceiptNumber(receipt.number)}</strong>
        <span>${escapeHtml(receipt.clientName || "-")} | ${escapeHtml([receipt.deviceBrand, receipt.deviceModel].filter(Boolean).join(" ") || "-")}</span>
        <small>${escapeHtml(receipt.entryDate || receipt.createdAt || "")}</small>
      </div>
      <select data-repair-status="${escapeHtml(receipt.id)}">
        ${REPAIR_STATUSES.map((status) => `<option ${status === (receipt.status || "Ingresado") ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
      </select>
      <button class="ghost-btn" type="button" data-load-repair="${escapeHtml(receipt.id)}">Ver boleta</button>
    </article>
  `).join("") : `<div class="management-empty">Todavía no hay reparaciones registradas.</div>`;
  repairsList.querySelectorAll("[data-repair-status]").forEach((select) => {
    select.addEventListener("change", () => updateRepairStatus(select.dataset.repairStatus, select.value));
  });
  repairsList.querySelectorAll("[data-load-repair]").forEach((button) => {
    button.addEventListener("click", () => {
      const receipt = managementReceipts.find((item) => item.id === button.dataset.loadRepair);
      loadReceiptIntoForm(receipt);
      setActiveModule("ingresos");
    });
  });
}

async function updateRepairStatus(receiptId, status) {
  try {
    const payload = await boletaApiRequest(`/${encodeURIComponent(receiptId)}/status`, {
      method: "PATCH",
      body: { status },
    });
    const index = managementReceipts.findIndex((receipt) => receipt.id === receiptId);
    if (index >= 0) managementReceipts[index] = payload.receipt;
    renderRepairsList();
  } catch (error) {
    alert(error.message);
    loadManagementReceipts();
  }
}

async function loadStockProducts() {
  if (!stockList) return;
  try {
    const response = await fetch(`${window.location.origin}/api/catalog/bootstrap`);
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "No se pudo cargar el stock.");
    stockProducts = payload.products || [];
    renderStockList();
  } catch (error) {
    stockList.innerHTML = `<div class="management-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderStockList() {
  if (!stockList) return;
  const products = stockProducts.filter((product) => Number(product.stock || 0) > 0 || /pantalla|bater|pin|carga|camara|cámara|tapa|lens|parlante|microfono|micrófono|flex|conector/i.test(`${product.name} ${product.brand} ${product.model}`));
  stockList.innerHTML = products.length ? products.slice(0, 80).map((product) => `
    <article class="management-card">
      <div>
        <strong>${escapeHtml(product.name || "-")}</strong>
        <span>${escapeHtml([product.brand, product.model].filter(Boolean).join(" ") || "Sin modelo")}</span>
        <small>${escapeHtml(product.category || "")}</small>
      </div>
      <div class="stock-pill">Stock: ${Number(product.stock || 0)}</div>
      <div class="stock-price">${escapeHtml(product.currency || "UYU")} ${Number(product.price || 0).toFixed(2)}</div>
    </article>
  `).join("") : `<div class="management-empty">No hay productos de taller o stock disponible.</div>`;
}

async function loadCashSummary() {
  if (!cashList) return;
  await ensureManagementReceipts();
  const total = managementReceipts.reduce((sum, receipt) => sum + parsePrice(receipt.price), 0);
  cashList.innerHTML = `
    <article class="management-card">
      <div>
        <strong>Total presupuestado en boletas</strong>
        <span>${managementReceipts.length} boleta${managementReceipts.length === 1 ? "" : "s"} recientes</span>
      </div>
      <div class="stock-price">UYU ${total.toFixed(2)}</div>
    </article>
    ${managementReceipts.map((receipt) => `
      <article class="management-card">
        <div>
          <strong>${formatReceiptNumber(receipt.number)}</strong>
          <span>${escapeHtml(receipt.clientName || "-")}</span>
        </div>
        <div class="stock-price">${escapeHtml(receipt.price || "-")}</div>
      </article>
    `).join("")}
  `;
}

async function loadClientSummary() {
  if (!clientsList) return;
  await ensureManagementReceipts();
  const byClient = new Map();
  managementReceipts.forEach((receipt) => {
    const key = `${receipt.clientId || ""}|${receipt.clientName || ""}`.toLowerCase();
    const current = byClient.get(key) || { name: receipt.clientName || "-", ci: receipt.clientId || "-", phone: receipt.clientPhone || "-", count: 0, last: receipt };
    current.count += 1;
    current.last = receipt;
    byClient.set(key, current);
  });
  const clients = Array.from(byClient.values());
  clientsList.innerHTML = clients.length ? clients.map((client) => `
    <article class="management-card">
      <div>
        <strong>${escapeHtml(client.name)}</strong>
        <span>CI: ${escapeHtml(client.ci)} | Tel.: ${escapeHtml(client.phone)}</span>
        <small>Última boleta: ${formatReceiptNumber(client.last.number)} | ${escapeHtml(client.last.deviceModel || "-")}</small>
      </div>
      <div class="stock-pill">${client.count} ingreso${client.count === 1 ? "" : "s"}</div>
    </article>
  `).join("") : `<div class="management-empty">Todavía no hay clientes con boletas guardadas.</div>`;
}

async function ensureManagementReceipts() {
  if (managementReceipts.length) return;
  const payload = await boletaApiRequest("");
  managementReceipts = payload.receipts || [];
}

function parsePrice(value) {
  const normalized = String(value || "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function invalidateSavedReceipt() {
  if (!savedReceipt) return;
  savedReceipt = null;
  loadNextReceiptNumber();
}

function setFieldValue(name, value) {
  const field = form.elements[name];
  if (field) field.value = value || "";
}

function setCheckedValues(container, values) {
  const selected = new Set((values || []).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean));
  container.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.checked = selected.has(String(checkbox.value || "").trim().toLowerCase());
  });
}

function ensureLoadedOptions(receipt) {
  const services = Array.isArray(receipt.services) ? receipt.services : [];
  const visualItems = Array.isArray(receipt.visualItems) ? receipt.visualItems : [];
  if (services.length) setServices([...getServices(), ...services]);
  if (visualItems.length) {
    setVisualOptions([...getVisualOptions(), ...visualItems]);
    renderVisualOptions();
  }
}

function loadReceiptIntoForm(receipt) {
  if (!receipt) return;
  savedReceipt = receipt;
  ensureLoadedOptions(receipt);
  receiptNumber.textContent = formatReceiptNumber(receipt.number);
  setFieldValue("clientName", receipt.clientName);
  setFieldValue("clientId", receipt.clientId);
  setFieldValue("clientPhone", receipt.clientPhone);
  setFieldValue("entryDate", receipt.entryDate);
  setFieldValue("deviceBrand", receipt.deviceBrand);
  renderModels();
  setFieldValue("deviceModel", receipt.deviceModel);
  setFieldValue("deviceColor", receipt.deviceColor);
  setFieldValue("reportedIssue", receipt.reportedIssue);
  setFieldValue("deliveryTime", receipt.deliveryTime);
  setFieldValue("deliveryUnit", receipt.deliveryUnit);
  setFieldValue("warrantyOffered", receipt.warrantyOffered);
  setFieldValue("price", receipt.price);
  setFieldValue("cost", receipt.cost);
  setFieldValue("unlockCode", receipt.unlockCode);
  setFieldValue("unlockPassword", receipt.unlockPassword);
  setFieldValue("unlockPattern", receipt.unlockPattern);
  setCheckedValues(serviceChecks, receipt.services);
  setCheckedValues(visualChecks, receipt.visualItems);
  updatePreview();
  document.querySelector(".preview-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPatternPad() {
  patternPad.innerHTML = "";
  for (let point = 1; point <= 9; point += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = point;
    button.className = patternDraft.includes(point) ? "selected" : "";
    button.addEventListener("click", () => {
      if (!patternDraft.includes(point)) patternDraft.push(point);
      patternSequence.textContent = patternDraft.length ? patternDraft.join("-") : "Toca los puntos del patrón";
      renderPatternPad();
    });
    patternPad.append(button);
  }
}

function openPatternDialog() {
  patternDraft = parsePattern(getFieldValue("unlockPattern"));
  patternSequence.textContent = patternDraft.length ? patternDraft.join("-") : "Toca los puntos del patrón";
  renderPatternPad();
  if (typeof patternDialog.showModal === "function") patternDialog.showModal();
  else patternDialog.setAttribute("open", "");
}

form.addEventListener("input", () => {
  invalidateSavedReceipt();
  updatePreview();
});
form.addEventListener("change", () => {
  invalidateSavedReceipt();
  updatePreview();
});
form.elements.deviceBrand.addEventListener("input", renderModels);
form.elements.deviceBrand.addEventListener("change", () => {
  learnCurrentBrandAndModel();
  autofillPriceFromCatalog();
});
form.elements.deviceBrand.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const action = String(prompt("Marca: escribe \"editar\" o \"eliminar\":") || "").trim().toLowerCase();
  if (action === "editar") editCurrentBrand();
  if (action === "eliminar") deleteCurrentBrand();
});
form.elements.deviceModel.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const action = String(prompt("Modelo: escribe \"editar\" o \"eliminar\":") || "").trim().toLowerCase();
  if (action === "editar") editCurrentModel();
  if (action === "eliminar") deleteCurrentModel();
});
form.elements.deviceModel.addEventListener("focus", showModelPicker);
form.elements.deviceModel.addEventListener("click", showModelPicker);
form.elements.deviceModel.addEventListener("input", () => {
  renderModels();
  showModelPicker();
});
form.elements.deviceModel.addEventListener("change", () => {
  learnCurrentBrandAndModel();
  autofillPriceFromCatalog();
});
form.elements.price.addEventListener("input", () => {
  if (!form.elements.price.dataset.autofilled) return;
  delete form.elements.price.dataset.autofilled;
  if (priceSuggestion) priceSuggestion.textContent = "Precio ajustado manualmente.";
});
serviceSearch?.addEventListener("input", filterServiceOptions);
servicePriceEditor?.addEventListener("input", (event) => {
  const input = event.target.closest("[data-service-line-price]");
  if (!input) return;
  const value = String(input.value || "").trim();
  if (value === "") servicePriceOverrides.delete(input.dataset.serviceLinePrice);
  else servicePriceOverrides.set(input.dataset.serviceLinePrice, Number(value));
  input.closest(".service-price-row")?.classList.toggle("manual-price", true);
  input.closest(".service-price-row")?.classList.remove("catalog-price");
  const hint = input.closest(".service-price-row")?.querySelector("small");
  if (hint) hint.textContent = "Precio manual";
  updateTotalFromServicePrices();
});
serviceSearch?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const firstVisible = [...serviceChecks.querySelectorAll(".check-option")].find((label) => !label.hidden);
  const checkbox = firstVisible?.querySelector("input[type='checkbox']");
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
});
selectedServicesPanel?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-selected-service]");
  if (!button) return;
  const checkbox = [...serviceChecks.querySelectorAll("input[type='checkbox']")]
    .find((item) => item.value === button.dataset.removeSelectedService);
  if (!checkbox) return;
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
});
servicePickerDone?.addEventListener("click", () => {
  if (serviceDropdown) serviceDropdown.open = false;
});
serviceDropdown?.addEventListener("toggle", () => {
  if (!serviceDropdown.open) return;
  if (serviceSearch) {
    serviceSearch.value = "";
    filterServiceOptions();
    window.setTimeout(() => serviceSearch.focus(), 0);
  }
});
document.addEventListener("click", (event) => {
  if (serviceDropdown?.open && !event.target.closest(".service-dropdown")) serviceDropdown.open = false;
});
moduleTabs.forEach((button) => {
  button.addEventListener("click", () => setActiveModule(button.dataset.moduleTab));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".model-field")) modelPicker.hidden = true;
});
printBtn?.addEventListener("click", printReceipt);
saveBtn?.addEventListener("click", saveReceiptOnly);
clearBtn.addEventListener("click", clearForm);
editTermsBtn.addEventListener("click", openTermsEditor);
refreshRepairsBtn?.addEventListener("click", loadManagementReceipts);
refreshStockBtn?.addEventListener("click", loadStockProducts);
refreshCashBtn?.addEventListener("click", loadCashSummary);
refreshClientsBtn?.addEventListener("click", loadClientSummary);
addModelBtn.addEventListener("click", addCurrentModel);
addServiceBtn.addEventListener("click", addCurrentService);
addVisualBtn.addEventListener("click", addVisualOption);
searchBtn?.addEventListener("click", searchReceiptsInDatabase);
searchBox?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchReceiptsInDatabase();
  }
});
drawPatternBtn.addEventListener("click", openPatternDialog);
clearPatternBtn.addEventListener("click", () => {
  patternDraft = [];
  patternSequence.textContent = "Toca los puntos del patrón";
  renderPatternPad();
});
savePatternBtn.addEventListener("click", () => {
  form.elements.unlockPattern.value = patternDraft.join("-");
  if (typeof patternDialog.close === "function") patternDialog.close();
  else patternDialog.removeAttribute("open");
  updatePreview();
});

saveTermsBtn.addEventListener("click", () => {
  setTerms(termsEditor.value);
  closeTermsEditor();
});

resetTermsBtn.addEventListener("click", () => {
  termsEditor.value = DEFAULT_TERMS;
  setTerms(DEFAULT_TERMS);
});

async function init() {
  renderBrands();
  renderModels();
  renderServices();
  renderVisualOptions();
  fillDefaultDate();
  await loadNextReceiptNumber();
  setTerms(getTerms());
  updatePreview();
  if (IS_EMBEDDED_IN_GESTION) {
    await loadGestionClients();
  }
  if (BOLETA_INITIAL_QUERY) {
    if (!searchBox) return;
    searchBox.value = BOLETA_INITIAL_QUERY;
    const results = await searchReceiptsInDatabase();
    const exactReceipt = results.find((receipt) => String(receipt.number || "") === String(BOLETA_INITIAL_QUERY).trim()) || results[0];
    if (exactReceipt) loadReceiptIntoForm(exactReceipt);
  }
}

window.printReceipt = printReceipt;
window.saveReceiptOnly = saveReceiptOnly;
window.collectReceiptPayload = collectReceiptPayload;

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "SG_COLLECT_RECEIPT") return;
  try {
    event.source?.postMessage({
      type: "SG_RECEIPT_PAYLOAD",
      requestId: data.requestId,
      payload: collectReceiptPayload(),
    }, "*");
  } catch (error) {
    event.source?.postMessage({
      type: "SG_RECEIPT_PAYLOAD",
      requestId: data.requestId,
      error: error.message || "No se pudo leer la boleta.",
    }, "*");
  }
});
window.clearReceiptForm = clearForm;
window.hasReceiptDraft = hasReceiptDraft;

init();
