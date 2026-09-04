const STORAGE_KEY = "sistema-gestion-data-v1";
const CAPITAL_INITIAL_KEY = "sistema-gestion-capital-inicial-v1";
const ACCOUNTING_STATE_KEY = "sistema-gestion-accounting-state-v1";
const MENU_CONFIG_KEY = "sistema-gestion-menu-v1";
const SAVE_META_KEY = "sistema-gestion-last-save-v1";
const PRODUCT_CATEGORY_ORDER_KEY = "sistema-gestion-stock-category-order-v1";
const FIXED_EXPENSE_NAMES_KEY = "sistema-gestion-fixed-expense-names-v1";
const PHONE_BRANDS_KEY = "beim_boleta_marcas_v1";
const PHONE_MODELS_KEY = "beim_boleta_modelos_v1";
const PURCHASE_SUPPLIERS_KEY = "sistema-gestion-purchase-suppliers-v1";
const CATEGORY_TREE_KEY = "sistema-gestion-category-tree-v1";
const SIDEBAR_COLLAPSED_KEY = "sistema-gestion-sidebar-collapsed";
const LAST_SERVER_BACKUP_KEY = "sistema-gestion-last-server-backup-v1";
const REPORT_EXPENSE_CATEGORIES_RESET_KEY = "sistema-gestion-report-expense-categories-reset-v1";
const REPORT_EXPENSE_CATEGORIES_CLEAR_KEY = "sistema-gestion-report-expense-categories-clear-v2";
const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PHONE_BRANDS = ["Samsung", "Apple", "Xiaomi", "Motorola", "Huawei", "Honor", "Oppo", "Realme", "Vivo", "Nokia", "LG", "Sony", "Tecno", "Infinix", "ZTE", "OnePlus"];
const DEFAULT_PHONE_MODELS = [
  ["Samsung", "A01"], ["Samsung", "A02"], ["Samsung", "A03"], ["Samsung", "A04"], ["Samsung", "A05"], ["Samsung", "A10"], ["Samsung", "A12"], ["Samsung", "A13"], ["Samsung", "A14"], ["Samsung", "A15"], ["Samsung", "A20"], ["Samsung", "A21s"], ["Samsung", "A22"], ["Samsung", "A23"], ["Samsung", "A24"], ["Samsung", "A30"], ["Samsung", "A32"], ["Samsung", "A34"], ["Samsung", "A50"], ["Samsung", "A51"], ["Samsung", "A52"], ["Samsung", "A53"], ["Samsung", "A54"], ["Samsung", "S20"], ["Samsung", "S21"], ["Samsung", "S22"], ["Samsung", "S23"], ["Samsung", "S24"],
  ["Apple", "iPhone 6"], ["Apple", "iPhone 7"], ["Apple", "iPhone 8"], ["Apple", "iPhone X"], ["Apple", "iPhone XR"], ["Apple", "iPhone XS"], ["Apple", "iPhone 11"], ["Apple", "iPhone 12"], ["Apple", "iPhone 13"], ["Apple", "iPhone 14"], ["Apple", "iPhone 15"], ["Apple", "iPhone 16"],
  ["Xiaomi", "Redmi 9"], ["Xiaomi", "Redmi 10"], ["Xiaomi", "Redmi 12"], ["Xiaomi", "Redmi 13C"], ["Xiaomi", "Redmi Note 8"], ["Xiaomi", "Redmi Note 9"], ["Xiaomi", "Redmi Note 10"], ["Xiaomi", "Redmi Note 11"], ["Xiaomi", "Redmi Note 12"], ["Xiaomi", "Redmi Note 13"], ["Xiaomi", "Poco X3"], ["Xiaomi", "Poco X5"],
  ["Motorola", "Moto E7"], ["Motorola", "Moto E13"], ["Motorola", "Moto E20"], ["Motorola", "Moto E22"], ["Motorola", "Moto G8"], ["Motorola", "Moto G9"], ["Motorola", "Moto G20"], ["Motorola", "Moto G22"], ["Motorola", "Moto G30"], ["Motorola", "Moto G32"], ["Motorola", "Moto G50"], ["Motorola", "Moto G60"],
  ["Huawei", "P20"], ["Huawei", "P30"], ["Huawei", "P40"], ["Huawei", "Y5"], ["Huawei", "Y6"], ["Huawei", "Y7"], ["Huawei", "Y9"],
  ["Honor", "X7"], ["Honor", "X8"], ["Honor", "X9"], ["Oppo", "A15"], ["Oppo", "A16"], ["Oppo", "A54"], ["Realme", "C11"], ["Realme", "C21"], ["Realme", "C35"], ["Vivo", "Y11"], ["Vivo", "Y20"], ["Vivo", "Y21"], ["Tecno", "Spark 8"], ["Tecno", "Spark 10"], ["Infinix", "Hot 10"], ["Infinix", "Hot 11"], ["Nokia", "C20"], ["LG", "K40"], ["Sony", "Xperia"], ["ZTE", "Blade A5"], ["OnePlus", "Nord"]
];
const BEIM_WEBSITE_URL = "http://127.0.0.1:3000/beim/";
const GESTION_API_URL = "http://127.0.0.1:3000/api/gestion";
const TABLE_ROW_LIMIT = 10;
const WORKSHOP_PRODUCT_SCOPE = "workshop";
const WEB_PRODUCT_SCOPE = "web";
const FINISHED_ORDER_STATUSES = ["Finalizado", "Entregado", "Cancelado"];
const FINISHED_ORDERS_RESET_HOUR = 9;

const demoData = {
  clients: [
    { id: "c1", name: "Cliente Mostrador", document: "-", phone: "Sin telefono", email: "mostrador@local" },
    { id: "c2", name: "Ana Perez", document: "12345678", phone: "1122334455", email: "ana@email.com" },
    { id: "c3", name: "Carlos Lopez", document: "87654321", phone: "1198765432", email: "carlos@email.com" }
  ],
  orders: [
    {
      id: "o1",
      number: "OT-0001",
      clientId: "c2",
      clientName: "Ana Perez",
      clientDocument: "12345678",
      device: "Notebook",
      brand: "Lenovo IdeaPad",
      problem: "No enciende y el cliente entrega cargador.",
      diagnosis: "Pendiente de diagnostico.",
      status: "En diagnostico",
      serviceItems: [],
      budget: 0,
      paid: 0,
      date: today()
    },
    {
      id: "o2",
      number: "OT-0002",
      clientId: "c3",
      clientName: "Carlos Lopez",
      clientDocument: "87654321",
      device: "PC escritorio",
      brand: "Armada",
      problem: "Lenta, solicita limpieza e instalacion.",
      diagnosis: "Disco con fallas, se presupuesta SSD.",
      status: "Presupuestado",
      serviceItems: [
        { description: "Instalacion de SSD y puesta a punto", price: 42000, approvalStatus: "Pendiente" }
      ],
      budget: 42000,
      paid: 10000,
      date: today()
    }
  ],
  productCategories: [
    { id: "cat1", name: "General" },
    { id: "cat2", name: "Componentes" },
    { id: "cat3", name: "Servicios" }
  ],
  products: [
    { id: "p1", categoryId: "cat3", brand: "BEIM", model: "Servicio tecnico", color: "-", costPrice: 0, salePrice: 18000, name: "BEIM Servicio tecnico", price: 18000, stock: 12 },
    { id: "p2", categoryId: "cat2", brand: "Kingston", model: "SSD 480GB", color: "Negro", costPrice: 7200, salePrice: 9500, name: "Kingston SSD 480GB Negro", price: 9500, stock: 4 },
    { id: "p3", categoryId: "cat1", brand: "Generico", model: "Producto B", color: "-", costPrice: 9000, salePrice: 12500, name: "Generico Producto B", price: 12500, stock: 18 }
  ],
  sales: [
    { id: "s1", clientId: "c2", productId: "p1", quantity: 1, total: 18000, date: today() },
    { id: "s2", clientId: "c3", productId: "p3", quantity: 2, total: 25000, date: today() }
  ],
  expenses: [
    { id: "e1", concept: "Internet", amount: 15000, date: today() },
    { id: "e2", concept: "Insumos", amount: 8200, date: today() }
  ]
};

let state = loadState();
let accountingState = loadAccountingState();
let financialStatePersistTimer = null;
let financialStateLoaded = false;
let preferencesNeedMigration = false;

function loadAccountingState() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(ACCOUNTING_STATE_KEY) || "{}"); } catch { saved = {}; }
  return {
    openingBalances: { cash: Number(saved.openingBalances?.cash || 0), bank: Number(saved.openingBalances?.bank || 0), card: Number(saved.openingBalances?.card || 0), wallet: Number(saved.openingBalances?.wallet || 0) },
    treasuryMovements: Array.isArray(saved.treasuryMovements) ? saved.treasuryMovements : [],
    payables: Array.isArray(saved.payables) ? saved.payables : []
  };
}

function saveAccountingState() { localStorage.setItem(ACCOUNTING_STATE_KEY, JSON.stringify(accountingState)); }

function parseStoredJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }

function buildPersistentPreferences() {
  return {
    stockCategoryOrder: parseStoredJson(PRODUCT_CATEGORY_ORDER_KEY, []),
    fixedExpenseNames: parseStoredJson(FIXED_EXPENSE_NAMES_KEY, []),
    phoneBrands: parseStoredJson(PHONE_BRANDS_KEY, []),
    phoneModels: parseStoredJson(PHONE_MODELS_KEY, []),
    purchaseSuppliers: parseStoredJson(PURCHASE_SUPPLIERS_KEY, []),
    categoryTree: parseStoredJson(CATEGORY_TREE_KEY, {}),
    sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  };
}

function applyPersistentPreferences(preferences) {
  if (!preferences || typeof preferences !== "object") return;
  const mappings = [[PRODUCT_CATEGORY_ORDER_KEY,preferences.stockCategoryOrder],[FIXED_EXPENSE_NAMES_KEY,preferences.fixedExpenseNames],[PHONE_BRANDS_KEY,preferences.phoneBrands],[PHONE_MODELS_KEY,preferences.phoneModels],[PURCHASE_SUPPLIERS_KEY,preferences.purchaseSuppliers],[CATEGORY_TREE_KEY,preferences.categoryTree]];
  mappings.forEach(([key,value]) => {
    if (value == null) return;
    const localValue = parseStoredJson(key, Array.isArray(value) ? [] : {});
    const remoteEmpty = Array.isArray(value) ? value.length === 0 : typeof value === "object" && Object.keys(value).length === 0;
    const localHasData = Array.isArray(localValue) ? localValue.length > 0 : localValue && typeof localValue === "object" && Object.keys(localValue).length > 0;
    if (remoteEmpty && localHasData) { preferencesNeedMigration = true; return; }
    localStorage.setItem(key, JSON.stringify(value));
  });
  if (typeof preferences.sidebarCollapsed === "boolean") localStorage.setItem(SIDEBAR_COLLAPSED_KEY, preferences.sidebarCollapsed ? "1" : "0");
}

let globalSearchTerm = "";
let orderStatusFilter = "all";
let selectedProductCategoryId = "all";
let saleCart = [];
let cashSessions = [];
let currentManagementUser = null;
let managementRolePermissions = {};
const MANAGEMENT_VIEWS = [
  ["dashboard", "Dashboard"], ["orders", "Órdenes"], ["newOrder", "Crear orden"],
  ["clients", "Clientes"], ["products", "Stock"], ["sales", "Ventas"],
  ["expenses", "Compras"], ["services", "Servicios"], ["cash", "Caja"],
  ["settings", "Configuración"], ["menuCategory", "Servicios administrativos"], ["openWebsite", "Abrir Web Beim"]
];
const DEFAULT_ROLE_PERMISSIONS = {
  administrador_principal: ["*"],
  administrador: ["dashboard", "orders", "newOrder", "clients", "products", "sales", "expenses", "services", "cash", "reports", "menuCategory", "openWebsite"],
  vendedor: ["dashboard", "orders", "newOrder", "clients", "products", "sales", "openWebsite"],
  tecnico: ["dashboard", "orders", "newOrder", "clients", "products", "services", "openWebsite"],
  caja: ["dashboard", "orders", "clients", "sales", "cash", "menuCategory", "openWebsite"]
};
let managementNeedsSetup = false;
let stockSubmenuExpanded = false;
let selectedMenuCategoryId = "";
let menuCardClickTimer = null;
let reportSubcategoryEditorOpen = false;
let adminPeriodMode = "month";
let adminSpecificDay = today();
let adminSpecificMonth = currentAccountingMonth();
let activeView = "dashboard";
let returnAfterOrderView = "dashboard";
let lastSidebarView = "dashboard";
let apiOnline = false;
let isSavingReceipt = false;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

const views = {
  dashboard: "Dashboard",
  orders: "Ordenes",
  newOrder: "Nueva orden",
  clients: "Clientes",
  products: "Stock del taller",
  sales: "Ventas",
  expenses: "Compras",
  services: "Servicios",
  cash: "Caja diaria",
  reports: "Informes",
  menuCategory: "Categoría",
  settings: "Configuración"
};

const defaultMenuItems = [
  { id: "module-dashboard", label: "Dashboard", view: "dashboard", parentId: "", order: 0 },
  { id: "module-orders", label: "Ordenes", view: "orders", parentId: "", order: 1 },
  { id: "module-clients", label: "Clientes", view: "clients", parentId: "", order: 2 },
  { id: "module-products", label: "Stock taller", view: "products", parentId: "", order: 3 },
  { id: "module-sales", label: "Ventas", view: "sales", parentId: "", order: 4 },
  { id: "module-expenses", label: "Compras", view: "expenses", parentId: "", order: 5 },
  { id: "module-services", label: "Servicios", view: "services", parentId: "", order: 6 },
  { id: "module-cash", label: "Caja diaria", view: "cash", parentId: "", order: 7 },
  { id: "module-reports", label: "Informes", view: "reports", parentId: "", order: 8 },
  { id: "module-settings", label: "Configuración", view: "settings", parentId: "", order: 7 }
];

let menuItems = loadMenuItems();
saveMenuItems();

function loadMenuItems() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(MENU_CONFIG_KEY) || "[]"); } catch { saved = []; }
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const builtins = defaultMenuItems.map((item) => ({ ...item, ...savedById.get(item.id), view: item.view }));
  const custom = saved.filter((item) => !defaultMenuItems.some((builtin) => builtin.id === item.id) && !item.view);
  const items = [...builtins, ...custom].map((item, index) => ({
    ...item,
    parentId: item.parentId || "",
    order: Number(item.order ?? index),
    colorHue: Number.isFinite(Number(item.colorHue)) ? Number(item.colorHue) : Math.round((index * 137.508) % 360)
  }));
  const administrativeCategory = items.find((item) => !item.view && normalizedMenuLabel(item.label).includes("servicios administrativos"));
  const reportsModule = items.find((item) => item.id === "module-reports");
  if (administrativeCategory && reportsModule) {
    const reportPlaceholder = items.find((item) => item.id !== reportsModule.id
      && item.parentId === administrativeCategory.id
      && /^reportes?$/.test(normalizedMenuLabel(item.label)));
    if (reportPlaceholder) {
      reportsModule.colorHue = reportPlaceholder.colorHue;
      items.filter((item) => item.parentId === reportPlaceholder.id).forEach((item) => { item.parentId = reportsModule.id; });
      items.splice(items.indexOf(reportPlaceholder), 1);
    }
    items.filter((item) => item.parentId === administrativeCategory.id && item.id !== reportsModule.id)
      .forEach((item) => { item.parentId = reportsModule.id; });
    reportsModule.parentId = administrativeCategory.parentId || "";
    reportsModule.order = administrativeCategory.order;
    reportsModule.colorHue = reportsModule.colorHue || administrativeCategory.colorHue;
    items.splice(items.indexOf(administrativeCategory), 1);
    reportsModule.label = "Informes";
  }
  if (reportsModule) {
    const financeRootPattern = /^(ingresos?|gastos?|utilidades?|efectivo en caja)$/;
    items.filter((item) => !item.view && item.id !== reportsModule.id && financeRootPattern.test(normalizedMenuLabel(item.label)))
      .filter((item) => !items.some((candidate) => candidate.id === item.parentId) || item.parentId === "")
      .forEach((item) => { item.parentId = reportsModule.id; });
    reportsModule.parentId = "";
    reportsModule.label = "Informes";
    const expensesRoot = items.find((item) => !item.view && normalizedMenuLabel(item.label) === "gastos");
    if (expensesRoot) {
      expensesRoot.parentId = reportsModule.id;
      const expenseCategoryPattern = /^(gastos? fijos?|comida|cadete|envios?|otros?( gastos?)?)$/;
      const existingChildren = items.filter((item) => item.parentId === expensesRoot.id);
      items.filter((item) => !item.view && item.id !== expensesRoot.id && expenseCategoryPattern.test(normalizedMenuLabel(item.label)))
        .forEach((item) => {
          if (item.parentId === expensesRoot.id) return;
          item.parentId = expensesRoot.id;
          item.order = existingChildren.length;
          existingChildren.push(item);
        });
      items.filter((item) => item.parentId === expensesRoot.id)
        .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "es"))
        .forEach((item, order) => { item.order = order; });
    }
    [
      { id: "report-root-income", label: "Ingresos", order: 0, colorHue: 158 },
      { id: "report-root-expenses", label: "Gastos", order: 1, colorHue: 2 },
      { id: "report-root-utility", label: "Utilidades", order: 2, colorHue: 217 },
      { id: "report-root-sales", label: "Ventas", order: 3, colorHue: 190 }
    ].forEach((root) => {
      const pattern = root.id === "report-root-income" ? /^ingresos?$/ : root.id === "report-root-expenses" ? /^gastos?$/ : root.id === "report-root-sales" ? /^ventas?$/ : /^utilidades?$/;
      const existing = items.find((item) => !item.view && pattern.test(normalizedMenuLabel(item.label)));
      if (existing) {
        existing.parentId = reportsModule.id;
        existing.order = root.order;
      } else {
        items.push({ ...root, view: "", parentId: reportsModule.id });
      }
    });
    const removalExpensesRoot = items.find((item) => item.parentId === reportsModule.id && !item.view && /^gastos?$/.test(normalizedMenuLabel(item.label)));
    const purchasesCategory = removalExpensesRoot
      ? items.find((item) => item.parentId === removalExpensesRoot.id && !item.view && /^compras?$/.test(normalizedMenuLabel(item.label)))
      : null;
    if (purchasesCategory) {
      const removeIds = new Set([purchasesCategory.id]);
      const collectChildren = (parentId) => items.filter((item) => item.parentId === parentId).forEach((item) => {
        if (removeIds.has(item.id)) return;
        removeIds.add(item.id);
        collectChildren(item.id);
      });
      collectChildren(purchasesCategory.id);
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (removeIds.has(items[index].id)) items.splice(index, 1);
      }
    }
  }
  try {
    if (!localStorage.getItem(REPORT_EXPENSE_CATEGORIES_RESET_KEY)) {
      const expensesRoot = items.find((item) => !item.view && normalizedMenuLabel(item.label) === "gastos");
      if (expensesRoot) {
        const removeIds = new Set();
        const collectChildren = (parentId) => items.filter((item) => item.parentId === parentId).forEach((item) => {
          if (removeIds.has(item.id)) return;
          removeIds.add(item.id);
          collectChildren(item.id);
        });
        collectChildren(expensesRoot.id);
        for (let index = items.length - 1; index >= 0; index -= 1) {
          if (removeIds.has(items[index].id)) items.splice(index, 1);
        }
      }
      localStorage.setItem(REPORT_EXPENSE_CATEGORIES_RESET_KEY, new Date().toISOString());
    }
  } catch {}
  try {
    if (!localStorage.getItem(REPORT_EXPENSE_CATEGORIES_CLEAR_KEY)) {
      const expensesRoot = items.find((item) => item.parentId === "module-reports" && !item.view && /^gastos?$/.test(normalizedMenuLabel(item.label)));
      if (expensesRoot) {
        const removeIds = new Set();
        const collectChildren = (parentId) => items.filter((item) => item.parentId === parentId).forEach((item) => {
          if (removeIds.has(item.id)) return;
          removeIds.add(item.id);
          collectChildren(item.id);
        });
        collectChildren(expensesRoot.id);
        for (let index = items.length - 1; index >= 0; index -= 1) {
          if (removeIds.has(items[index].id)) items.splice(index, 1);
        }
      }
      localStorage.setItem(REPORT_EXPENSE_CATEGORIES_CLEAR_KEY, new Date().toISOString());
    }
  } catch {}
  return items;
}

function saveMenuItems() {
  localStorage.setItem(MENU_CONFIG_KEY, JSON.stringify(menuItems));
}

function orderedMenuItems() {
  const result = [];
  const append = (parentId, depth, ancestry = new Set()) => {
    menuItems.filter((item) => item.parentId === parentId && !ancestry.has(item.id))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es"))
      .forEach((item) => {
        result.push({ item, depth });
        append(item.id, depth + 1, new Set([...ancestry, item.id]));
      });
  };
  append("", 0);
  menuItems.filter((item) => !result.some((entry) => entry.item.id === item.id)).forEach((item) => result.push({ item, depth: 0 }));
  return result;
}

function menuDescendantIds(itemId) {
  const result = [];
  const visit = (parentId) => menuItems.filter((item) => item.parentId === parentId).forEach((item) => {
    if (result.includes(item.id)) return;
    result.push(item.id);
    visit(item.id);
  });
  visit(itemId);
  return result;
}

function menuChildrenMarkup(parentId) {
  return menuItems.filter((item) => item.parentId === parentId && canAccessManagementView(item.view || "menuCategory"))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es"))
    .map((item) => {
      const children = menuItems.some((candidate) => candidate.parentId === item.id);
      const showChildrenInSidebar = children && Boolean(item.view) && item.id !== "module-reports" && item.id !== "module-products";
      const button = item.view
        ? item.view === "products"
          ? `<button class="nav-button nav-stock-toggle" data-view="products" type="button" aria-controls="sidebarProductCategories" aria-expanded="${stockSubmenuExpanded ? "true" : "false"}"><span>${escapeHtml(item.label)}</span><span class="menu-chevron" aria-hidden="true">›</span></button>`
          : `<button class="nav-button" data-view="${item.view}" type="button">${escapeHtml(item.label)}</button>`
        : `<button class="nav-group-button" data-menu-group="${item.id}" type="button"><span>${escapeHtml(item.label)}</span><span class="menu-chevron">›</span></button>`;
      const stockCategories = item.view === "products" ? `<div class="sidebar-subnav" id="sidebarProductCategories"></div>` : "";
      return `<div class="menu-node${showChildrenInSidebar ? " has-children open" : ""}" data-menu-node="${item.id}">${button}${stockCategories}${showChildrenInSidebar ? `<div class="menu-children">${menuChildrenMarkup(item.id)}</div>` : ""}</div>`;
    }).join("");
}

function renderSidebarMenu() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  nav.innerHTML = menuChildrenMarkup("");
  nav.querySelectorAll(".nav-button,.nav-group-button").forEach((button) => {
    const label = button.textContent.trim();
    button.dataset.short = label.slice(0, 2).toUpperCase();
    button.title = label;
  });
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  renderSidebarProductCategories();
}

function menuParentOptions(selectedId = "", excludedIds = []) {
  const options = orderedMenuItems().filter(({ item }) => !excludedIds.includes(item.id))
    .map(({ item, depth }) => `<option value="${item.id}"${item.id === selectedId ? " selected" : ""}>${"— ".repeat(depth)}${escapeHtml(item.label)}</option>`).join("");
  return `<option value=""${selectedId ? "" : " selected"}>Nivel principal</option>${options}`;
}

function renderMenuSettings() {
  const form = document.getElementById("menuItemForm");
  const tree = document.getElementById("menuSettingsTree");
  if (!form || !tree) return;
  updateAutosaveStatus();
  const selectedParent = form.elements.parentId.value;
  form.elements.parentId.innerHTML = menuParentOptions(selectedParent);
  const hiddenReportCategories = new Set(menuDescendantIds("module-reports"));
  tree.innerHTML = orderedMenuItems().filter(({ item }) => !hiddenReportCategories.has(item.id)).map(({ item, depth }) => {
    const excluded = [item.id, ...menuDescendantIds(item.id)];
    const isCustom = !item.view;
    const reportEditor = item.id === "module-reports" && reportSubcategoryEditorOpen ? `<div class="report-inline-editor">
      <div class="report-inline-editor-head"><div><strong>Subcategorías de Informes</strong><small>Crea, elimina o cambia de posición cada elemento.</small></div><button class="row-action" type="button" data-close-report-editor>Cerrar</button></div>
      <form class="settings-category-form" id="reportCategoryForm">
        <input name="label" placeholder="Nombre de la subcategoría" required>
        <select name="parentId" aria-label="Ubicación de la subcategoría"></select>
        <button type="submit">Crear</button>
      </form>
      <div class="settings-category-tree" id="reportCategoryTree"></div>
    </div>` : "";
    return `<div class="settings-category-row" style="margin-left:${Math.min(depth, 5) * 22}px">
      <input value="${escapeHtml(item.label)}" data-menu-label="${item.id}" aria-label="Nombre de ${escapeHtml(item.label)}">
      <select data-menu-parent="${item.id}" aria-label="Ubicación de ${escapeHtml(item.label)}">${menuParentOptions(item.parentId, excluded)}</select>
      <div class="settings-category-actions">
        <button class="row-action menu-add-child" type="button" data-menu-add-child="${item.id}" title="Crear una subcategoría dentro de ${escapeHtml(item.label)}">+ Subcategoría</button>
        <button class="row-action" type="button" data-menu-up="${item.id}" title="Subir">↑</button>
        <button class="row-action" type="button" data-menu-down="${item.id}" title="Bajar">↓</button>
        ${isCustom ? `<button class="row-action" type="button" data-menu-delete="${item.id}">Eliminar</button>` : ""}
      </div>
    </div>${reportEditor}`;
  }).join("");
  tree.querySelectorAll("[data-menu-label]").forEach((input) => input.addEventListener("change", () => updateMenuLabel(input.dataset.menuLabel, input.value)));
  tree.querySelectorAll("[data-menu-parent]").forEach((select) => select.addEventListener("change", () => moveMenuItem(select.dataset.menuParent, select.value)));
  tree.querySelectorAll("[data-menu-add-child]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.menuAddChild === "module-reports") {
      reportSubcategoryEditorOpen = true;
      renderMenuSettings();
      prepareReportSubcategory("module-reports");
      return;
    }
    prepareMenuSubcategory(button.dataset.menuAddChild);
  }));
  tree.querySelectorAll("[data-menu-up]").forEach((button) => button.addEventListener("click", () => reorderMenuItem(button.dataset.menuUp, -1)));
  tree.querySelectorAll("[data-menu-down]").forEach((button) => button.addEventListener("click", () => reorderMenuItem(button.dataset.menuDown, 1)));
  tree.querySelectorAll("[data-menu-delete]").forEach((button) => button.addEventListener("click", () => deleteMenuGroup(button.dataset.menuDelete)));
  tree.querySelector("[data-close-report-editor]")?.addEventListener("click", () => {
    reportSubcategoryEditorOpen = false;
    renderMenuSettings();
  });
  if (reportSubcategoryEditorOpen) renderReportCategorySettings();
  tree.onclick = (event) => {
    if (!reportSubcategoryEditorOpen || event.target.closest(".report-inline-editor")) return;
    const reportButton = event.target.closest('[data-menu-add-child="module-reports"]');
    if (reportButton) return;
    reportSubcategoryEditorOpen = false;
    queueMicrotask(renderMenuSettings);
  };
}

function reportCategoryEntries() {
  const result = [];
  const visit = (parentId, depth, ancestry = new Set()) => {
    menuItems.filter((item) => item.parentId === parentId && !ancestry.has(item.id))
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "es"))
      .forEach((item) => {
        result.push({ item, depth });
        visit(item.id, depth + 1, new Set([...ancestry, item.id]));
      });
  };
  visit("module-reports", 0);
  return result;
}

function reportCategoryParentOptions(selectedId = "module-reports", excludedIds = []) {
  const entries = reportCategoryEntries().filter(({ item }) => !excludedIds.includes(item.id));
  return `<option value="module-reports"${selectedId === "module-reports" ? " selected" : ""}>Informes</option>${entries.map(({ item, depth }) => `<option value="${item.id}"${item.id === selectedId ? " selected" : ""}>${"— ".repeat(depth + 1)}${escapeHtml(item.label)}</option>`).join("")}`;
}

function reportCategoryCascadeMarkup(parentId, visited = new Set()) {
  return menuItems.filter((item) => item.parentId === parentId && !visited.has(item.id))
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "es"))
    .map((item) => {
      const nextVisited = new Set([...visited, item.id]);
      const children = menuItems.filter((candidate) => candidate.parentId === item.id);
      const excluded = [item.id, ...menuDescendantIds(item.id)];
      return `<div class="report-config-node${children.length ? " has-children" : ""}">
        <div class="report-config-card">
          <div class="report-config-name">
            <input value="${escapeHtml(item.label)}" data-report-label="${item.id}" aria-label="Nombre de ${escapeHtml(item.label)}">
            ${children.length ? `<span class="report-config-chevron" aria-hidden="true">›</span>` : ""}
          </div>
          <select data-report-parent="${item.id}" aria-label="Cambiar ubicación de ${escapeHtml(item.label)}">${reportCategoryParentOptions(item.parentId, excluded)}</select>
          <div class="report-config-actions">
            <button class="row-action" type="button" data-report-up="${item.id}" title="Subir posición">↑</button>
            <button class="row-action" type="button" data-report-down="${item.id}" title="Bajar posición">↓</button>
            <button class="row-action menu-add-child" type="button" data-report-add-child="${item.id}">+ Subcategoría</button>
            <button class="row-action report-delete-action" type="button" data-report-delete="${item.id}">Eliminar</button>
          </div>
        </div>
        ${children.length ? `<div class="report-config-children">${reportCategoryCascadeMarkup(item.id, nextVisited)}</div>` : ""}
      </div>`;
    }).join("");
}

function renderReportCategorySettings() {
  const form = document.getElementById("reportCategoryForm");
  const tree = document.getElementById("reportCategoryTree");
  if (!form || !tree) return;
  form.onsubmit = createReportCategory;
  const selectedParent = form.elements.parentId.value || "module-reports";
  form.elements.parentId.innerHTML = reportCategoryParentOptions(selectedParent);
  const entries = reportCategoryEntries();
  tree.innerHTML = entries.length ? `<div class="report-settings-cascade">${reportCategoryCascadeMarkup("module-reports")}</div>` : `<p class="empty">Todavía no hay subcategorías dentro de Informes.</p>`;
  tree.querySelectorAll("[data-report-label]").forEach((input) => input.addEventListener("change", () => updateMenuLabel(input.dataset.reportLabel, input.value)));
  tree.querySelectorAll("[data-report-parent]").forEach((select) => select.addEventListener("change", () => moveMenuItem(select.dataset.reportParent, select.value)));
  tree.querySelectorAll("[data-report-add-child]").forEach((button) => button.addEventListener("click", () => prepareReportSubcategory(button.dataset.reportAddChild)));
  tree.querySelectorAll("[data-report-up]").forEach((button) => button.addEventListener("click", () => reorderMenuItem(button.dataset.reportUp, -1)));
  tree.querySelectorAll("[data-report-down]").forEach((button) => button.addEventListener("click", () => reorderMenuItem(button.dataset.reportDown, 1)));
  tree.querySelectorAll("[data-report-delete]").forEach((button) => button.addEventListener("click", () => deleteMenuGroup(button.dataset.reportDelete)));
}

function prepareReportSubcategory(parentId) {
  const form = document.getElementById("reportCategoryForm");
  const parent = menuItems.find((item) => item.id === parentId);
  if (!form || !parent) return;
  form.elements.parentId.value = parentId;
  form.elements.label.value = "";
  form.elements.label.placeholder = `Nueva subcategoría de ${parent.label}`;
  form.elements.label.focus();
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function createReportCategory(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const label = String(data.label || "").trim();
  const parentId = String(data.parentId || "module-reports");
  if (label.length < 2) return alert("La subcategoría necesita un nombre.");
  const siblings = menuItems.filter((item) => item.parentId === parentId);
  if (siblings.some((item) => normalizedMenuLabel(item.label) === normalizedMenuLabel(label))) return alert("Ya existe una subcategoría con ese nombre en este nivel.");
  const usedHues = new Set(menuItems.map((item) => Math.round(Number(item.colorHue || 0))));
  let colorHue = Math.round((menuItems.length * 137.508) % 360);
  while (usedHues.has(colorHue)) colorHue = (colorHue + 29) % 360;
  menuItems.push({ id: uid("menu-"), label, view: "", parentId, order: siblings.length, colorHue });
  event.currentTarget.reset();
  commitMenuConfiguration();
}

function prepareMenuSubcategory(parentId) {
  const form = document.getElementById("menuItemForm");
  const parent = menuItems.find((item) => item.id === parentId);
  if (!form || !parent) return;
  form.elements.parentId.value = parentId;
  form.elements.label.value = "";
  form.elements.label.placeholder = `Nueva subcategoría de ${parent.label}`;
  form.elements.label.focus();
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function createMenuGroup(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const label = String(data.label || "").trim();
  if (label.length < 2) return alert("La categoría necesita un nombre.");
  const siblings = menuItems.filter((item) => item.parentId === (data.parentId || ""));
  const usedHues = new Set(menuItems.map((item) => Math.round(Number(item.colorHue || 0))));
  let colorHue = Math.round((menuItems.length * 137.508) % 360);
  while (usedHues.has(colorHue)) colorHue = (colorHue + 29) % 360;
  const item = { id: uid("menu-"), label, view: "", parentId: data.parentId || "", order: siblings.length, colorHue };
  if (item.parentId === "module-products") {
    try {
      if (apiOnline) {
        await apiRequest("/categories", { method: "POST", body: { id: `stock-${item.id}`, name: item.label } });
      } else if (!state.productCategories.some((category) => normalizedMenuLabel(category.name) === normalizedMenuLabel(item.label))) {
        state.productCategories.push({ id: `stock-${item.id}`, name: item.label });
      }
    } catch (error) {
      alert(error.message || "No se pudo crear la subcategoría en Stock taller.");
      return;
    }
  }
  menuItems.push(item);
  event.currentTarget.reset();
  commitMenuConfiguration();
  if (item.parentId === "module-products") {
    if (apiOnline) {
      await persistFinancialStateNow();
      await refreshStateFromApi();
    }
    else commit();
    selectNewStockCategory(`stock-${item.id}`);
    renderSidebarMenu();
  }
}

function updateMenuLabel(itemId, value) {
  const item = menuItems.find((entry) => entry.id === itemId);
  const label = String(value || "").trim();
  if (!item || label.length < 2) return renderMenuSettings();
  item.label = label;
  commitMenuConfiguration();
}

function moveMenuItem(itemId, parentId) {
  const item = menuItems.find((entry) => entry.id === itemId);
  if (!item || itemId === parentId || menuDescendantIds(itemId).includes(parentId)) return;
  item.parentId = parentId || "";
  item.order = menuItems.filter((entry) => entry.id !== itemId && entry.parentId === item.parentId).length;
  commitMenuConfiguration();
}

function reorderMenuItem(itemId, direction) {
  const item = menuItems.find((entry) => entry.id === itemId);
  if (!item) return;
  const siblings = menuItems.filter((entry) => entry.parentId === item.parentId).sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((entry) => entry.id === itemId);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  siblings.forEach((entry, order) => { entry.order = order; });
  commitMenuConfiguration();
}

async function deleteMenuGroup(itemId) {
  const item = menuItems.find((entry) => entry.id === itemId && !entry.view);
  if (!item) return;
  if (menuItems.some((entry) => entry.parentId === itemId)) return alert("Primero mueve o elimina los elementos que contiene.");
  if (!confirm(`Eliminar la categoría "${item.label}"?`)) return;
  if (item.parentId === "module-products") {
    const category = state.productCategories.find((entry) => normalizedMenuLabel(entry.name) === normalizedMenuLabel(item.label));
    if (category) {
      try {
        if (apiOnline) await apiRequest(`/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
        else {
          if (state.products.some((product) => product.categoryId === category.id)) return alert("No se puede eliminar una subcategoría con productos cargados.");
          state.productCategories = state.productCategories.filter((entry) => entry.id !== category.id);
        }
      } catch (error) {
        alert(error.message || "No se pudo eliminar la subcategoría de Stock taller.");
        return;
      }
    }
  }
  menuItems = menuItems.filter((entry) => entry.id !== itemId);
  commitMenuConfiguration();
  if (item.parentId === "module-products") {
    if (apiOnline) {
      await persistFinancialStateNow();
      await refreshStateFromApi();
    }
    else commit();
    renderSidebarMenu();
  }
}

function commitMenuConfiguration() {
  persistAllData();
  renderSidebarMenu();
  renderMenuSettings();
  renderReports();
}

const repairStatuses = [
  "En diagnostico",
  "Presupuestado",
  "Aprobado",
  "Esperando aprobacion",
  "Esperando repuesto",
  "En reparacion",
  "Listo para retirar",
  "Finalizado",
  "Entregado",
  "Cancelado"
];
const quickRepairStatuses = repairStatuses.filter((status) => status !== "Cancelado");

const paymentStatuses = ["Sin abonar", "Seña", "Pagado"];

const REMOTE_SYNC_INTERVAL_MS = 4000;
let remoteSyncTimer = null;
let remoteCatalogSignature = "";
let lastAccountingPeriodKey = "";

document.addEventListener("DOMContentLoaded", async () => {
  installProfessionalAlerts();
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  await initializeManagementAccess();
  ensureSaleAccountingRecords();
  renderSidebarMenu();
  initializeWorkspaceUx();
  bindNavigation();
  bindForms();
  initializePhoneAutocomplete();
  initializePurchaseSuppliers();
  initializeBackupControls();
  initializeCashControls();
  initializeReportControls();
  bindOrderDetail();
  bindClientDetail();
  bindOrderStatusFilters();
  render();
  await refreshStateFromApi();
  await refreshCashSessions();
  await createAutomaticBackup();
  startRemoteCatalogSync();
  startAccountingClock();
});

function initializeWorkspaceUx() {
  const collapseButton = document.getElementById("sidebarCollapseButton");
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  const applySidebarState = (value) => {
    document.body.classList.toggle("sidebar-collapsed", value);
    collapseButton?.setAttribute("aria-expanded", String(!value));
    collapseButton?.setAttribute("aria-label", value ? "Expandir menú lateral" : "Contraer menú lateral");
    const label = collapseButton?.querySelector("small");
    const icon = collapseButton?.querySelector("span");
    if (label) label.textContent = value ? "Expandir" : "Contraer";
    if (icon) icon.textContent = value ? "›" : "‹";
  };
  applySidebarState(collapsed);
  collapseButton?.addEventListener("click", () => {
    const next = !document.body.classList.contains("sidebar-collapsed");
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    scheduleFinancialStatePersist(0);
    applySidebarState(next);
  });

  const settings = document.querySelector("#settings > .panel");
  const sections = [...document.querySelectorAll("#settings > .panel > .settings-section")];
  if (!settings || sections.length < 2) return;
  const tabs = document.createElement("div");
  tabs.className = "settings-tabs";
  tabs.setAttribute("role", "tablist");
  sections.forEach((section, index) => {
    const label = section.querySelector(".settings-section-head h3")?.textContent?.trim() || `Sección ${index + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `settings-tab${index === 0 ? " active" : ""}`;
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(index === 0));
    section.hidden = index !== 0;
    button.addEventListener("click", () => {
      sections.forEach((candidate, candidateIndex) => { candidate.hidden = candidateIndex !== index; });
      tabs.querySelectorAll(".settings-tab").forEach((candidate, candidateIndex) => {
        candidate.classList.toggle("active", candidateIndex === index);
        candidate.setAttribute("aria-selected", String(candidateIndex === index));
      });
    });
    tabs.append(button);
  });
  settings.querySelector(".panel-head")?.insertAdjacentElement("afterend", tabs);
}

function startAccountingClock() {
  lastAccountingPeriodKey = `${today()}-${currentAccountingMonth()}`;
  setInterval(() => {
    const nextKey = `${today()}-${currentAccountingMonth()}`;
    if (nextKey === lastAccountingPeriodKey) return;
    lastAccountingPeriodKey = nextKey;
    render();
  }, 60000);
}

window.addEventListener("pagehide", persistAllData);
window.addEventListener("beforeunload", persistAllData);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persistAllData();
});

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextSaleNumber() {
  const highest = state.sales.reduce((max, sale) => {
    const number = Number(String(sale.number || "").replace(/\D/g, ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `V-${String(highest + 1).padStart(5, "0")}`;
}

function buildLocalSaleOrder(sale, product, client) {
  const number = nextOrderNumber();
  const description = sale.productDescription || saleProductDescription(product);
  const items = sale.items?.length ? sale.items : [{ productDescription: description, quantity: sale.quantity, total: sale.total }];
  return {
    id: uid("sale-order-"),
    receiptId: "",
    orderType: "sale",
    saleId: sale.id,
    number,
    clientId: client.id || "",
    clientName: client.name || "Cliente Mostrador",
    clientDocument: client.document || "-",
    clientPhone: client.phone || "-",
    device: items.map((item) => item.productDescription).join(" + "),
    brand: product.brand || "Venta",
    model: product.model || product.name,
    color: product.color || "-",
    problem: "Orden de venta",
    diagnosis: "Venta realizada en el local",
    services: items.map((item) => `Venta: ${item.productDescription} x ${item.quantity}`),
    serviceItems: items.map((item) => ({ description: item.productDescription, quantity: item.quantity, price: item.total, approvalStatus: "Aprobado", source: "sale" })),
    status: "Entregado",
    repairStatus: "Entregado",
    paymentStatus: "Pagado",
    budget: sale.total,
    paid: sale.total,
    paidAt: sale.createdAt,
    date: sale.date,
    terms: "Venta de producto realizada en el local."
  };
}

function recordSaleCostExpense(sale, product) {
  const category = ensureAdministrativeExpenseCategory("Costo Producto", /costo (de )?(venta|producto)/);
  const existingExpense = state.expenses.find((expense) => expense.saleId === sale.id && expense.productId === product.id);
  if (existingExpense) {
    existingExpense.adminCategoryId = category?.id || existingExpense.adminCategoryId || "";
    existingExpense.concept = `Costo de venta · ${sale.number}`;
    return;
  }
  const saleItem = sale.items?.find((item) => item.productId === product.id);
  const quantity = Number(saleItem?.quantity || sale.quantity || 0);
  const costTotal = Number(saleItem?.costTotal || (Number(product.costPrice || 0) * quantity));
  if (!sale.items?.length) sale.costTotal = costTotal;
  state.expenses.push({
    id: uid("e"),
    saleId: sale.id,
    orderId: sale.orderId || "",
    receiptId: sale.receiptId || "",
    productId: product.id,
    adminCategoryId: category?.id || "",
    concept: `Costo de venta · ${sale.number}`,
    productName: saleItem?.productDescription || sale.productDescription || saleProductDescription(product),
    amount: costTotal,
    supplier: "-",
    invoiceNumber: sale.number,
    createdAt: sale.createdAt || new Date().toISOString(),
    date: sale.date || today()
  });
}

function syncOrderStockCostExpenses(order, serviceItems = normalizeServiceItems(order)) {
  if (!order) return;
  const category = ensureAdministrativeExpenseCategory("Gastos Stock", /gastos? stock|stock/);
  const orderKey = String(order.receiptId || order.id || "");
  const previousRecords = new Map(state.expenses.filter((expense) => expense.stockCostOrderKey === orderKey).map((expense) => [String(expense.stockCostItemIndex), expense]));
  state.expenses = state.expenses.filter((expense) => expense.stockCostOrderKey !== orderKey);
  const paymentBusinessDate = [...(order.paymentMovements || [])]
    .filter((movement) => movement.businessDate)
    .sort((left, right) => String(right.createdAt || right.businessDate).localeCompare(String(left.createdAt || left.businessDate)))[0]?.businessDate;
  const accountingDate = paymentBusinessDate || recordLocalDay(order.finishedAt || order.date || order.createdAt || order.paidAt) || today();
  const timestamp = order.paidAt || order.finishedAt || order.createdAt || `${accountingDate}T12:00:00`;
  const records = [];
  const baseCost = Number(order.cost || 0);
  const hasDetailedCosts = serviceItems.some((item) => Number(item.cost || 0) > 0);
  if (baseCost > 0 && !hasDetailedCosts) records.push({ description: "Costo inicial de la orden", amount: baseCost, productId: "", quantity: 1, unitCost: baseCost, index: "base" });
  serviceItems.forEach((item, index) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitCost = Number(item.cost || 0);
    if (unitCost <= 0) return;
    records.push({ description: item.description || "Costo agregado a la orden", amount: unitCost * quantity, productId: item.productId || "", quantity, unitCost, index });
  });
  records.forEach((record) => { const previous = previousRecords.get(String(record.index)); state.expenses.push({
    id: uid("e-stock-"),
    stockCostOrderKey: orderKey,
    stockCostItemIndex: record.index,
    orderId: order.id || "",
    receiptId: order.receiptId || "",
    orderNumber: order.number || "",
    productId: record.productId,
    adminCategoryId: category?.id || "",
    concept: `Costo de stock · ${order.number || "Orden"}`,
    productName: record.description,
    quantity: record.quantity,
    unitCost: record.unitCost,
    amount: record.amount,
    supplier: "-",
    invoiceNumber: order.number || "-",
    createdAt: previous?.createdAt || timestamp,
    date: accountingDate
  }); });
}

function syncAllOrderStockCostExpenses() {
  state.orders.filter((order) => !isSaleOrder(order)).forEach((order) => syncOrderStockCostExpenses(order));
}

function ensureSaleAccountingRecords() {
  let nextNumber = state.sales.reduce((max, sale) => {
    const value = Number(String(sale.number || "").replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  [...state.sales].sort((left, right) => String(left.date || "").localeCompare(String(right.date || ""))).forEach((sale) => {
    if (!sale.number) sale.number = `V-${String(++nextNumber).padStart(5, "0")}`;
    if (!sale.createdAt) sale.createdAt = `${sale.date || today()}T12:00:00`;
    const saleItems = sale.items?.length ? sale.items : [{ productId: sale.productId }];
    saleItems.forEach((saleItem) => {
      const product = state.products.find((item) => item.id === saleItem.productId);
      if (!product) return;
      sale.productDescription = sale.productDescription || saleProductDescription(product);
      recordSaleCostExpense(sale, product);
    });
  });
  saveState();
  saveMenuItems();
  saveAccountingState();
}

function customPhoneBrands() {
  try { return JSON.parse(localStorage.getItem(PHONE_BRANDS_KEY) || "[]").map((item) => String(item || "").trim()).filter(Boolean); } catch { return []; }
}

function customPhoneModels() {
  try {
    return JSON.parse(localStorage.getItem(PHONE_MODELS_KEY) || "[]").map((item) => [String(item.brand || "").trim(), String(item.model || "").trim()]).filter(([brand, model]) => brand && model);
  } catch { return []; }
}

function allPhoneBrands() {
  return [...new Set([...DEFAULT_PHONE_BRANDS, ...customPhoneBrands(), ...state.products.map((product) => product.brand).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function phoneModelsForBrand(brand) {
  const normalizedBrand = String(brand || "").trim().toLowerCase();
  return [...new Set([...DEFAULT_PHONE_MODELS, ...customPhoneModels(), ...state.products.map((product) => [product.brand, product.model])]
    .filter(([itemBrand]) => !normalizedBrand || String(itemBrand).toLowerCase() === normalizedBrand)
    .map(([, model]) => model).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base", numeric: true }));
}

function renderPhoneBrandOptions() {
  const list = document.getElementById("phoneBrandOptions");
  if (list) list.innerHTML = allPhoneBrands().map((brand) => `<option value="${escapeHtml(brand)}"></option>`).join("");
}

async function addPhoneBrand(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const brand = await requestTextInput({
    eyebrow: "Catálogo de equipos",
    title: "Nueva marca",
    description: "Añade una marca para utilizarla al cargar productos, compras y servicios.",
    label: "Nombre de la marca",
    placeholder: "Ej.: Motorola",
    acceptLabel: "Añadir marca",
    maxLength: 50,
    validate: (value) => allPhoneBrands().some((item) => item.toLowerCase() === value.toLowerCase()) ? "Esta marca ya existe en el catálogo." : ""
  });
  if (!brand) return;
  const brands = customPhoneBrands();
  brands.push(brand);
  localStorage.setItem(PHONE_BRANDS_KEY, JSON.stringify([...new Set(brands)]));
  renderPhoneBrandOptions();
  form.elements.brand.value = brand;
  renderPhoneModelOptions(form, form.elements.model.getAttribute("list"));
  scheduleFinancialStatePersist(0);
  form.elements.model.focus();
  await showUxNotice({
    type: "success",
    eyebrow: "Marca añadida",
    title: brand,
    description: "Ya está disponible en el catálogo y quedó seleccionada para este producto.",
    acceptLabel: "Continuar"
  });
}

async function addPhoneModel(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const brand = String(form.elements.brand.value || "").trim();
  if (!brand) {
    await showUxNotice({
      type: "warning",
      eyebrow: "Falta seleccionar la marca",
      title: "Elige una marca primero",
      description: "El modelo debe quedar asociado a una marca. Selecciona una existente o créala con el botón +.",
      acceptLabel: "Entendido"
    });
    form.elements.brand.focus();
    return;
  }
  const model = await requestTextInput({
    eyebrow: "Catálogo de equipos",
    title: "Nuevo modelo",
    description: `Añade un modelo para ${brand}. Quedará disponible al cargar productos, compras y servicios.`,
    label: "Nombre del modelo",
    placeholder: "Ej.: Note 13 Pro",
    acceptLabel: "Añadir modelo",
    maxLength: 60,
    validate: (value) => phoneModelsForBrand(brand).some((item) => item.toLowerCase() === value.toLowerCase()) ? "Este modelo ya existe para la marca seleccionada." : ""
  });
  if (!model) return;
  rememberPhoneModel(brand, model);
  form.elements.model.value = model;
  renderPhoneModelOptions(form, form.elements.model.getAttribute("list"));
  form.elements.model.focus();
  await showUxNotice({
    type: "success",
    eyebrow: "Modelo añadido",
    title: `${brand} ${model}`,
    description: "Ya está disponible en el catálogo y quedó seleccionado para este producto.",
    acceptLabel: "Continuar"
  });
}

function renderPhoneModelOptions(form, listId) {
  const list = document.getElementById(listId);
  if (!form || !list) return;
  list.innerHTML = phoneModelsForBrand(form.elements.brand.value).map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
}

function rememberPhoneModel(brandValue, modelValue) {
  const brand = String(brandValue || "").trim();
  const model = String(modelValue || "").trim();
  if (!brand || !model) return false;
  const brands = customPhoneBrands();
  if (!allPhoneBrands().some((item) => item.toLowerCase() === brand.toLowerCase())) brands.push(brand);
  localStorage.setItem(PHONE_BRANDS_KEY, JSON.stringify([...new Set(brands)]));
  const models = customPhoneModels();
  if (![...DEFAULT_PHONE_MODELS, ...models].some(([itemBrand, itemModel]) => itemBrand.toLowerCase() === brand.toLowerCase() && itemModel.toLowerCase() === model.toLowerCase())) models.push([brand, model]);
  localStorage.setItem(PHONE_MODELS_KEY, JSON.stringify(models.map(([itemBrand, itemModel]) => ({ brand: itemBrand, model: itemModel }))));
  scheduleFinancialStatePersist(0);
  renderPhoneBrandOptions();
  return true;
}

function initializePhoneAutocomplete() {
  renderPhoneBrandOptions();
  [["productForm", "productModelOptions"], ["expenseForm", "purchaseModelOptions"], ["serviceForm", "serviceModelOptions"]].forEach(([formId, listId]) => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.elements.brand.addEventListener("input", () => renderPhoneModelOptions(form, listId));
    form.elements.brand.addEventListener("change", () => rememberPhoneModel(form.elements.brand.value, form.elements.model.value));
    form.elements.model.addEventListener("change", () => {
      if (rememberPhoneModel(form.elements.brand.value, form.elements.model.value)) {
        renderPhoneModelOptions(form, listId);
      }
    });
    renderPhoneModelOptions(form, listId);
  });
  document.querySelectorAll("[data-add-phone-model]").forEach((button) => button.addEventListener("click", () => addPhoneModel(button.dataset.addPhoneModel)));
  document.querySelectorAll("[data-add-phone-brand]").forEach((button) => button.addEventListener("click", () => addPhoneBrand(button.dataset.addPhoneBrand)));
}

function purchaseSuppliers() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(PURCHASE_SUPPLIERS_KEY) || "[]"); } catch { saved = []; }
  return [...new Set([
    ...saved,
    ...state.expenses.map((expense) => expense.supplier)
  ].map((supplier) => String(supplier || "").trim()).filter((supplier) => supplier && supplier !== "-"))]
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
}

function renderPurchaseSupplierOptions() {
  const list = document.getElementById("purchaseSupplierOptions");
  if (list) list.innerHTML = purchaseSuppliers().map((supplier) => `<option value="${escapeHtml(supplier)}"></option>`).join("");
}

function rememberPurchaseSupplier(value) {
  const supplier = String(value || "").trim();
  if (!supplier || supplier === "-") return false;
  const suppliers = purchaseSuppliers();
  if (!suppliers.some((item) => item.toLowerCase() === supplier.toLowerCase())) suppliers.push(supplier);
  localStorage.setItem(PURCHASE_SUPPLIERS_KEY, JSON.stringify(suppliers));
  localStorage.setItem(SAVE_META_KEY, new Date().toISOString());
  scheduleFinancialStatePersist(0);
  renderPurchaseSupplierOptions();
  return true;
}

function initializePurchaseSuppliers() {
  const form = document.getElementById("expenseForm");
  const button = document.getElementById("addPurchaseSupplier");
  renderPurchaseSupplierOptions();
  button?.addEventListener("click", () => {
    const input = form?.elements.supplier;
    if (!input) return;
    const supplier = String(input.value || prompt("Nombre del proveedor:") || "").trim();
    if (!supplier) return;
    input.value = supplier;
    rememberPurchaseSupplier(supplier);
    alert("Proveedor añadido y guardado en la lista.");
  });
}

function currentWorkdayStart(now = new Date()) {
  const start = new Date(now);
  start.setHours(FINISHED_ORDERS_RESET_HOUR, 0, 0, 0);
  if (now < start) {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

function isFinishedOrderStatus(status) {
  return FINISHED_ORDER_STATUSES.includes(status || "");
}

function isFinishedInCurrentWorkday(order) {
  const status = order.repairStatus || order.status || "";
  if (!isFinishedOrderStatus(status) || !order.finishedAt) {
    return false;
  }
  const finishedAt = new Date(order.finishedAt);
  return !Number.isNaN(finishedAt.getTime()) && finishedAt >= currentWorkdayStart();
}

function applyFinishedTimestamp(order, nextStatus) {
  const wasFinished = isFinishedOrderStatus(order.repairStatus || order.status || "");
  const willBeFinished = isFinishedOrderStatus(nextStatus);
  if (willBeFinished && !wasFinished) {
    order.finishedAt = new Date().toISOString();
  } else if (!willBeFinished) {
    order.finishedAt = "";
  }
}

function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return emptyState();
  }

  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return emptyState();
  }
}

function emptyState() {
  return { clients: [{ id: "client-default", name: "Default", document: "-", phone: "-", email: "" }], orders: [], productCategories: [{ id: "cat-general", name: "General" }], webProductCategories: [], products: [], sales: [], expenses: [], services: [], serviceCategories: [] };
}

function normalizeState(data) {
  const clients = (data.clients || []).map((client) => ({
    ...client,
    document: client.document || "-"
  }));
  if (!clients.some((client) => normalizedMenuLabel(client.name) === "default")) {
    clients.unshift({ id: "client-default", name: "Default", document: "-", phone: "-", email: "" });
  }
  const orders = (data.orders || []).map((order) => {
    const client = clients.find((item) => item.id === order.clientId);
    const serviceItems = normalizeServiceItems(order);
    return {
      ...order,
      serviceItems,
      budget: Number(order.budget || 0),
      clientName: order.clientName || client?.name || "Eliminado",
      clientDocument: order.clientDocument || client?.document || "-"
    };
  });

  const productCategories = data.productCategories?.length
    ? data.productCategories
    : [{ id: "cat-general", name: "General" }];
  const defaultCategoryId = productCategories[0].id;
  const products = (data.products || []).map((product) => ({
    ...product,
    categoryId: product.categoryId || defaultCategoryId,
    brand: product.brand || product.name || "-",
    model: product.model || product.name || "-",
    color: product.color || "-",
    costPrice: Number(product.costPrice || 0),
    salePrice: Number(product.salePrice || product.price || 0),
    price: Number(product.salePrice || product.price || 0),
    name: (() => {
      const baseName = product.name || buildProductName(product.brand, product.model, product.color);
      const categoryName = productCategories.find((category) => category.id === (product.categoryId || defaultCategoryId))?.name || "";
      return categoryName && normalizedMenuLabel(categoryName) !== "general" && !normalizedMenuLabel(baseName).startsWith(normalizedMenuLabel(categoryName)) ? `${categoryName} ${baseName}` : baseName;
    })(),
    inventoryScope: normalizeProductInventoryScope(product)
  }));

  return {
    clients,
    orders,
    productCategories,
    webProductCategories: data.webProductCategories || [],
    products,
    sales: data.sales || [],
    expenses: data.expenses || [],
    services: (data.services || []).map((service) => ({
      ...service,
      costPrice: Number(service.costPrice || 0),
      salePrice: Number(service.salePrice || 0),
      productKey: String(service.productKey || ""),
      productName: String(service.productName || ""),
      brand: String(service.brand || ""),
      model: String(service.model || ""),
      active: service.active !== false
    })),
    serviceCategories: data.serviceCategories || []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistAllData() {
  saveState();
  saveMenuItems();
  localStorage.setItem(SAVE_META_KEY, new Date().toISOString());
  updateAutosaveStatus();
  scheduleFinancialStatePersist();
}

function scheduleFinancialStatePersist(delay = 500) {
  if (!apiOnline || !financialStateLoaded) return;
  clearTimeout(financialStatePersistTimer);
  financialStatePersistTimer = setTimeout(async () => {
    try {
      await persistFinancialStateNow();
    } catch (error) { console.warn("No se pudo guardar el estado financiero en el servidor:", error); }
  }, delay);
}

async function persistFinancialStateNow() {
  if (!apiOnline || !financialStateLoaded) return;
  clearTimeout(financialStatePersistTimer);
  await apiRequest("/financial-state", { method: "PUT", body: {
    capitalInitial: Number(localStorage.getItem(CAPITAL_INITIAL_KEY) || 0), expenses: state.expenses, menuItems, accountingState, preferences: buildPersistentPreferences(),
    actorId: currentManagementUser?.id || ""
  } });
}

function applyRemoteFinancialState(financialState) {
  if (!financialState?.exists) return false;
  state.expenses = Array.isArray(financialState.expenses) ? financialState.expenses : [];
  localStorage.setItem(CAPITAL_INITIAL_KEY, String(Number(financialState.capitalInitial || 0)));
  if (Array.isArray(financialState.menuItems) && financialState.menuItems.length) {
    localStorage.setItem(MENU_CONFIG_KEY, JSON.stringify(financialState.menuItems));
    menuItems = loadMenuItems();
  }
  if (financialState.accountingState && Object.keys(financialState.accountingState).length) {
    localStorage.setItem(ACCOUNTING_STATE_KEY, JSON.stringify(financialState.accountingState));
    accountingState = loadAccountingState();
  } else if (Number(financialState.capitalInitial || 0) > 0 && !Object.values(accountingState.openingBalances).some(Number)) {
    accountingState.openingBalances.cash = Number(financialState.capitalInitial || 0);
    saveAccountingState();
  }
  if (financialState.preferences && Object.keys(financialState.preferences).length) applyPersistentPreferences(financialState.preferences);
  else preferencesNeedMigration = true;
  return true;
}

function buildManagementSnapshot() {
  return {
    createdAt: new Date().toISOString(),
    state,
    menuItems,
    accountingState,
    stockCategoryOrder: localStorage.getItem(PRODUCT_CATEGORY_ORDER_KEY) || "[]",
    fixedExpenseNames: localStorage.getItem(FIXED_EXPENSE_NAMES_KEY) || "[]",
    phoneBrands: localStorage.getItem(PHONE_BRANDS_KEY) || "[]",
    phoneModels: localStorage.getItem(PHONE_MODELS_KEY) || "[]",
    purchaseSuppliers: localStorage.getItem(PURCHASE_SUPPLIERS_KEY) || "[]"
  };
}

async function saveManagementBackup({ force = false } = {}) {
  const lastSavedAt = new Date(localStorage.getItem(LAST_SERVER_BACKUP_KEY) || 0).getTime();
  if (!force && Date.now() - lastSavedAt < AUTO_BACKUP_INTERVAL_MS) return null;
  if (!apiOnline) return null;
  const result = await apiRequest("/backups", { method: "POST", body: { snapshot: buildManagementSnapshot() } });
  localStorage.setItem(LAST_SERVER_BACKUP_KEY, result.savedAt || new Date().toISOString());
  updateBackupStatus(result.filename);
  return result;
}

async function createAutomaticBackup() {
  try { await saveManagementBackup(); } catch (error) { console.warn("No se pudo crear el respaldo automático:", error); }
}

function updateBackupStatus(filename = "") {
  const element = document.getElementById("backupStatus");
  if (!element) return;
  const savedAt = localStorage.getItem(LAST_SERVER_BACKUP_KEY);
  element.textContent = savedAt
    ? `Último respaldo: ${new Date(savedAt).toLocaleString("es-UY")}${filename ? ` · ${filename}` : ""}`
    : "Todavía no se creó un respaldo automático.";
}

function downloadManagementBackup() {
  const content = JSON.stringify({ version: 1, snapshot: buildManagementSnapshot() }, null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  link.download = `respaldo-sistema-gestion-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function restoreManagementBackup(file) {
  const parsed = JSON.parse(await file.text());
  const snapshot = parsed.snapshot || parsed;
  if (!snapshot?.state || !Array.isArray(snapshot.menuItems)) throw new Error("La copia seleccionada no tiene el formato esperado.");
  if (!confirm("Se reemplazarán los datos actuales por los de esta copia. ¿Continuar?")) return;
  await saveManagementBackup({ force: true }).catch(() => null);
  state = normalizeState(snapshot.state);
  menuItems = snapshot.menuItems;
  if (snapshot.accountingState) { accountingState = snapshot.accountingState; saveAccountingState(); }
  localStorage.setItem(PRODUCT_CATEGORY_ORDER_KEY, snapshot.stockCategoryOrder || "[]");
  localStorage.setItem(FIXED_EXPENSE_NAMES_KEY, snapshot.fixedExpenseNames || "[]");
  localStorage.setItem(PHONE_BRANDS_KEY, snapshot.phoneBrands || "[]");
  localStorage.setItem(PHONE_MODELS_KEY, snapshot.phoneModels || "[]");
  localStorage.setItem(PURCHASE_SUPPLIERS_KEY, snapshot.purchaseSuppliers || "[]");
  persistAllData();
  renderSidebarMenu();
  renderPhoneBrandOptions();
  renderPurchaseSupplierOptions();
  render();
  alert("La copia de seguridad fue restaurada correctamente.");
}

function initializeBackupControls() {
  updateBackupStatus();
  setInterval(createAutomaticBackup, AUTO_BACKUP_INTERVAL_MS);
  document.getElementById("createBackupButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await saveManagementBackup({ force: true });
      if (!result) throw new Error("El servidor local no está disponible.");
      alert("Respaldo creado correctamente.");
    } catch (error) {
      alert(error.message || "No se pudo crear el respaldo.");
    } finally { button.disabled = false; }
  });
  document.getElementById("downloadBackupButton")?.addEventListener("click", downloadManagementBackup);
  document.getElementById("restoreBackupInput")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try { await restoreManagementBackup(file); } catch (error) { alert(error.message || "No se pudo restaurar la copia."); }
    event.currentTarget.value = "";
  });
}

function cashSalesIncomeForDate(date) {
  return state.sales.filter((sale) => sale.date === date && !sale.annulledAt).reduce((sum, sale) => {
    const total = Number(sale.total || 0);
    const net = saleNetTotal(sale);
    if (sale.payments?.length) {
      const cashPaid = sale.payments.filter((payment) => normalizedMenuLabel(payment.method).includes("efectivo")).reduce((amount, payment) => amount + Number(payment.amount || 0), 0);
      return sum + (total > 0 ? cashPaid * (net / total) : 0);
    }
    return sum + (["", "efectivo"].includes(normalizedMenuLabel(sale.paymentMethod)) ? net : 0);
  }, 0);
}

function cashServiceIncomeForDate(date) {
  return state.orders.filter((order) => !isSaleOrder(order) && recordLocalDay(order.paidAt || order.date) === date).reduce((sum, order) => sum + orderCollectedAmount(order), 0);
}

function recordLocalDay(value) {
  if (!value) return "";
  const raw = String(value);
  const accountingDay = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (accountingDay) return accountingDay;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cashExpensesForDate(date) {
  return state.expenses.filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense) && recordLocalDay(expense.date || expense.createdAt) === date).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function selectedCashDate() {
  return document.getElementById("cashBusinessDate")?.value || today();
}

function cashExpectedForSession(session) {
  const date = session?.businessDate || selectedCashDate();
  return Number(session?.openingAmount || 0) + cashSalesIncomeForDate(date) + cashServiceIncomeForDate(date) - cashExpensesForDate(date);
}

async function refreshCashSessions() {
  if (!apiOnline) return;
  try { cashSessions = (await apiRequest("/cash-sessions")).sessions || []; renderCash(); } catch (error) { console.warn("No se pudo actualizar la caja:", error); }
}

function initializeCashControls() {
  const dateInput = document.getElementById("cashBusinessDate");
  if (!dateInput) return;
  dateInput.value = today();
  dateInput.addEventListener("change", renderCash);
  document.getElementById("cashOpenForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const openingAmount = Number(new FormData(event.currentTarget).get("openingAmount") || 0);
    try {
      const session = apiOnline ? (await apiRequest("/cash-sessions/open", { method: "POST", body: { businessDate: selectedCashDate(), openingAmount, actorId: currentManagementUser?.id || "", actorName: currentManagementUser?.name || "Sistema" } })).session : { id: uid("cash-"), businessDate: selectedCashDate(), openingAmount, status: "open", openedAt: new Date().toISOString() };
      cashSessions = [session, ...cashSessions.filter((item) => item.businessDate !== session.businessDate)];
      renderCash();
    } catch (error) { alert(error.message || "No se pudo abrir la caja."); }
  });
  document.getElementById("cashCloseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = cashSessions.find((item) => item.businessDate === selectedCashDate());
    if (!session || session.status !== "open") return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const expectedAmount = cashExpectedForSession(session);
    try {
      const closed = apiOnline ? (await apiRequest(`/cash-sessions/${encodeURIComponent(session.id)}/close`, { method: "POST", body: { expectedAmount, countedAmount: Number(data.countedAmount || 0), notes: data.notes || "", actorId: currentManagementUser?.id || "", actorName: currentManagementUser?.name || "Sistema" } })).session : { ...session, expectedAmount, countedAmount: Number(data.countedAmount || 0), difference: Number(data.countedAmount || 0) - expectedAmount, notes: data.notes || "", status: "closed", closedAt: new Date().toISOString() };
      Object.assign(session, closed);
      event.currentTarget.reset();
      renderCash();
    } catch (error) { alert(error.message || "No se pudo cerrar la caja."); }
  });
  refreshCashSessions();
}

function renderCash() {
  const metricsContainer = document.getElementById("cashMetrics");
  if (!metricsContainer) return;
  const date = selectedCashDate();
  const session = cashSessions.find((item) => item.businessDate === date);
  const salesCash = cashSalesIncomeForDate(date);
  const servicesCash = cashServiceIncomeForDate(date);
  const expenses = cashExpensesForDate(date);
  const expected = cashExpectedForSession(session);
  metricsContainer.innerHTML = [metric("Apertura", money.format(session?.openingAmount || 0), "tech"), metric("Ingresos en efectivo", money.format(salesCash + servicesCash), "ok"), metric("Gastos", money.format(expenses), "danger"), metric("Efectivo esperado", money.format(expected), expected >= 0 ? "ok" : "danger")].join("");
  document.getElementById("cashOpenForm").hidden = Boolean(session);
  document.getElementById("cashCloseForm").hidden = !session || session.status !== "open";
  const rows = cashSessions.map((item) => `<tr><td>${formatDate(item.businessDate)}</td><td>${money.format(item.openingAmount)}</td><td>${money.format(item.status === "open" ? cashExpectedForSession(item) : item.expectedAmount)}</td><td>${item.countedAmount == null ? "-" : money.format(item.countedAmount)}</td><td class="money-cell">${item.status === "closed" ? money.format(item.difference) : "-"}</td><td>${item.status === "open" ? "Abierta" : "Cerrada"}</td><td>${item.closedAt ? new Date(item.closedAt).toLocaleString("es-UY") : "-"}</td></tr>`);
  setTable("cashSessionsTable", rows, 7, "No hay cajas registradas.");
}

function canAccessManagementView(view) {
  if (!currentManagementUser) return true;
  if (currentManagementUser.role === "administrador_principal") return true;
  const allowed = managementRolePermissions[currentManagementUser.role] || DEFAULT_ROLE_PERMISSIONS[currentManagementUser.role] || [];
  return allowed.includes("*") || allowed.includes(view);
}

function applyManagementRoleVisibility() {
  const role = currentManagementUser?.role;
  const setHidden = (id, hidden) => { const element = document.getElementById(id); if (element) element.hidden = hidden; };
  const isAdmin = ["administrador", "administrador_principal"].includes(role);
  setHidden("productForm", Boolean(role && !isAdmin));
  setHidden("expenseForm", Boolean(role && !isAdmin));
  setHidden("serviceForm", Boolean(role && !(isAdmin || role === "tecnico")));
  const categoryButton = document.getElementById("productCategorySettingsButton");
  if (categoryButton) categoryButton.hidden = Boolean(role && !isAdmin);
  renderSidebarSession();
}

async function initializeManagementAccess() {
  const panel = document.getElementById("managementLoginPanel");
  const saved = sessionStorage.getItem("sistema-gestion-current-user-v1");
  try { currentManagementUser = saved ? JSON.parse(saved) : null; } catch { currentManagementUser = null; }
  try { managementNeedsSetup = Boolean((await apiRequest("/management-setup-status")).needsSetup); } catch { managementNeedsSetup = false; }
  const title = document.getElementById("managementLoginTitle");
  const help = document.getElementById("managementLoginHelp");
  const form = document.getElementById("managementLoginForm");
  form.elements.name.hidden = !managementNeedsSetup;
  form.elements.name.required = managementNeedsSetup;
  title.textContent = managementNeedsSetup ? "Crear administrador principal" : "Iniciar sesión";
  help.textContent = managementNeedsSetup ? "Elige tu propio usuario y una contraseña de al menos 8 caracteres. No se creará ninguna clave predeterminada." : "Ingresa tus credenciales del sistema de gestión.";
  form.onsubmit = handleManagementLogin;
  document.getElementById("managementUserForm").onsubmit = createManagementUser;
  document.getElementById("managementLogoutButton").onclick = managementLogout;
  document.getElementById("sidebarLogoutButton").onclick = managementLogout;
  document.getElementById("brandSessionTrigger").onclick = toggleBrandSessionMenu;
  document.getElementById("managementLoginCancelButton").onclick = cancelManagementLogin;
  document.getElementById("permissionRoleSelect").onchange = renderRolePermissionCheckboxes;
  document.getElementById("saveRolePermissionsButton").onclick = saveRolePermissions;
  if (currentManagementUser && !managementNeedsSetup) panel.classList.remove("open");
  else panel.classList.add("open");
  setManagementLocked(!currentManagementUser);
  await loadRolePermissions();
  renderManagementUsers();
  renderSidebarMenu();
  applyManagementRoleVisibility();
  renderSidebarSession();
  if (currentManagementUser && financialStateLoaded) scheduleFinancialStatePersist(0);
}

async function handleManagementLogin(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const error = document.getElementById("managementLoginError");
  error.textContent = "Verificando...";
  try {
    const path = managementNeedsSetup ? "/management-setup" : "/management-login";
    const payload = await apiRequest(path, { method: "POST", body: data });
    currentManagementUser = payload.user;
    managementRolePermissions = payload.rolePermissions || managementRolePermissions;
    managementNeedsSetup = false;
    sessionStorage.setItem("sistema-gestion-current-user-v1", JSON.stringify(currentManagementUser));
    //if (financialStateLoaded) scheduleFinancialStatePersist(0);
    document.getElementById("managementLoginPanel").classList.remove("open");
    setManagementLocked(false);
    error.textContent = "";
    event.currentTarget.reset();
    //await refreshStateFromApi();
    showView("dashboard");
    renderSidebarSession();
    renderSidebarMenu();
    applyManagementRoleVisibility();
    renderManagementUsers().catch((loadError) => console.warn("No se pudo cargar la administración de usuarios:", loadError));
    renderSidebarSession();
  } catch (loginError) { error.textContent = loginError.message || "No se pudo iniciar sesión."; }
}

function managementLogout() {
  currentManagementUser = null;
  sessionStorage.removeItem("sistema-gestion-current-user-v1");
  document.getElementById("managementLoginForm").reset();
  document.getElementById("managementLoginPanel").classList.add("open");
  setManagementLocked(true);
  document.getElementById("brandSessionMenu").hidden = true;
  renderSidebarSession();
}

function cancelManagementLogin() {
  document.getElementById("managementLoginPanel").classList.remove("open");
  setManagementLocked(true);
}

function setManagementLocked(locked) {
  document.body.classList.toggle("management-locked", locked);
  [document.querySelector(".shell"), document.querySelector(".nav"), document.getElementById("beimWebsiteButton")].filter(Boolean).forEach((element) => { element.inert = locked; });
}

function isManagementAdmin() { return ["administrador", "administrador_principal"].includes(currentManagementUser?.role); }
function canManageRolePermissions() { return currentManagementUser?.role === "administrador_principal"; }

function renderSidebarSession() {
  const trigger = document.getElementById("brandSessionTrigger");
  if (!trigger) return;
  document.getElementById("brandSessionName").textContent = currentManagementUser?.name || "BEIM";
  document.getElementById("brandSessionRole").textContent = currentManagementUser ? capitalizeText(currentManagementUser.role.replaceAll("_", " ")) : "Panel operativo";
  trigger.disabled = false;
  if (!currentManagementUser) document.getElementById("brandSessionMenu").hidden = true;
  const websiteButton = document.getElementById("beimWebsiteButton");
  if (websiteButton) websiteButton.hidden = !canAccessManagementView("openWebsite");
}

function toggleBrandSessionMenu() {
  if (!currentManagementUser) {
    document.getElementById("managementLoginPanel").classList.add("open");
    return;
  }
  const menu = document.getElementById("brandSessionMenu");
  const trigger = document.getElementById("brandSessionTrigger");
  menu.hidden = !menu.hidden;
  trigger.setAttribute("aria-expanded", String(!menu.hidden));
}

async function loadRolePermissions() {
  if (!currentManagementUser) return;
  try { managementRolePermissions = (await apiRequest(`/management-role-permissions?actorId=${encodeURIComponent(currentManagementUser.id)}`)).permissions || {}; } catch { managementRolePermissions = {}; }
  const editor = document.getElementById("rolePermissionsEditor");
  if (editor) editor.hidden = !canManageRolePermissions();
  renderRolePermissionCheckboxes();
}

function renderRolePermissionCheckboxes() {
  const role = document.getElementById("permissionRoleSelect")?.value || "vendedor";
  const selected = managementRolePermissions[role] || DEFAULT_ROLE_PERMISSIONS[role] || [];
  const grid = document.getElementById("permissionCheckboxes");
  if (grid) grid.innerHTML = MANAGEMENT_VIEWS.map(([key,label]) => `<label><input type="checkbox" value="${key}"${selected.includes("*") || selected.includes(key) ? " checked" : ""}>${label}</label>`).join("");
}

async function saveRolePermissions() {
  if (!canManageRolePermissions()) return;
  const role = document.getElementById("permissionRoleSelect").value;
  const permissions = [...document.querySelectorAll("#permissionCheckboxes input:checked")].map((input) => input.value);
  const payload = await apiRequest("/management-role-permissions", { method: "PUT", body: { actorId: currentManagementUser.id, role, permissions } });
  managementRolePermissions = payload.permissions;
  renderSidebarMenu();
  alert("Permisos guardados.");
}

async function createManagementUser(event) {
  event.preventDefault();
  if (!isManagementAdmin()) return;
  const body = { ...Object.fromEntries(new FormData(event.currentTarget)), actorId: currentManagementUser.id };
  if (body.role === "administrador" && !canManageRolePermissions()) {
    alert("Solo el administrador principal puede crear otros administradores.");
    return;
  }
  try { await apiRequest("/management-users", { method: "POST", body }); event.currentTarget.reset(); await renderManagementUsers(); } catch (error) { alert(error.message || "No se pudo crear el usuario."); }
}

async function renderManagementUsers() {
  const section = document.getElementById("managementUsersSection");
  const current = document.getElementById("currentManagementUser");
  if (!section || !current) return;
  current.textContent = currentManagementUser ? `${currentManagementUser.name} · ${currentManagementUser.role}` : "Sin sesión iniciada";
  const form = document.getElementById("managementUserForm");
  form.hidden = !isManagementAdmin();
  const administratorOption = form.elements.role?.querySelector("option[value='administrador']");
  if (administratorOption) administratorOption.disabled = !canManageRolePermissions();
  if (!canManageRolePermissions() && form.elements.role?.value === "administrador") form.elements.role.value = "vendedor";
  document.getElementById("rolePermissionsEditor").hidden = !canManageRolePermissions();
  let users = [];
  let webUsers = [];
  if (isManagementAdmin()) {
    try { users = (await apiRequest(`/management-users?actorId=${encodeURIComponent(currentManagementUser.id)}`)).users || []; } catch { users = []; }
    try { webUsers = (await apiRequest(`/management-web-users?actorId=${encodeURIComponent(currentManagementUser.id)}`)).users || []; } catch { webUsers = []; }
  }
  const editableRoles = canManageRolePermissions() ? ["administrador", "vendedor", "tecnico", "caja"] : ["vendedor", "tecnico", "caja"];
  const rows = users.map((user) => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.username)}</td><td><select data-management-role="${user.id}"${user.role === "administrador_principal" || (user.role === "administrador" && !canManageRolePermissions()) ? " disabled" : ""}>${(user.role === "administrador_principal" ? ["administrador_principal"] : editableRoles).map((role) => `<option value="${role}"${role === user.role ? " selected" : ""}>${capitalizeText(role.replaceAll("_", " "))}</option>`).join("")}</select></td><td><select data-management-web-user="${user.id}"><option value="">Sin vincular</option>${webUsers.map((webUser) => `<option value="${webUser.id}"${webUser.id === user.webUserId ? " selected" : ""}>${escapeHtml(webUser.name)} · ${escapeHtml(webUser.username)} (${webUser.role})</option>`).join("")}</select></td><td><button class="row-action" type="button" data-management-active="${user.id}" data-active="${user.active}"${user.role === "administrador_principal" ? " disabled" : ""}>${user.active ? "Desactivar" : "Activar"}</button></td><td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-UY") : "Nunca"}</td></tr>`);
  setTable("managementUsersTable", rows, 6, isManagementAdmin() ? "No hay empleados creados." : "Solo el administrador puede gestionar usuarios.");
  document.querySelectorAll("[data-management-role]").forEach((select) => select.addEventListener("change", async () => {
    const user = users.find((item) => item.id === select.dataset.managementRole);
    if (!user) return;
    try { await apiRequest(`/management-users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: { actorId: currentManagementUser.id, role: select.value, active: user.active } }); await renderManagementUsers(); } catch (error) { alert(error.message || "No se pudo cambiar el rol."); }
  }));
  document.querySelectorAll("[data-management-web-user]").forEach((select) => select.addEventListener("change", async () => {
    const user = users.find((item) => item.id === select.dataset.managementWebUser);
    if (!user) return;
    try { await apiRequest(`/management-users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: { actorId: currentManagementUser.id, role: user.role, active: user.active, webUserId: select.value || null } }); await renderManagementUsers(); } catch (error) { alert(error.message || "No se pudo vincular la cuenta web."); }
  }));
  document.querySelectorAll("[data-management-active]").forEach((button) => button.addEventListener("click", async () => {
    const user = users.find((item) => item.id === button.dataset.managementActive);
    if (!user || user.id === currentManagementUser.id) return alert("No puedes desactivar tu propia sesión administrativa.");
    try { await apiRequest(`/management-users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: { actorId: currentManagementUser.id, role: user.role, active: !user.active } }); await renderManagementUsers(); } catch (error) { alert(error.message || "No se pudo cambiar el estado."); }
  }));
}

function initializeReportControls() {
  const from = document.getElementById("reportDateFrom");
  const to = document.getElementById("reportDateTo");
  if (!from || !to) return;
  const now = new Date();
  from.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  to.value = today();
  document.getElementById("applyReportFilter").addEventListener("click", renderReports);
  const capitalInput = document.getElementById("initialCapitalInput");
  if (capitalInput) {
    capitalInput.value = Number(localStorage.getItem(CAPITAL_INITIAL_KEY) || 0) || "";
    capitalInput.addEventListener("change", () => {
      const amount = Math.max(0, Number(capitalInput.value || 0));
      localStorage.setItem(CAPITAL_INITIAL_KEY, String(amount));
      localStorage.setItem(SAVE_META_KEY, new Date().toISOString());
      renderCapitalBalance();
      scheduleFinancialStatePersist(0);
    });
  }
  document.getElementById("exportReportCsv").addEventListener("click", exportReportCsv);
  document.getElementById("printReportButton").addEventListener("click", printManagementReport);
  const movementForm = document.getElementById("accountingMovementForm");
  const payableForm = document.getElementById("accountingPayableForm");
  if (movementForm) movementForm.elements.date.value = today();
  document.getElementById("accountingOpeningForm")?.addEventListener("submit", (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); accountingState.openingBalances = { cash:Number(data.cash||0), bank:Number(data.bank||0), card:Number(data.card||0), wallet:Number(data.wallet||0) }; saveAccountingState(); persistAllData(); renderReports(); });
  movementForm?.addEventListener("submit", (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const amount=Number(data.amount||0); if(!(amount>0)) return; if(data.type==="transfer" && (!data.destinationAccount || data.destinationAccount===data.account)) return alert("Selecciona una cuenta de destino diferente."); accountingState.treasuryMovements.push({id:uid("accounting-"),type:data.type,account:data.account,destinationAccount:data.type==="transfer"?data.destinationAccount:"",concept:String(data.concept||"").trim(),amount,date:data.date||today(),createdAt:new Date().toISOString()}); event.currentTarget.reset(); event.currentTarget.elements.date.value=today(); saveAccountingState(); persistAllData(); renderReports(); });
  payableForm?.addEventListener("submit", (event) => { event.preventDefault(); const data=Object.fromEntries(new FormData(event.currentTarget)); const amount=Number(data.amount||0); if(!(amount>0)) return; accountingState.payables.push({id:uid("payable-"),supplier:String(data.supplier||"").trim(),concept:String(data.concept||"").trim(),amount,balance:amount,dueDate:data.dueDate||"",status:"pending",createdAt:new Date().toISOString()}); event.currentTarget.reset(); saveAccountingState(); persistAllData(); renderReports(); });
  document.getElementById("accountingMovementsTable")?.addEventListener("click", (event) => { const button=event.target.closest("[data-delete-accounting-movement]"); if(!button)return; accountingState.treasuryMovements=accountingState.treasuryMovements.filter((item)=>item.id!==button.dataset.deleteAccountingMovement); saveAccountingState(); persistAllData(); renderReports(); });
  document.getElementById("accountingPayablesTable")?.addEventListener("click", (event) => { const toggle=event.target.closest("[data-toggle-payable]"); const remove=event.target.closest("[data-delete-payable]"); if(toggle){const payable=accountingState.payables.find((item)=>item.id===toggle.dataset.togglePayable); if(!payable)return; payable.status=payable.status==="paid"?"pending":"paid";} else if(remove) accountingState.payables=accountingState.payables.filter((item)=>item.id!==remove.dataset.deletePayable); else return; saveAccountingState(); persistAllData(); renderReports(); });
  const detailPanel = document.getElementById("reportDetailPanel");
  document.getElementById("reportMetrics")?.addEventListener("click", (event) => {
    const category = event.target.closest("[data-report-category-id]");
    if (category) return openReportCategoryDetail(category.dataset.reportCategoryId);
    const root = event.target.closest("[data-report-root-kind]");
    if (root) openReportRootDetail(root.dataset.reportRootKind);
  });
  document.getElementById("closeReportDetail")?.addEventListener("click", closeReportCategoryDetail);
  detailPanel?.addEventListener("click", (event) => { if (event.target === detailPanel) closeReportCategoryDetail(); });
}

function reportDateRange() {
  return { from: document.getElementById("reportDateFrom")?.value || `${today().slice(0, 7)}-01`, to: document.getElementById("reportDateTo")?.value || today() };
}

function dateWithinReport(value, range = reportDateRange()) {
  const day = recordLocalDay(value);
  return Boolean(day && day >= range.from && day <= range.to);
}

function reportExpenseGroup(expense) {
  const category = menuItems.find((item) => item.id === expense.adminCategoryId);
  const categoryName = normalizedMenuLabel(category?.label || "");
  const concept = normalizedMenuLabel(`${expense.concept || ""} ${expense.productName || ""}`);
  if (expense.fixedExpenseId || /gastos? fijos?/.test(categoryName)) return "fixed";
  if (/comida|alimento|desayuno|almuerzo|merienda|cena|restaurant|restaurante/.test(`${categoryName} ${concept}`)) return "food";
  if (/cadete|envio|flete|delivery|reparto/.test(`${categoryName} ${concept}`)) return "courier";
  if (/^compras?$/.test(categoryName) || expense.productId || expense.quantity || expense.unitCost) return "purchases";
  return "other";
}

function reportRootCategory(kind) {
  const pattern = kind === "income" ? /^ingresos?$/ : kind === "expense" ? /^gastos?$/ : /^utilidades?$/;
  return menuItems.find((item) => item.parentId === "module-reports" && !item.view && pattern.test(normalizedMenuLabel(item.label)));
}

function reportCategoryAmount(item, report, kind) {
  const ids = new Set([item.id, ...menuDescendantIds(item.id)]);
  if (kind === "expense") {
    return state.expenses.filter((expense) => !expense.annulledAt
      && !isInventoryPurchaseRecord(expense)
      && dateWithinReport(expense.date || expense.createdAt, report.range)
      && ids.has(expense.adminCategoryId)).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }
  const label = normalizedMenuLabel(item.label);
  if (/^ingresos?$/.test(label)) return report.income;
  if (/^gastos?$/.test(label)) return report.expenses;
  if (/^utilidades?$/.test(label)) return report.profit;
  return 0;
}

function reportCategoryItemsMarkup(parentId, report, kind, visited = new Set()) {
  return menuItems.filter((item) => item.parentId === parentId && !visited.has(item.id))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es"))
    .map((item) => {
      const nextVisited = new Set([...visited, item.id]);
      const children = menuItems.some((candidate) => candidate.parentId === item.id && !nextVisited.has(candidate.id));
      return `<div class="report-category-node" tabindex="0" data-report-category-id="${item.id}" role="button">
        <div class="report-category-row"><span>${escapeHtml(item.label)}</span><span class="report-category-value">${money.format(reportCategoryAmount(item, report, kind))}</span>${children ? '<span class="report-category-arrow">›</span>' : ""}</div>
        ${children ? `<div class="report-category-children">${reportCategoryItemsMarkup(item.id, report, kind, nextVisited)}</div>` : ""}
      </div>`;
    }).join("");
}

function reportCategoryMetric(label, value, tone, kind, report, align = "right", categoryRoot = null) {
  const root = categoryRoot || reportRootCategory(kind);
  const children = root ? reportCategoryItemsMarkup(root.id, report, kind) : "";
  return `<article class="metric ${tone} report-category-metric cascade-${align}" tabindex="0" role="button" data-report-root-kind="${escapeHtml(kind)}" aria-label="${escapeHtml(label)} ${escapeHtml(value)}. Haz clic para ver el detalle.">
    <span class="report-category-title">${escapeHtml(label)} <small>Subcategorías</small></span>
    <strong>${escapeHtml(value)}</strong>
    <div class="report-category-cascade">
      ${children || '<p class="report-category-empty">Sin subcategorías. Créala desde Configuración.</p>'}
    </div>
  </article>`;
}

function reportRootMetric(item, index, report) {
  const label = normalizedMenuLabel(item.label);
  let kind = "custom";
  let value = reportCategoryAmount(item, report, kind);
  let tone = "tech";
  if (/^ingresos?$/.test(label)) {
    kind = "income";
    value = report.income;
    tone = "ok";
  } else if (/^gastos?$/.test(label)) {
    kind = "expense";
    value = report.expenses;
    tone = "danger";
  } else if (/^utilidades?$/.test(label)) {
    kind = "utility";
    value = report.profit;
    tone = report.profit >= 0 ? "ok" : "danger";
  } else if (/^ventas?$/.test(label)) {
    kind = "sales";
    value = report.salesIncome;
    tone = "tech";
  }
  const formattedValue = money.format(value);
  return reportCategoryMetric(item.label, formattedValue, tone, kind, report, index % 4 >= 2 ? "left" : "right", item);
}

function buildReportData() {
  const range = reportDateRange();
  const days = new Map();
  const ensureDay = (date) => { if (!days.has(date)) days.set(date, { date, income: 0, expenses: 0, sales: 0, salesIncome: 0 }); return days.get(date); };
  const productTotals = new Map();
  const expenseBreakdown = { fixed: 0, food: 0, courier: 0, purchases: 0, other: 0 };
  state.sales.filter((sale) => !sale.annulledAt && dateWithinReport(sale.date || sale.createdAt, range)).forEach((sale) => {
    const day = recordLocalDay(sale.date || sale.createdAt);
    const record = ensureDay(day);
    record.income += saleNetTotal(sale);
    record.salesIncome += saleNetTotal(sale);
    record.sales += 1;
    const items = sale.items?.length ? sale.items : [{ productId: sale.productId, productDescription: sale.productDescription || "Producto", quantity: sale.quantity, total: sale.total }];
    items.forEach((item) => {
      const returnedItems = (sale.returns || []).flatMap((entry) => entry.items || []).filter((entry) => entry.productId === item.productId);
      const returnedQty = returnedItems.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
      const returnedAmount = returnedItems.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const key = item.productDescription || item.productId;
      const total = productTotals.get(key) || { name: key, quantity: 0, amount: 0 };
      total.quantity += Number(item.quantity || 0) - returnedQty;
      total.amount += Number(item.total || 0) - returnedAmount;
      productTotals.set(key, total);
    });
  });
  state.orders.filter((order) => !isSaleOrder(order)).forEach((order) => {
    if (order.paymentMovements?.length) {
      order.paymentMovements.filter((movement) => dateWithinReport(movement.businessDate || movement.createdAt, range)).forEach((movement) => { ensureDay(recordLocalDay(movement.businessDate || movement.createdAt)).income += Number(movement.amount || 0); });
    } else if (orderCollectedAmount(order) > 0 && dateWithinReport(order.paidAt || order.date, range)) ensureDay(recordLocalDay(order.paidAt || order.date)).income += orderCollectedAmount(order);
  });
  state.expenses.filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense) && dateWithinReport(expense.date || expense.createdAt, range)).forEach((expense) => {
    const amount = Number(expense.amount || 0);
    ensureDay(recordLocalDay(expense.date || expense.createdAt)).expenses += amount;
    expenseBreakdown[reportExpenseGroup(expense)] += amount;
  });
  const rows = [...days.values()].sort((left, right) => right.date.localeCompare(left.date)).map((row) => ({ ...row, profit: row.income - row.expenses }));
  const products = [...productTotals.values()].filter((item) => item.quantity || item.amount).sort((left, right) => right.quantity - left.quantity || right.amount - left.amount);
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const expenses = rows.reduce((sum, row) => sum + row.expenses, 0);
  return { range, rows, products, income, expenses, expenseBreakdown, profit: income - expenses, sales: rows.reduce((sum, row) => sum + row.sales, 0), salesIncome: rows.reduce((sum, row) => sum + row.salesIncome, 0) };
}

function renderReports() {
  const container = document.getElementById("reportMetrics");
  if (!container) return;
  const report = buildReportData();
  renderCapitalBalance();
  renderAccountingOverview();
  const reportRoots = menuItems
    .filter((item) => item.parentId === "module-reports" && !item.view)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "es"));
  container.innerHTML = [
    ...reportRoots.map((item, index) => reportRootMetric(item, index, report))
  ].join("");
  const maxValue = Math.max(1, ...report.rows.flatMap((row) => [row.income, row.expenses]));
  document.getElementById("reportChart").innerHTML = report.rows.length ? report.rows.map((row) => `<div class="report-chart-row"><span>${formatDate(row.date)}</span><div class="report-bar-track"><i class="report-bar income" style="width:${Math.max(1, row.income / maxValue * 100)}%" title="Ingresos ${money.format(row.income)}"></i><i class="report-bar expense" style="width:${Math.max(1, row.expenses / maxValue * 100)}%" title="Gastos ${money.format(row.expenses)}"></i></div></div>`).join("") : `<p class="empty">No hay movimientos en este período.</p>`;
  const bestProduct = report.products[0];
  const bestDay = [...report.rows].sort((a, b) => b.profit - a.profit)[0];
  document.getElementById("reportHighlights").innerHTML = `<div><small>Producto más vendido</small><strong>${escapeHtml(bestProduct?.name || "Sin ventas")}</strong></div><div><small>Mejor día</small><strong>${bestDay ? formatDate(bestDay.date) : "-"}</strong></div><div><small>Margen neto</small><strong>${report.income ? `${(report.profit / report.income * 100).toFixed(1)}%` : "0%"}</strong></div><div><small>Período</small><strong>${formatDate(report.range.from)} – ${formatDate(report.range.to)}</strong></div>`;
  setTable("reportTable", report.rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${money.format(row.income)}</td><td>${money.format(row.expenses)}</td><td class="money-cell">${money.format(row.profit)}</td><td>${row.sales}</td></tr>`), 5, "No hay datos para el período.");
  setTable("reportProductsTable", report.products.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td class="money-cell">${money.format(item.amount)}</td></tr>`), 3, "No hay productos vendidos en el período.");
}

function renderCapitalBalance() {
  const value = document.getElementById("currentCapitalValue");
  if (!value) return;
  const snapshot = buildAccountingSnapshot();
  const current = snapshot.operatingCapital;
  value.textContent = money.format(current);
  value.classList.toggle("negative", current < 0);
  const detail = document.getElementById("currentCapitalDetail");
  if (detail) detail.textContent = `Capital inicial ${money.format(snapshot.initialCapital)} + utilidades acumuladas ${money.format(snapshot.accumulatedProfit)}`;
}

function accountingAccountForMethod(method) {
  const label = normalizedMenuLabel(method || "efectivo");
  if (/tarjeta|credito/.test(label)) return "card";
  if (/transferencia|debito|banco/.test(label)) return "bank";
  if (/billetera|mercado pago/.test(label)) return "wallet";
  return "cash";
}

function isNonCashCostRecord(expense) { return Boolean(expense?.saleId || expense?.stockCostOrderKey || isInventoryPurchaseRecord(expense)); }

function buildAccountingSnapshot() {
  const accounts = { cash: Number(accountingState.openingBalances.cash || 0), bank: Number(accountingState.openingBalances.bank || 0), card: Number(accountingState.openingBalances.card || 0), wallet: Number(accountingState.openingBalances.wallet || 0) };
  state.sales.filter((sale) => !sale.annulledAt).forEach((sale) => { (sale.payments?.length ? sale.payments : [{ method: sale.paymentMethod || "Efectivo", amount: saleNetTotal(sale) }]).forEach((payment) => { accounts[accountingAccountForMethod(payment.method)] += Number(payment.amount || 0); }); });
  state.orders.filter((order) => !isSaleOrder(order)).forEach((order) => { if (order.paymentMovements?.length) order.paymentMovements.forEach((movement) => { accounts[accountingAccountForMethod(movement.method)] += Number(movement.amount || 0); }); else if (orderCollectedAmount(order) > 0) accounts.cash += orderCollectedAmount(order); });
  state.expenses.filter((expense) => !expense.annulledAt && expense.paymentStatus !== "Pendiente" && !isNonCashCostRecord(expense)).forEach((expense) => { accounts[expense.account || accountingAccountForMethod(expense.paymentMethod)] -= Number(expense.amount || 0); });
  accountingState.treasuryMovements.filter((movement) => !movement.annulledAt).forEach((movement) => { const amount = Number(movement.amount || 0); const account = movement.account || "cash"; if (["contribution","income"].includes(movement.type)) accounts[account] += amount; else if (["withdrawal","expense","payable_payment"].includes(movement.type)) accounts[account] -= amount; else if (movement.type === "transfer" && movement.destinationAccount !== account) { accounts[account] -= amount; accounts[movement.destinationAccount] += amount; } });
  const inventory = state.products.reduce((sum, product) => sum + Math.max(0, Number(product.stock || 0)) * Math.max(0, Number(product.costPrice || 0)), 0);
  const receivables = state.orders.filter((order) => !isSaleOrder(order) && (order.repairStatus || order.status) !== "Cancelado").reduce((sum, order) => sum + Math.max(0, Number(order.budget || 0) - orderCollectedAmount(order)), 0);
  const payables = accountingState.payables.filter((item) => item.status !== "paid").reduce((sum, item) => sum + Number(item.balance ?? item.amount ?? 0), 0);
  const liquid = Object.values(accounts).reduce((sum, amount) => sum + amount, 0);
  const totalIncome = state.sales.filter((sale) => !sale.annulledAt).reduce((sum, sale) => sum + saleNetTotal(sale), 0)
    + state.orders.filter((order) => !isSaleOrder(order)).reduce((sum, order) => sum + orderCollectedAmount(order), 0)
    + accountingState.treasuryMovements.filter((movement) => !movement.annulledAt && movement.type === "income").reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const totalExpenses = state.expenses.filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense)).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    + accountingState.treasuryMovements.filter((movement) => !movement.annulledAt && movement.type === "expense").reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const initialCapital = Number(localStorage.getItem(CAPITAL_INITIAL_KEY) || 0);
  const accumulatedProfit = totalIncome - totalExpenses;
  return { accounts, liquid, inventory, receivables, payables, initialCapital, accumulatedProfit, operatingCapital: initialCapital + accumulatedProfit };
}

function renderAccountingOverview() {
  const container = document.getElementById("accountingMetrics"); if (!container) return;
  const snapshot = buildAccountingSnapshot();
  const cards = [["Caja",snapshot.accounts.cash],["Banco / transferencias",snapshot.accounts.bank],["Tarjetas pendientes",snapshot.accounts.card],["Billeteras",snapshot.accounts.wallet],["Disponible total",snapshot.liquid],["Stock al costo",snapshot.inventory],["Cuentas por cobrar",snapshot.receivables],["Cuentas por pagar",snapshot.payables],["Capital actual",snapshot.operatingCapital]];
  container.innerHTML = cards.map(([label,amount]) => `<article><span>${label}</span><strong class="${amount < 0 ? "negative" : ""}">${money.format(amount)}</strong></article>`).join("");
  const form = document.getElementById("accountingOpeningForm"); if (form) Object.entries(accountingState.openingBalances).forEach(([key,amount]) => { if (form.elements[key]) form.elements[key].value = Number(amount || 0) || ""; });
  setTable("accountingMovementsTable", [...accountingState.treasuryMovements].reverse().map((m) => `<tr><td>${formatDate(m.date)}</td><td>${escapeHtml(m.type)}</td><td>${escapeHtml(m.account)}${m.destinationAccount ? ` → ${escapeHtml(m.destinationAccount)}` : ""}</td><td>${escapeHtml(m.concept)}</td><td>${money.format(m.amount)}</td><td><button class="row-action" data-delete-accounting-movement="${m.id}">Borrar</button></td></tr>`), 6, "No hay movimientos manuales.");
  setTable("accountingPayablesTable", accountingState.payables.map((p) => `<tr><td>${escapeHtml(p.supplier)}</td><td>${escapeHtml(p.concept)}</td><td>${p.dueDate ? formatDate(p.dueDate) : "-"}</td><td>${money.format(p.balance ?? p.amount)}</td><td>${p.status === "paid" ? "Pagada" : "Pendiente"}</td><td><button class="row-action" data-toggle-payable="${p.id}">${p.status === "paid" ? "Reabrir" : "Marcar pagada"}</button> <button class="row-action" data-delete-payable="${p.id}">Borrar</button></td></tr>`), 6, "No hay cuentas por pagar.");
}

function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

function exportReportCsv() {
  const report = buildReportData();
  const lines = [["Fecha", "Ingresos", "Gastos", "Utilidad", "Ventas"], ...report.rows.map((row) => [row.date, row.income, row.expenses, row.profit, row.sales]), [], ["Producto", "Unidades", "Importe neto"], ...report.products.map((item) => [item.name, item.quantity, item.amount])];
  const blob = new Blob(["\ufeff" + lines.map((line) => line.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `informe-${report.range.from}-a-${report.range.to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function printManagementReport() {
  const report = buildReportData();
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) return alert("El navegador bloqueó la ventana de impresión.");
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Informe ${report.range.from} - ${report.range.to}</title><style>body{font-family:Arial;padding:28px;color:#172033}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ccd5e1;padding:8px;text-align:left}.summary{display:flex;gap:22px;flex-wrap:wrap}.summary div{padding:12px;border:1px solid #ccd5e1;border-radius:8px}small{color:#667085}</style></head><body><h1>Informe del sistema de gestión</h1><p>${formatDate(report.range.from)} – ${formatDate(report.range.to)}</p><div class="summary"><div><small>Ingresos</small><br><strong>${money.format(report.income)}</strong></div><div><small>Gastos</small><br><strong>${money.format(report.expenses)}</strong></div><div><small>Utilidad</small><br><strong>${money.format(report.profit)}</strong></div></div><table><thead><tr><th>Fecha</th><th>Ingresos</th><th>Gastos</th><th>Utilidad</th><th>Ventas</th></tr></thead><tbody>${report.rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${money.format(row.income)}</td><td>${money.format(row.expenses)}</td><td>${money.format(row.profit)}</td><td>${row.sales}</td></tr>`).join("")}</tbody></table><h2>Productos vendidos</h2><table><thead><tr><th>Producto</th><th>Unidades</th><th>Importe</th></tr></thead><tbody>${report.products.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${money.format(item.amount)}</td></tr>`).join("")}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`);
  popup.document.close();
}

function updateAutosaveStatus() {
  const status = document.getElementById("autosaveStatus");
  if (!status) return;
  const savedAt = localStorage.getItem(SAVE_META_KEY);
  status.textContent = savedAt
    ? `Guardado automático activo · Último guardado: ${new Date(savedAt).toLocaleString("es-UY")}`
    : "Guardado automático activo.";
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${GESTION_API_URL}${path}`, {
    method: options.method || "GET",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "No se pudo comunicar con el servidor.");
  }
  return data;
}

async function refreshStateFromApi() {
  try {
    let data = await apiRequest("/bootstrap");
    state = normalizeState({
      ...data,
      sales: data.sales?.length ? data.sales : state.sales,
      expenses: data.expenses?.length ? data.expenses : state.expenses
    });
    apiOnline = true;
    const hasRemoteFinancialState = applyRemoteFinancialState(data.financialState);
    financialStateLoaded = true;
    saveState();
    render();
    if (await syncStockMenuCategories()) {
      data = await apiRequest("/bootstrap");
      state = normalizeState({
        ...data,
        sales: data.sales?.length ? data.sales : state.sales,
        expenses: data.expenses?.length ? data.expenses : state.expenses
      });
    }
    ensureSaleAccountingRecords();
    syncAllOrderStockCostExpenses();
    if (!hasRemoteFinancialState || preferencesNeedMigration) { scheduleFinancialStatePersist(0); preferencesNeedMigration = false; }
    remoteCatalogSignature = catalogSignature(state);
    saveState();
    render();
  } catch (error) {
    apiOnline = false;
    console.warn("Sistema de gestion en modo local:", error);
  }
}

async function syncStockMenuCategories() {
  const stockMenuCategories = menuItems.filter((item) => item.parentId === "module-products" && !item.view);
  let created = false;
  for (const item of stockMenuCategories) {
    const exists = state.productCategories.some((category) => normalizedMenuLabel(category.name) === normalizedMenuLabel(item.label));
    if (exists) continue;
    await apiRequest("/categories", {
      method: "POST",
      body: { id: `stock-${item.id}`, name: item.label }
    });
    created = true;
  }
  return created;
}

function catalogSignature(source) {
  return JSON.stringify({
    categories: (source.productCategories || []).map((item) => [item.id, item.name]),
    webCategories: (source.webProductCategories || []).map((item) => [item.id, item.name]),
    products: (source.products || []).map((item) => [item.id, item.categoryId, item.name, item.stock, item.costPrice, item.salePrice, item.inventoryScope]),
    services: (source.services || []).map((item) => [item.id, item.category, item.name, item.brand, item.model, item.productKey, item.costPrice, item.salePrice, item.active]),
    serviceCategories: (source.serviceCategories || []).map((item) => [item.id, item.name])
  });
}

function startRemoteCatalogSync() {
  clearInterval(remoteSyncTimer);
  remoteSyncTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const data = await apiRequest("/bootstrap");
      const updated = normalizeState({ ...data, sales: state.sales, expenses: state.expenses });
      apiOnline = true;
      const nextSignature = catalogSignature(updated);
      if (nextSignature === remoteCatalogSignature) return;
      state = updated;
      remoteCatalogSignature = nextSignature;
      saveState();
      render();
    } catch (error) {
      apiOnline = false;
      console.warn("Sincronizacion automatica pausada:", error);
    }
  }, REMOTE_SYNC_INTERVAL_MS);
}

async function syncAfterRemoteChange() {
  if (!apiOnline) return;
  await refreshStateFromApi();
}

function bindNavigation() {
  document.getElementById("beimWebsiteButton").addEventListener("click", async () => {
    if (!canAccessManagementView("openWebsite")) return alert("Tu usuario no tiene permiso para abrir la web.");
    if (!currentManagementUser) return;
    try {
      const payload = await apiRequest("/management-web-launch", { method: "POST", body: { actorId: currentManagementUser.id } });
      window.open(payload.url || BEIM_WEBSITE_URL, "_blank", "noopener,noreferrer");
    } catch (error) { alert(error.message || "No se pudo abrir la cuenta web vinculada."); }
  });

  document.querySelector(".nav").addEventListener("click", (event) => {
    const groupButton = event.target.closest("[data-menu-group]");
    if (groupButton) {
      groupButton.closest(".menu-node")?.classList.toggle("open");
      showMenuCategory(groupButton.dataset.menuGroup);
      return;
    }
    const button = event.target.closest(".nav-button");
    if (button) {
      if (button.dataset.view === "products") {
        stockSubmenuExpanded = activeView === "products" ? !stockSubmenuExpanded : true;
        selectedProductCategoryId = "all";
      } else {
        stockSubmenuExpanded = false;
      }
      lastSidebarView = button.dataset.view;
      showView(button.dataset.view);
      renderProducts();
    }
  });

  document.getElementById("newOrderButton").addEventListener("click", async () => {
    returnAfterOrderView = activeView === "newOrder" ? returnAfterOrderView : lastSidebarView;
    await prepareNewOrderFrame();
    showView("newOrder");
  });

  document.getElementById("productCategorySettingsButton")?.addEventListener("click", openCategorySettings);
  document.getElementById("closeCategorySettings")?.addEventListener("click", closeCategorySettings);
  document.getElementById("categorySettingsPanel")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeCategorySettings();
    }
  });

  document.getElementById("globalSearch").addEventListener("input", (event) => {
    globalSearchTerm = event.currentTarget.value.trim().toLowerCase();
    render();
  });

  document.getElementById("adminPeriodMode").addEventListener("change", (event) => {
    adminPeriodMode = event.currentTarget.value;
    updateAdminPeriodControls();
    render();
  });
  document.getElementById("adminSpecificDay").addEventListener("change", (event) => {
    adminSpecificDay = event.currentTarget.value || today();
    render();
  });
  document.getElementById("adminSpecificMonth").addEventListener("change", (event) => {
    adminSpecificMonth = event.currentTarget.value || currentAccountingMonth();
    render();
  });

  document.getElementById("saveOrderButton").addEventListener("click", async () => {
    await runReceiptAction("save");
  });

  document.getElementById("printOrderButton").addEventListener("click", async () => {
    await runReceiptAction("print");
  });

  document.getElementById("cancelOrderButton").addEventListener("click", cancelNewOrderCreation);
}

function showView(view) {
  if (!canAccessManagementView(view)) {
    alert("Tu usuario no tiene permiso para abrir esta sección.");
    view = "dashboard";
  }
  if (view !== "settings") reportSubcategoryEditorOpen = false;
  document.querySelectorAll(".nav-button").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.getElementById(view).classList.add("active");
  document.getElementById("viewTitle").textContent = views[view];
  const reportsView = view === "reports";
  document.body.classList.toggle("reports-view", reportsView);
  document.querySelector(".topbar").hidden = reportsView;
  const selectedMenuCategory = menuItems.find((item) => item.id === selectedMenuCategoryId);
  const reportAdministrativeView = view === "menuCategory"
    && menuDescendantIds("module-reports").includes(selectedMenuCategoryId);
  const administrativeView = view === "menuCategory"
    && (normalizedMenuLabel(selectedMenuCategory?.label).includes("servicios administrativos") || reportAdministrativeView);
  document.querySelector(".topbar-search").hidden = administrativeView;
  document.getElementById("adminPeriodControls").hidden = !administrativeView;
  if (administrativeView) updateAdminPeriodControls();
  const stockSubnav = document.getElementById("sidebarProductCategories");
  const hasStockCategories = sortedStockCategories().some((category) => category.name.toLowerCase() !== "general");
  stockSubnav?.classList.toggle("visible", hasStockCategories && stockSubmenuExpanded);
  document.querySelector(".nav-stock-toggle")?.setAttribute("aria-expanded", String(hasStockCategories && stockSubmenuExpanded));
  activeView = view;
}

function updateAdminPeriodControls() {
  const dayInput = document.getElementById("adminSpecificDay");
  const monthInput = document.getElementById("adminSpecificMonth");
  dayInput.hidden = adminPeriodMode !== "specificDay";
  monthInput.hidden = adminPeriodMode !== "specificMonth";
  dayInput.value = adminSpecificDay;
  monthInput.value = adminSpecificMonth;
}

function recordMatchesAdminPeriod(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return false;
  const localDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const localMonth = localDay.slice(0, 7);
  if (adminPeriodMode === "specificDay") return localDay === adminSpecificDay;
  if (adminPeriodMode === "specificMonth") return localMonth === adminSpecificMonth;
  if (adminPeriodMode === "year") return date.getFullYear() === now.getFullYear();
  if (adminPeriodMode === "day") return localDay === today();
  return localMonth === currentAccountingMonth(now);
}

function incomeForAdminPeriod() {
  const salesIncome = state.sales
    .filter((sale) => !sale.annulledAt)
    .filter((sale) => recordMatchesAdminPeriod(sale.date || sale.createdAt))
    .reduce((sum, sale) => sum + saleNetTotal(sale), 0);
  const orderIncome = state.orders
    .filter((order) => !isSaleOrder(order) && orderCollectedAmount(order) > 0)
    .filter((order) => recordMatchesAdminPeriod(order.paidAt || order.finishedAt || order.date))
    .reduce((sum, order) => sum + orderCollectedAmount(order), 0);
  return salesIncome + orderIncome;
}

function expensesForAdminPeriod() {
  return state.expenses
    .filter((expense) => !expense.annulledAt)
    .filter((expense) => recordMatchesAdminPeriod(expense.date || expense.createdAt))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function utilityForAdminPeriod() {
  return incomeForAdminPeriod() - expensesForAdminPeriod();
}

function isSaleOrder(order) {
  return order?.orderType === "sale" || Boolean(order?.saleId) || normalizedMenuLabel(order?.problem).includes("orden de venta");
}

function saleNetTotal(sale) {
  if (!sale || sale.annulledAt) return 0;
  return Math.max(0, Number(sale.total || 0) - Number(sale.returnedAmount || 0));
}

function orderCollectedAmount(order) {
  if (!order || isSaleOrder(order)) return 0;
  const paid = Number(order.paid || 0);
  if (paid > 0) return paid;
  return normalizePaymentStatus(order.paymentStatus) === "Pagado" ? Number(order.budget || 0) : 0;
}

function showMenuCategory(categoryId) {
  const category = menuItems.find((item) => item.id === categoryId && !item.view);
  if (!category) return;
  selectedMenuCategoryId = categoryId;
  lastSidebarView = "menuCategory";
  showView("menuCategory");
  document.getElementById("viewTitle").textContent = category.label;
  document.getElementById("menuCategoryTitle").textContent = category.label;
  document.getElementById("menuCategorySubnav").innerHTML = "";
  renderMenuCategoryLinks();
}

function renderMenuCategoryLinks() {
  const container = document.getElementById("menuCategoryLinks");
  const subnav = document.getElementById("menuCategorySubnav");
  if (!container || !subnav) return;
  const children = menuItems
    .filter((item) => item.parentId === selectedMenuCategoryId)
    .sort((left, right) => left.order - right.order);
  container.innerHTML = "";
  subnav.innerHTML = children.length
    ? children.map((item, index) => renderAdministrativeCascadeItem(item, index, true)).join("")
    : `<span class="empty">Sin categorías.</span>`;
  subnav.querySelectorAll("[data-menu-card]").forEach((card) => {
    card.addEventListener("click", () => {
      clearTimeout(menuCardClickTimer);
      menuCardClickTimer = setTimeout(() => {
        const item = menuItems.find((entry) => entry.id === card.dataset.menuCard);
        if (item?.view) {
          lastSidebarView = item.view;
          showView(item.view);
        } else {
          showMenuItemDetail(card.dataset.menuCard);
        }
      }, 240);
    });
    card.addEventListener("dblclick", () => {
      clearTimeout(menuCardClickTimer);
      const item = menuItems.find((entry) => entry.id === card.dataset.menuCard);
      if (item?.view) {
        lastSidebarView = item.view;
        showView(item.view);
      } else {
        showMenuItemTransactions(card.dataset.menuCard);
      }
    });
  });
  container.querySelectorAll("[data-open-menu-item]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const item = menuItems.find((entry) => entry.id === button.dataset.openMenuItem);
    if (!item) return;
    if (item.view) {
      lastSidebarView = item.view;
      showView(item.view);
      if (item.view === "products") {
        stockSubmenuExpanded = true;
        document.getElementById("sidebarProductCategories").classList.add("visible");
      }
    } else {
      showMenuCategory(item.id);
    }
  }));
}

function renderAdministrativeCascadeItem(item, index = 0, isRoot = false, visited = new Set()) {
  if (!item || visited.has(item.id)) return "";
  const nextVisited = new Set([...visited, item.id]);
  const children = menuItems
    .filter((child) => child.parentId === item.id)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const colorHue = Number.isFinite(Number(item.colorHue)) ? Number(item.colorHue) : Math.round((index * 137.508) % 360);
  return `<div class="admin-cascade-item${isRoot ? " root" : ""}${children.length ? " has-children" : ""}" style="--category-bg:hsl(${colorHue} 72% 88%);--category-fg:hsl(${colorHue} 68% 27%)">
    <button class="${isRoot ? "menu-top-category" : "admin-cascade-button"}" type="button" data-menu-card="${item.id}">
      <span>${escapeHtml(item.label)}${!isRoot && children.length ? `<i aria-hidden="true">›</i>` : ""}</span>
      <strong>${money.format(menuItemAccountingValue(item))}</strong>
    </button>
    ${children.length ? `<div class="admin-cascade-menu">${children.map((child, childIndex) => renderAdministrativeCascadeItem(child, childIndex, false, nextVisited)).join("")}</div>` : ""}
  </div>`;
}

function menuItemAccountingValue(item, visited = new Set()) {
  if (!item || visited.has(item.id)) return 0;
  const normalizedLabel = item.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalizedLabel.includes("gastos fijos")) {
    return -state.expenses
      .filter((expense) => !expense.annulledAt)
      .filter((expense) => expense.fixedExpenseId && recordMatchesAdminPeriod(expense.date || expense.createdAt))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }
  if (normalizedLabel === "ingresos" || normalizedLabel.includes("ingresos del mes")) {
    return incomeForAdminPeriod();
  }
  if (/^utilidades?$/.test(normalizedLabel)) {
    return utilityForAdminPeriod();
  }
  if (normalizedLabel.includes("efectivo en caja") || normalizedLabel === "caja") {
    return utilityForAdminPeriod();
  }
  const nextVisited = new Set([...visited, item.id]);
  if (item.view === "sales") return incomeForAdminPeriod();
  if (item.view === "expenses") return -state.expenses.filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense) && recordMatchesAdminPeriod(expense.date || expense.createdAt)).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  if (item.view === "products") return workshopProducts().reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.costPrice || 0), 0);
  if (item.view === "orders") return state.orders.reduce((sum, order) => sum + Number(order.budget || 0), 0);
  const directExpenses = state.expenses
    .filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense))
    .filter((expense) => expense.adminCategoryId === item.id && recordMatchesAdminPeriod(expense.date || expense.createdAt))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return -directExpenses + menuItems
    .filter((child) => child.parentId === item.id)
    .reduce((sum, child) => sum + menuItemAccountingValue(child, nextVisited), 0);
}

function showMenuItemDetail(itemId) {
  const item = menuItems.find((entry) => entry.id === itemId);
  const detail = document.getElementById("menuCategoryDetail");
  if (!item || !detail) return;
  const normalizedLabel = item.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/^utilidades?$/.test(normalizedLabel)) {
    renderAdministrativeUtility(item);
    return;
  }
  if (normalizedLabel.includes("gastos fijos")) {
    renderFixedExpenses(item);
    return;
  }
  if (isAdministrativeExpenseItem(itemId)) {
    renderAdministrativeExpenseItem(item);
    return;
  }
  const parent = menuItems.find((entry) => entry.id === item.parentId);
  const children = menuItems.filter((entry) => entry.parentId === item.id).sort((left, right) => left.order - right.order);
  detail.hidden = false;
  detail.innerHTML = `
    <div class="menu-category-detail-head">
      <div><p class="eyebrow">Detalle de subcategoría</p><h3>${escapeHtml(item.label)}</h3></div>
      <button class="row-action" type="button" data-close-menu-detail>Cerrar</button>
    </div>
    <div class="menu-category-detail-grid">
      <div><small>Categoría superior</small><strong>${escapeHtml(parent?.label || "Nivel principal")}</strong></div>
      <div><small>Tipo</small><strong>${item.view ? "Módulo del sistema" : "Categoría organizativa"}</strong></div>
      <div><small>Posición</small><strong>${Number(item.order || 0) + 1}</strong></div>
      <div><small>Subcategorías</small><strong>${children.length}</strong></div>
    </div>
    ${children.length ? `<div class="menu-detail-children"><small>Contenido</small><p>${children.map((child) => escapeHtml(child.label)).join(" · ")}</p></div>` : ""}
  `;
  detail.querySelector("[data-close-menu-detail]").addEventListener("click", () => { detail.hidden = true; });
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderAdministrativeUtility(item) {
  const detail = document.getElementById("menuCategoryDetail");
  const income = incomeForAdminPeriod();
  const expenses = expensesForAdminPeriod();
  const utility = income - expenses;
  detail.hidden = false;
  detail.innerHTML = `
    <div class="menu-category-detail-head">
      <div><p class="eyebrow">Estadística del período seleccionado</p><h3>${escapeHtml(item.label)}</h3></div>
      <button class="row-action" type="button" data-close-menu-detail>Cerrar</button>
    </div>
    <div class="menu-category-detail-grid">
      <div><small>Ingresos</small><strong>${money.format(income)}</strong></div>
      <div><small>Gastos</small><strong>${money.format(expenses)}</strong></div>
      <div><small>Utilidades</small><strong>${money.format(utility)}</strong></div>
    </div>`;
  detail.querySelector("[data-close-menu-detail]").addEventListener("click", () => { detail.hidden = true; });
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function currentAccountingMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizedMenuLabel(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isAdministrativeExpenseItem(itemId) {
  let current = menuItems.find((item) => item.id === itemId);
  while (current) {
    if (normalizedMenuLabel(current.label) === "gastos") return current.id !== itemId;
    current = menuItems.find((item) => item.id === current.parentId);
  }
  return false;
}

function findAdministrativeExpenseCategory(pattern) {
  const matcher = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
  return menuItems.find((item) => isAdministrativeExpenseItem(item.id) && matcher.test(normalizedMenuLabel(item.label)));
}

function ensureAdministrativeExpenseCategory(label, pattern) {
  const existing = findAdministrativeExpenseCategory(pattern);
  if (existing) return existing;
  const expensesRoot = menuItems.find((item) => normalizedMenuLabel(item.label) === "gastos");
  if (!expensesRoot) return null;
  const siblings = menuItems.filter((item) => item.parentId === expensesRoot.id);
  const category = {
    id: uid("menu-"),
    label,
    view: "",
    parentId: expensesRoot.id,
    order: siblings.length,
    colorHue: Math.round((menuItems.length * 137.508) % 360)
  };
  menuItems.push(category);
  saveMenuItems();
  return category;
}

function classifyAdministrativeExpenseCategory(concept, fallbackItem) {
  const normalizedConcept = normalizedMenuLabel(concept);
  if (/(comida|alimento|desayuno|almuerzo|merienda|cena|restaurant|restaurante)/.test(normalizedConcept)) {
    return ensureAdministrativeExpenseCategory("Comida", /comida|alimento/);
  }
  if (/(cadete|envio|flete|delivery|reparto)/.test(normalizedConcept)) {
    return ensureAdministrativeExpenseCategory("Cadete", /cadete|envio/);
  }
  return fallbackItem;
}

function renderAdministrativeExpenseItem(item, detailOverride = null) {
  const detail = detailOverride || document.getElementById("menuCategoryDetail");
  const isPurchasesCategory = /^compras?$/.test(normalizedMenuLabel(item.label));
  const isCostOfSalesCategory = /costo (de )?(venta|producto)/.test(normalizedMenuLabel(item.label));
  const isAutomaticCategory = isPurchasesCategory || isCostOfSalesCategory;
  const records = state.expenses
    .filter((expense) => expense.adminCategoryId === item.id && !isInventoryPurchaseRecord(expense) && recordMatchesAdminPeriod(expense.date || expense.createdAt))
    .sort((left, right) => expenseTimestamp(right) - expenseTimestamp(left));
  detail.hidden = false;
  detail.innerHTML = `
    <div class="menu-category-detail-head">
      <div><p class="eyebrow">Gastos de la subcategoría</p><h3>${escapeHtml(item.label)}</h3></div>
      <button class="row-action" type="button" data-close-menu-detail>Cerrar</button>
    </div>
    ${isAutomaticCategory ? `<p class="administrative-category-note">Esta subcategoría recibe únicamente movimientos automáticos del sistema.</p>` : `<form class="administrative-expense-form" id="administrativeExpenseForm">
      <input name="concept" placeholder="Detalle del gasto" required>
      <input name="amount" type="number" min="0" step="0.01" placeholder="Valor" required>
      <input name="supplier" placeholder="Proveedor o responsable">
      <button type="submit">Guardar gasto</button>
    </form>`}
    <div class="table-wrap menu-history-table"><table><thead><tr><th>Día</th><th>Fecha</th><th>Hora</th><th>Referencia</th><th>Detalle</th><th>Proveedor</th><th>Valor</th></tr></thead><tbody>
      ${records.length ? records.map((record) => { const date = expenseTimestamp(record); return `<tr><td>${capitalizeText(date.toLocaleDateString("es-UY", { weekday: "long" }))}</td><td>${date.toLocaleDateString("es-UY")}</td><td>${date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}</td><td>${escapeHtml(record.invoiceNumber || "-")}</td><td>${escapeHtml(record.productName || record.concept)}</td><td>${escapeHtml(record.supplier || "-")}</td><td class="money-cell">${money.format(record.amount || 0)}</td></tr>`; }).join("") : `<tr><td colspan="7" class="empty">No hay gastos registrados.</td></tr>`}
    </tbody></table></div>`;
  detail.querySelector("[data-close-menu-detail]").addEventListener("click", () => { detailOverride ? closeReportCategoryDetail() : detail.hidden = true; });
  detail.querySelector("#administrativeExpenseForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount < 0) return;
    const concept = String(data.concept || "").trim();
    const targetCategory = classifyAdministrativeExpenseCategory(concept, item) || item;
    state.expenses.push({ id: uid("e"), adminCategoryId: targetCategory.id, concept, productName: concept, amount, supplier: String(data.supplier || "").trim() || "-", invoiceNumber: "-", createdAt: new Date().toISOString(), date: today() });
    commit();
    renderAdministrativeExpenseItem(targetCategory, detailOverride);
  });
}

function openReportCategoryDetail(itemId) {
  const item = menuItems.find((entry) => entry.id === itemId);
  const panel = document.getElementById("reportDetailPanel");
  const body = document.getElementById("reportDetailBody");
  if (!item || !panel || !body) return;
  document.getElementById("reportDetailTitle").textContent = item.label;
  document.activeElement?.blur?.();
  document.body.classList.add("report-detail-open");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  const label = normalizedMenuLabel(item.label);
  if (label.includes("gastos fijos")) renderFixedExpenses(item, body);
  else if (label.includes("stock")) renderStockExpenseDetail(item, body);
  else if (isAdministrativeExpenseItem(item.id)) renderAdministrativeExpenseItem(item, body);
  else body.innerHTML = `<p class="empty">No hay información detallada para esta subcategoría.</p>`;
}

function openReportRootDetail(kind) {
  const panel = document.getElementById("reportDetailPanel");
  const body = document.getElementById("reportDetailBody");
  const title = document.getElementById("reportDetailTitle");
  if (!panel || !body || !title) return;
  document.activeElement?.blur?.();
  document.body.classList.add("report-detail-open");
  const report = buildReportData();
  const range = report.range;
  const table = (headers, rows, emptyText) => `<div class="table-wrap menu-history-table"><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="empty">${emptyText}</td></tr>`}</tbody></table></div>`;
  let rows = [];
  let total = 0;
  if (kind === "income") {
    title.textContent = "Ingresos";
    const incomeEntries = [];
    state.sales.filter((sale) => !sale.annulledAt && dateWithinReport(sale.date || sale.createdAt, range)).forEach((sale) => {
      const amount = saleNetTotal(sale); total += amount;
      incomeEntries.push({ at: sale.createdAt || sale.date, reference: sale.number || "Venta", concept: `Venta · ${sale.productDescription || "Producto"}`, amount });
    });
    state.orders.filter((order) => !isSaleOrder(order)).forEach((order) => {
      if (order.paymentMovements?.length) {
        order.paymentMovements.filter((movement) => dateWithinReport(movement.businessDate || movement.createdAt, range)).forEach((movement) => {
          const amount = Number(movement.amount || 0); total += amount;
          incomeEntries.push({ at: movement.createdAt || movement.businessDate, reference: order.number || "Orden", concept: `Orden · ${order.clientName || "Cliente"}`, amount });
        });
      } else if (orderCollectedAmount(order) > 0 && dateWithinReport(order.paidAt || order.date, range)) {
        const amount = orderCollectedAmount(order); total += amount;
        incomeEntries.push({ at: order.paidAt || order.updatedAt || order.createdAt || order.date, reference: order.number || "Orden", concept: `Orden · ${order.clientName || "Cliente"}`, amount });
      }
    });
    rows = incomeEntries.sort((left, right) => reportEntryTimestamp(right.at) - reportEntryTimestamp(left.at)).map((entry) => `<tr><td>${formatReportEntryDateTime(entry.at)}</td><td>${escapeHtml(entry.reference)}</td><td>${escapeHtml(entry.concept)}</td><td class="money-cell">${money.format(entry.amount)}</td></tr>`);
    body.innerHTML = `<div class="report-detail-summary"><span>Total de ingresos</span><strong>${money.format(total)}</strong></div>${table(["Fecha y hora", "Referencia", "Concepto", "Ingreso"], rows, "No hay ingresos en el período.")}`;
  } else if (kind === "expense") {
    title.textContent = "Gastos";
    const records = state.expenses.filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense) && dateWithinReport(expense.date || expense.createdAt, range)).sort((a, b) => expenseTimestamp(b) - expenseTimestamp(a));
    total = records.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    rows = records.map((expense) => `<tr><td>${formatDate(recordLocalDay(expense.date || expense.createdAt))}</td><td>${escapeHtml(expense.invoiceNumber || expense.orderNumber || "-")}</td><td>${escapeHtml(expense.productName || expense.concept || "Gasto")}</td><td class="money-cell">${money.format(expense.amount || 0)}</td></tr>`);
    body.innerHTML = `<div class="report-detail-summary"><span>Total de gastos</span><strong>${money.format(total)}</strong></div>${table(["Fecha", "Referencia", "Concepto", "Gasto"], rows, "No hay gastos en el período.")}`;
  } else if (kind === "utility") {
    title.textContent = "Utilidades";
    rows = report.rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${money.format(row.income)}</td><td>${money.format(row.expenses)}</td><td class="money-cell">${money.format(row.profit)}</td></tr>`);
    body.innerHTML = `<div class="report-detail-summary"><span>Utilidad neta</span><strong>${money.format(report.profit)}</strong></div>${table(["Fecha", "Ingresos", "Gastos", "Utilidad"], rows, "No hay movimientos en el período.")}`;
  } else {
    title.textContent = "Ventas";
    const records = state.sales.filter((sale) => !sale.annulledAt && dateWithinReport(sale.date || sale.createdAt, range)).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    total = records.reduce((sum, sale) => sum + saleNetTotal(sale), 0);
    rows = records.map((sale) => `<tr><td>${formatDate(recordLocalDay(sale.date || sale.createdAt))}</td><td>${escapeHtml(sale.number || "-")}</td><td>${escapeHtml(sale.clientName || findName(state.clients, sale.clientId) || "Default")}</td><td>${escapeHtml(sale.productDescription || "Producto")}</td><td>${Number(sale.quantity || 0)}</td><td class="money-cell">${money.format(saleNetTotal(sale))}</td></tr>`);
    body.innerHTML = `<div class="report-detail-summary"><span>${records.length} venta${records.length === 1 ? "" : "s"}</span><strong>${money.format(total)}</strong></div>${table(["Fecha", "Venta", "Cliente", "Producto", "Cantidad", "Total"], rows, "No hay ventas en el período.")}`;
  }
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
}

function closeReportCategoryDetail() {
  const panel = document.getElementById("reportDetailPanel");
  panel?.classList.remove("open");
  panel?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("report-detail-open");
}

function renderStockExpenseDetail(item, detail) {
  const records = state.expenses.filter((expense) => expense.adminCategoryId === item.id && dateWithinReport(expense.date || expense.createdAt)).sort((left, right) => expenseTimestamp(right) - expenseTimestamp(left));
  const total = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  detail.hidden = false;
  detail.innerHTML = `
    <div class="menu-category-detail-head"><div><p class="eyebrow">Costos consumidos en ventas y servicios</p><h3>${escapeHtml(item.label)}</h3></div><strong>${money.format(total)}</strong></div>
    <p class="administrative-category-note">Cada costo queda asociado automáticamente a la venta u orden que consumió el producto o registró el gasto.</p>
    <div class="table-wrap menu-history-table"><table><thead><tr><th>Fecha</th><th>Orden / venta</th><th>Detalle</th><th>Cantidad</th><th>Costo unitario</th><th>Gasto</th></tr></thead><tbody>
      ${records.length ? records.map((record) => `<tr><td>${expenseTimestamp(record).toLocaleDateString("es-UY")}</td><td><strong>${escapeHtml(record.orderNumber || record.invoiceNumber || "-")}</strong></td><td>${escapeHtml(record.productName || record.concept || "-")}</td><td>${Number(record.quantity || 1)}</td><td class="money-cell">${money.format(Number(record.unitCost || record.amount || 0))}</td><td class="money-cell"><strong>${money.format(Number(record.amount || 0))}</strong></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Todavía no hay costos de stock consumidos.</td></tr>`}
    </tbody></table></div>`;
}

function loadFixedExpenseNames() {
  try {
    return JSON.parse(localStorage.getItem(FIXED_EXPENSE_NAMES_KEY) || "[]")
      .map((item) => ({ id: String(item.id || ""), name: String(item.name || "").trim() }))
      .filter((item) => item.id && item.name);
  } catch { return []; }
}

function saveFixedExpenseNames(items) {
  localStorage.setItem(FIXED_EXPENSE_NAMES_KEY, JSON.stringify(items));
  localStorage.setItem(SAVE_META_KEY, new Date().toISOString());
  scheduleFinancialStatePersist(0);
}

function renderFixedExpenses(item, detailOverride = null) {
  const detail = detailOverride || document.getElementById("menuCategoryDetail");
  const names = loadFixedExpenseNames();
  const month = currentAccountingMonth();
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString("es-UY", { month: "long", year: "numeric" });
  detail.hidden = false;
  detail.innerHTML = `
    <div class="menu-category-detail-head">
      <div><p class="eyebrow">Gastos fijos · ${capitalizeText(monthLabel)}</p><h3>${escapeHtml(item.label)}</h3></div>
      <button class="row-action" type="button" data-close-menu-detail>Cerrar</button>
    </div>
    <form class="fixed-expense-add" id="fixedExpenseAddForm">
      <input name="name" placeholder="Nombre del gasto" required>
      <input name="amount" type="number" min="0" step="0.01" placeholder="Valor" required>
      <button type="submit">Añadir gasto fijo</button>
    </form>
    <div class="fixed-expense-list">
      ${names.length ? names.map((entry) => {
        const record = state.expenses.find((expense) => expense.fixedExpenseId === entry.id && expense.accountingMonth === month);
        const savedAt = record?.createdAt ? new Date(record.createdAt) : null;
        return `<form class="fixed-expense-row" data-fixed-expense="${entry.id}">
          <input name="name" value="${escapeHtml(entry.name)}" aria-label="Nombre del gasto fijo">
          <input name="amount" type="number" min="0" step="0.01" value="${record ? Number(record.amount || 0) : ""}" placeholder="0">
          <span>${savedAt ? `${savedAt.toLocaleDateString("es-UY")} · ${savedAt.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}` : "Pendiente este mes"}</span>
          <button type="submit">Guardar</button>
          <button class="row-action danger" type="button" data-delete-fixed-expense="${entry.id}">Borrar</button>
        </form>`;
      }).join("") : `<p class="empty">Todavía no hay nombres de gastos fijos guardados.</p>`}
    </div>`;
  detail.querySelector("[data-close-menu-detail]").addEventListener("click", () => { detailOverride ? closeReportCategoryDetail() : detail.hidden = true; });
  detail.querySelector("#fixedExpenseAddForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(data.name || "").trim();
    const amount = Number(data.amount);
    if (!name || !Number.isFinite(amount) || amount < 0) return;
    const existing = names.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    const entry = existing || { id: uid("fixed-expense-"), name };
    if (!existing) { names.push(entry); saveFixedExpenseNames(names); }
    saveFixedExpenseValue(entry, amount, item, detailOverride);
  });
  detail.querySelectorAll("[data-fixed-expense]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = names.find((candidate) => candidate.id === form.dataset.fixedExpense);
    if (entry) {
      entry.name = String(form.elements.name.value || "").trim() || entry.name;
      saveFixedExpenseNames(names);
      state.expenses.filter((expense) => expense.fixedExpenseId === entry.id).forEach((expense) => { expense.concept = entry.name; expense.productName = entry.name; });
      saveFixedExpenseValue(entry, Number(form.elements.amount.value || 0), item, detailOverride);
    }
  }));
  detail.querySelectorAll("[data-delete-fixed-expense]").forEach((button) => button.addEventListener("click", async () => {
    const entry = names.find((candidate) => candidate.id === button.dataset.deleteFixedExpense);
    if (!entry) return;
    const confirmed = await requestConfirmation({ eyebrow: "Eliminar gasto fijo", title: `¿Borrar ${entry.name}?`, description: "Se eliminarán sus valores mensuales guardados.", acceptLabel: "Borrar gasto" });
    if (!confirmed) return;
    saveFixedExpenseNames(names.filter((candidate) => candidate.id !== entry.id));
    state.expenses = state.expenses.filter((expense) => expense.fixedExpenseId !== entry.id);
    commit();
    renderFixedExpenses(item, detailOverride);
  }));
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function saveFixedExpenseValue(entry, amount, menuItem, detailOverride = null) {
  if (!Number.isFinite(amount) || amount < 0) return alert("Ingresa un valor válido.");
  const month = currentAccountingMonth();
  const timestamp = new Date().toISOString();
  let record = state.expenses.find((expense) => expense.fixedExpenseId === entry.id && expense.accountingMonth === month);
  if (record) {
    record.amount = amount;
    record.createdAt = timestamp;
    record.date = today();
  } else {
    record = { id: uid("e"), fixedExpenseId: entry.id, adminCategoryId: menuItem.id, accountingMonth: month, concept: entry.name, productName: entry.name, amount, supplier: "-", invoiceNumber: "-", createdAt: timestamp, date: today() };
    state.expenses.push(record);
  }
  commit();
  renderFixedExpenses(menuItem, detailOverride);
}

function showMenuItemSubcategories(itemId) {
  const item = menuItems.find((entry) => entry.id === itemId);
  const detail = document.getElementById("menuCategoryDetail");
  if (!item || !detail) return;
  const children = menuItems.filter((entry) => entry.parentId === item.id).sort((left, right) => left.order - right.order);
  if (!children.length) return showMenuItemDetail(itemId);
  const subnav = document.getElementById("menuCategorySubnav");
  renderMenuCategoryLinks();
  subnav.insertAdjacentHTML("beforeend", `
    <span class="menu-subnav-divider"></span>
    <span class="menu-subnav-parent">${escapeHtml(item.label)}:</span>
    ${children.map((child) => `<button type="button" data-detail-child="${child.id}">${escapeHtml(child.label)}</button>`).join("")}
  `);
  detail.hidden = true;
  subnav.querySelectorAll("[data-detail-child]").forEach((button) => button.addEventListener("click", () => {
    subnav.querySelectorAll("button").forEach((itemButton) => itemButton.classList.toggle("active", itemButton === button));
    showMenuItemDetail(button.dataset.detailChild);
  }));
}

function menuItemModuleViews(itemId, visited = new Set()) {
  if (visited.has(itemId)) return [];
  const item = menuItems.find((entry) => entry.id === itemId);
  if (!item) return [];
  if (item.view) return [item.view];
  const nextVisited = new Set([...visited, itemId]);
  return menuItems.filter((child) => child.parentId === itemId).flatMap((child) => menuItemModuleViews(child.id, nextVisited));
}

function showMenuItemTransactions(itemId) {
  const item = menuItems.find((entry) => entry.id === itemId);
  const detail = document.getElementById("menuCategoryDetail");
  if (!item || !detail) return;
  const normalizedLabel = item.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const moduleViews = menuItemModuleViews(itemId);
  if (!moduleViews.length && /(gasto|compra)/.test(normalizedLabel)) moduleViews.push("expenses");
  if (!moduleViews.length && /ingreso/.test(normalizedLabel)) moduleViews.push("sales", "orders");
  if (!moduleViews.length && /venta/.test(normalizedLabel)) moduleViews.push("sales");
  let records = [];
  if (moduleViews.includes("expenses")) records.push(...state.expenses.map((record) => ({
    timestamp: record.createdAt || `${record.date || today()}T00:00:00`,
    accountingDate: record.date || record.createdAt,
    detail: record.productName || record.concept || "Compra",
    value: -Number(record.amount || 0),
    supplier: record.supplier || "-"
  })));
  if (moduleViews.includes("sales")) records.push(...state.sales.map((record) => ({
    timestamp: record.createdAt || `${record.date || today()}T00:00:00`,
    accountingDate: record.date || record.createdAt,
    detail: findName(state.products, record.productId) || "Venta",
    value: Number(record.total || 0),
    supplier: "-"
  })));
  if (moduleViews.includes("orders")) records.push(...state.orders.filter((record) => !isSaleOrder(record) && orderCollectedAmount(record) > 0).map((record) => ({
    timestamp: record.paidAt || record.createdAt || record.savedAt || `${record.date || today()}T00:00:00`,
    accountingDate: record.paidAt || record.date || record.createdAt,
    detail: `${record.number || "Orden"} · ${record.clientName || "Cliente"}`,
    value: orderCollectedAmount(record),
    supplier: "-"
  })));
  records = records.filter((record) => recordMatchesAdminPeriod(record.accountingDate || record.timestamp));
  records.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  detail.hidden = false;
  detail.innerHTML = `
    <div class="menu-category-detail-head">
      <div><p class="eyebrow">Historial completo</p><h3>${escapeHtml(item.label)}</h3></div>
      <button class="row-action" type="button" data-close-menu-detail>Cerrar</button>
    </div>
    <div class="table-wrap menu-history-table"><table><thead><tr><th>Día</th><th>Fecha</th><th>Hora</th><th>Detalle</th><th>Costo</th><th>Proveedor</th></tr></thead>
      <tbody>${records.length ? records.map((record) => { const date = new Date(record.timestamp); return `<tr><td>${capitalizeText(date.toLocaleDateString("es-UY", { weekday: "long" }))}</td><td>${date.toLocaleDateString("es-UY")}</td><td>${date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}</td><td>${escapeHtml(record.detail)}</td><td class="money-cell">${money.format(record.value)}</td><td>${escapeHtml(record.supplier)}</td></tr>`; }).join("") : `<tr><td colspan="6" class="empty">No hay movimientos registrados.</td></tr>`}</tbody>
    </table></div>`;
  detail.querySelector("[data-close-menu-detail]").addEventListener("click", () => { detail.hidden = true; });
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openCategorySettings() {
  renderProductCategories();
  const panel = document.getElementById("categorySettingsPanel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  setTimeout(() => document.querySelector("#categoryForm [name='name']")?.focus(), 0);
}

function closeCategorySettings() {
  const panel = document.getElementById("categorySettingsPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

async function runReceiptAction(action) {
  if (action === "save" && isSavingReceipt) return;
  showView("newOrder");
  const frame = document.querySelector(".receipt-frame");
  const receiptWindow = frame?.contentWindow;
  const actionName = action === "print" ? "printReceipt" : "saveReceiptOnly";

  if (!receiptWindow) {
    alert("La boleta todavia se esta cargando. Proba de nuevo en un momento.");
    return;
  }

  let receipt = null;
  try {
    if (action === "save") {
      receipt = await collectReceiptFromFrame(frame);
    } else if (typeof receiptWindow[actionName] === "function") {
      receipt = await receiptWindow[actionName]();
    }

    if (!receipt && typeof receiptWindow[actionName] === "function") {
      receipt = await receiptWindow[actionName]();
    }
  } catch (error) {
    alert(error.message || "No pude leer la boleta. Proba de nuevo.");
    return;
  }

  if (receipt) {
    if (action === "save" && apiOnline) {
      isSavingReceipt = true;
      setReceiptSavingState(true);
      try {
        await apiRequest("/receipts", { method: "POST", body: receipt });
        await refreshStateFromApi();
      } catch (error) {
        alert(error.message || "No se pudo guardar la orden en el servidor.");
        return;
      } finally {
        isSavingReceipt = false;
        setReceiptSavingState(false);
      }
    } else {
      syncReceiptWithLocalState(receipt);
    }
  }
  if (!apiOnline) {
    state = loadState();
  }
  render();
  if (action === "save") {
    closeReceiptAndReturn();
  }
}

function closeReceiptAndReturn() {
  const targetView = returnAfterOrderView && returnAfterOrderView !== "newOrder"
    ? returnAfterOrderView
    : lastSidebarView || "dashboard";
  resetReceiptFrame();
  showView(targetView);
  lastSidebarView = targetView;
  returnAfterOrderView = targetView;
}

async function cancelNewOrderCreation() {
  const frame = document.querySelector(".receipt-frame");
  let hasDraft = false;
  try { hasDraft = Boolean(frame?.contentWindow?.hasReceiptDraft?.()); } catch {}
  if (hasDraft) {
    const confirmed = await requestConfirmation({
      eyebrow: "Cancelar creación",
      title: "¿Salir sin guardar esta orden?",
      description: "Los datos escritos en la boleta se descartarán. No se creará ninguna orden ni se modificará el stock.",
      summary: "Borrador sin guardar",
      acceptLabel: "Sí, descartar"
    });
    if (!confirmed) return;
  }
  closeReceiptAndReturn();
  showToast("Creación de orden cancelada", "success");
}

function setReceiptSavingState(isSaving) {
  const button = document.getElementById("saveOrderButton");
  if (!button) return;
  button.disabled = isSaving;
  button.textContent = isSaving ? "Guardando..." : "Guardar";
}

function resetReceiptFrame() {
  const frame = document.querySelector(".receipt-frame");
  if (!frame) return;
  const source = frame.getAttribute("src") || "boleta/index.html";
  const baseSource = source.split("?")[0];
  frame.src = `${baseSource}?v=${Date.now()}`;
}

async function prepareNewOrderFrame() {
  const frame = document.querySelector(".receipt-frame");
  if (!frame) return;
  const source = frame.getAttribute("src") || "boleta/index.html";
  const baseSource = source.split("?")[0];
  const localNextNumber = Number(nextOrderNumber().replace(/\D/g, "")) || 0;
  let nextNumber = Math.max(1000, localNextNumber);
  if (apiOnline) {
    try {
      const payload = await apiRequest("/receipts/next-number");
      const remoteNextNumber = Number(payload.nextNumber || 0);
      if (Number.isFinite(remoteNextNumber)) {
        nextNumber = Math.max(nextNumber, remoteNextNumber);
      }
    } catch (error) {
      console.warn("No se pudo obtener el numero siguiente.", error);
    }
  }
  const params = new URLSearchParams({
    v: String(Date.now())
  });
  params.set("nextNumber", String(nextNumber));
  frame.src = `${baseSource}?${params.toString()}`;
}

async function collectReceiptFromFrame(frame) {
  const directPayload = collectReceiptDirectly(frame);
  if (directPayload) return directPayload;
  return collectReceiptByMessage(frame);
}

function collectReceiptDirectly(frame) {
  try {
    const receiptWindow = frame?.contentWindow;
    if (receiptWindow && typeof receiptWindow.collectReceiptPayload === "function") {
      return normalizeReceiptPayload(receiptWindow.collectReceiptPayload());
    }
  } catch {
    return null;
  }

  let doc = null;
  try {
    doc = frame?.contentDocument || frame?.contentWindow?.document;
  } catch {
    return null;
  }
  const form = doc?.querySelector("#ticket-form");
  if (!form) return null;

  const field = (name) => String(form.elements[name]?.value || "").trim();
  const checkedText = (selector) => [...doc.querySelectorAll(selector)]
    .filter((item) => item.checked)
    .map((item) => item.value || item.dataset.label || item.closest("label")?.textContent?.trim())
    .filter(Boolean);

  return normalizeReceiptPayload({
    clientName: field("clientName"),
    clientId: field("clientId"),
    clientPhone: field("clientPhone"),
    entryDate: field("entryDate"),
    deviceBrand: field("deviceBrand"),
    deviceModel: field("deviceModel"),
    deviceColor: field("deviceColor"),
    services: checkedText("#service-checks input[type='checkbox']"),
    reportedIssue: field("reportedIssue"),
    visualItems: checkedText("#visual-checks input[type='checkbox']"),
    deliveryTime: field("deliveryTime"),
    deliveryUnit: field("deliveryUnit"),
    warrantyOffered: field("warrantyOffered"),
    price: field("price"),
    unlockCode: field("unlockCode"),
    unlockPassword: field("unlockPassword"),
    unlockPattern: field("unlockPattern"),
    terms: doc.querySelector("#terms-preview")?.textContent?.trim() || ""
  });
}

function collectReceiptByMessage(frame) {
  const receiptWindow = frame?.contentWindow;
  if (!receiptWindow) {
    return Promise.reject(new Error("La boleta todavia se esta cargando. Proba de nuevo en un momento."));
  }

  const requestId = `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("No pude leer la boleta. Proba de nuevo en un momento."));
    }, 2500);

    function handleMessage(event) {
      const data = event.data || {};
      if (data.type !== "SG_RECEIPT_PAYLOAD" || data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      if (data.error) {
        reject(new Error(data.error));
        return;
      }
      resolve(normalizeReceiptPayload(data.payload || {}));
    }

    window.addEventListener("message", handleMessage);
    receiptWindow.postMessage({ type: "SG_COLLECT_RECEIPT", requestId }, "*");
  });
}

function normalizeReceiptPayload(payload) {
  return {
    id: `local-${Date.now().toString(36)}`,
    number: Number(payload.number || nextOrderNumber().replace(/\D/g, "")),
    createdAt: new Date().toISOString(),
    ...payload
  };
}

function syncReceiptWithLocalState(receipt) {
  const clientDocument = String(receipt.clientId || "").trim() || "-";
  const clientName = String(receipt.clientName || "").trim() || "Cliente sin nombre";
  const clientPhone = String(receipt.clientPhone || "").trim() || "-";
  let client = state.clients.find((item) => {
    return clientDocument !== "-" && String(item.document || "").trim() === clientDocument;
  });

  if (!client) {
    client = state.clients.find((item) => {
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
      id: uid("c"),
      name: clientName,
      document: clientDocument,
      phone: clientPhone,
      email: "-"
    };
    state.clients.push(client);
  }

  const orderNumber = receiptOrderNumber(receipt);
  const order = {
    id: `boleta-${receipt.id || uid("o")}`,
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
    diagnosis: Array.isArray(receipt.visualItems) ? receipt.visualItems.join(", ") || "-" : "-",
    services: receipt.services || [],
    deliveryTime: [receipt.deliveryTime, receipt.deliveryUnit].filter(Boolean).join(" "),
    warrantyOffered: receipt.warrantyOffered || "-",
    unlockCode: receipt.unlockCode || "",
    unlockPassword: receipt.unlockPassword || "",
    unlockPattern: receipt.unlockPattern || "",
    terms: receipt.terms || "",
    status: "En diagnostico",
    repairStatus: "En diagnostico",
    paymentStatus: "Sin abonar",
    budget: parseMoney(receipt.price),
    paid: 0,
    date: new Date().toISOString().slice(0, 10)
  };

  const existingIndex = state.orders.findIndex((item) => {
    return item.receiptId === receipt.id || item.number === orderNumber;
  });
  if (existingIndex >= 0) {
    state.orders[existingIndex] = { ...state.orders[existingIndex], ...order };
  } else {
    state.orders.push(order);
  }

  saveState();
}

function receiptOrderNumber(receipt) {
  return `OT-${String(receipt.number || nextOrderNumber().replace(/\D/g, "") || 1).padStart(4, "0")}`;
}

function parseMoney(value) {
  return Number(String(value || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

function bindForms() {
  document.getElementById("clientForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const client = {
      id: uid("c"),
      name: data.name.trim(),
      document: data.document.trim() || "-",
      phone: data.phone.trim() || "-",
      email: data.email.trim() || "-"
    };
    if (apiOnline) {
      try {
        await apiRequest("/clients", { method: "POST", body: client });
        event.currentTarget.reset();
        await syncAfterRemoteChange();
        return;
      } catch (error) {
        alert(error.message || "No se pudo guardar el cliente en el servidor.");
        return;
      }
    }
    state.clients.push(client);
    event.currentTarget.reset();
    commit();
  });

  document.getElementById("categoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const name = data.name.trim();
    const exists = state.productCategories.some((category) => {
      return category.name.toLowerCase() === name.toLowerCase();
    });

    if (exists) {
      await showUxNotice({
        type: "warning",
        eyebrow: "Nombre no disponible",
        title: "Subcategoría duplicada",
        description: "Ya existe una subcategoría con ese nombre. Escribe uno diferente para continuar.",
        acceptLabel: "Corregir nombre"
      });
      event.currentTarget.elements.name?.focus();
      event.currentTarget.elements.name?.select();
      return;
    }

    const category = {
      id: uid("cat"),
      name
    };
    if (apiOnline) {
      try {
        await apiRequest("/categories", { method: "POST", body: category });
        event.currentTarget.reset();
        await syncAfterRemoteChange();
        renderSidebarProductCategories();
        renderProductCategories();
        renderProducts();
        selectNewStockCategory(category.id);
        return;
      } catch (error) {
        await showUxNotice({
          type: "warning",
          eyebrow: "No se pudo añadir",
          title: "Revisa la subcategoría",
          description: error.message || "No se pudo guardar la subcategoría en el servidor.",
          acceptLabel: "Volver al formulario"
        });
        event.currentTarget.elements.name?.focus();
        event.currentTarget.elements.name?.select();
        return;
      }
    }
    state.productCategories.push(category);
    event.currentTarget.reset();
    commit();
    selectNewStockCategory(category.id);
    renderSidebarProductCategories();
    renderProductCategories();
    renderProducts();
  });

  document.getElementById("menuItemForm")?.addEventListener("submit", createMenuGroup);

  document.getElementById("productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const brand = data.brand.trim();
    const model = data.model.trim();
    rememberPhoneModel(brand, model);
    const color = data.color.trim() || "-";
    const salePrice = Number(data.salePrice);
    const product = {
      id: uid("p"),
      categoryId: data.categoryId,
      brand,
      model,
      color,
      costPrice: Number(data.costPrice),
      salePrice,
      price: salePrice,
      name: buildProductName(brand, model, color),
      stock: Number(data.stock),
      minStock: Number(data.minStock || 0),
      supplierName: String(data.supplierName || "").trim(),
      createdBy: currentManagementUser?.name || "Sistema",
      createdById: currentManagementUser?.id || "",
      inventoryScope: WORKSHOP_PRODUCT_SCOPE
    };
    const existingProduct = state.products.find((item) => String(item.categoryId || "") === String(product.categoryId)
      && normalizedMenuLabel(item.brand) === normalizedMenuLabel(product.brand)
      && normalizedMenuLabel(item.model) === normalizedMenuLabel(product.model)
      && normalizedMenuLabel(item.color || "-") === normalizedMenuLabel(product.color));
    if (existingProduct) {
      const oldStock = Number(existingProduct.stock || 0);
      const oldCost = Number(existingProduct.costPrice || 0);
      const newStock = oldStock + Number(product.stock || 0);
      const averageCost = newStock > 0 ? ((oldStock * oldCost) + (Number(product.stock || 0) * Number(product.costPrice || 0))) / newStock : Number(product.costPrice || 0);
      const confirmed = await requestConfirmation({ eyebrow: "Producto existente", title: "Se sumará al stock actual", description: "No se creará un producto duplicado. La cantidad se acumulará y el costo interno se recalculará mediante promedio ponderado.", summary: `Stock ${oldStock} → ${newStock} · Costo ${money.format(oldCost)} → ${money.format(averageCost)}`, acceptLabel: "Sumar al stock" });
      if (!confirmed) return;
      if (apiOnline) {
        try {
          await apiRequest("/purchases", { method: "POST", body: { id: uid("purchase-"), productId: existingProduct.id, quantity: Number(product.stock || 0), unitCost: Number(product.costPrice || 0), categoryId: product.categoryId, brand: product.brand, model: product.model, color: product.color, salePrice: product.salePrice, productName: product.name, supplier: product.supplierName, createdBy: product.createdBy, createdById: product.createdById } });
          await syncAfterRemoteChange();
          clearProductForm(form);
          return;
        } catch (error) { alert(error.message || "No se pudo sumar el producto al stock."); return; }
      }
      existingProduct.stock = newStock;
      existingProduct.costPrice = averageCost;
      existingProduct.salePrice = product.salePrice;
      existingProduct.price = product.salePrice;
      clearProductForm(form);
      commit();
      return;
    }
    if (apiOnline) {
      try {
        await apiRequest("/products", { method: "POST", body: product });
        await syncAfterRemoteChange();
        clearProductForm(form);
        return;
      } catch (error) {
        alert(error.message || "No se pudo guardar el producto en el servidor.");
        return;
      }
    }
    state.products.push(product);
    commit();
    clearProductForm(form);
  });

  document.getElementById("addSaleItemButton").addEventListener("click", addCurrentProductToSale);
  document.getElementById("webStockTransferForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest("/stock-transfers/web-to-workshop", {
        method: "POST",
        body: { ...data, quantity: Number(data.quantity), workshopSalePrice: Number(data.workshopSalePrice), actorId: currentManagementUser?.id || "", actorName: currentManagementUser?.name || "Sistema" }
      });
      await syncAfterRemoteChange();
      form.reset();
      form.elements.quantity.value = "1";
      renderOptions();
      await showUxNotice({
        eyebrow: "Stock actualizado",
        title: "Transferencia realizada",
        description: "El producto se descontó de la web y ya está disponible en el stock del taller.",
        acceptLabel: "Entendido"
      });
    } catch (error) {
      alert(error.message || "No se pudo transferir el producto al taller.");
    }
  });
  document.getElementById("webStockTransferForm").elements.sourceProductId.addEventListener("change", (event) => {
    const product = state.products.find((item) => item.id === event.target.value);
    const form = event.target.form;
    if (product && !form.elements.workshopSalePrice.value) form.elements.workshopSalePrice.value = Number(product.salePrice || product.price || 0);
  });
  document.getElementById("saleCart").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-sale-item]");
    if (!button) return;
    saleCart = saleCart.filter((item) => `${item.productId}:${item.serviceId || ""}` !== button.dataset.removeSaleItem);
    renderSaleCart();
  });
  document.getElementById("saleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const confirmButton = document.getElementById("confirmSaleButton");
    if (!saleCart.length && !addCurrentProductToSale()) return;
    const data = Object.fromEntries(new FormData(form));
    const client = state.clients.find((item) => item.id === data.clientId) || { id: "client-default", name: "Default", document: "-", phone: "-" };
    const saleTotal = saleCart.reduce((sum, item) => sum + item.total, 0);
    const payments = data.paymentMethod === "Mixto" ? [
      { method: "Efectivo", amount: Number(data.cashAmount || 0) },
      { method: "Tarjeta", amount: Number(data.cardAmount || 0) },
      { method: "Transferencia", amount: Number(data.transferAmount || 0) }
    ].filter((payment) => payment.amount > 0) : [{ method: data.paymentMethod || "Efectivo", amount: saleTotal }];
    if (Math.abs(payments.reduce((sum, payment) => sum + payment.amount, 0) - saleTotal) > 0.01) {
      alert(`Las partes del pago combinado deben sumar ${money.format(saleTotal)}.`);
      return;
    }
    const sale = {
      id: uid("s"), number: nextSaleNumber(), clientId: client.id, paymentMethod: data.paymentMethod || "Efectivo", payments, createdBy: currentManagementUser?.name || "Sistema", createdById: currentManagementUser?.id || "",
      items: saleCart.map((item) => ({ ...item })), quantity: saleCart.reduce((sum, item) => sum + item.quantity, 0),
      total: saleTotal, costTotal: saleCart.reduce((sum, item) => sum + item.costTotal, 0),
      productId: saleCart[0].productId, productDescription: saleCart.map((item) => item.productDescription).join(" + "), createdAt: new Date().toISOString(), date: today()
    };
    try {
      if (confirmButton) { confirmButton.disabled = true; confirmButton.textContent = "REGISTRANDO VENTA..."; }
      if (apiOnline) {
        const payload = await apiRequest("/sales-batch", { method: "POST", body: { saleId: sale.id, items: sale.items, total: sale.total, paymentMethod: sale.paymentMethod, payments: sale.payments, paymentStatus: "Pagado", date: sale.date, clientId: client.document || client.id || "", clientName: client.name, clientPhone: client.phone || "", actorId: sale.createdById, actorName: sale.createdBy } });
        if (!payload.order || !Array.isArray(payload.products) || !payload.products.length) throw new Error("El servidor no confirmó la venta ni el descuento de stock.");
        (payload.products || []).forEach((updated) => { const product = state.products.find((item) => item.id === updated.id); if (product) Object.assign(product, updated); });
        if (payload.order) { sale.number = payload.order.number; sale.orderNumber = payload.order.number; sale.orderId = payload.order.id; sale.receiptId = payload.order.receiptId; }
      } else {
        sale.items.forEach((item) => { const product = state.products.find((entry) => entry.id === item.productId); if (product) product.stock -= item.quantity; });
        const firstProduct = state.products.find((item) => item.id === sale.productId);
        const order = buildLocalSaleOrder(sale, firstProduct, client);
        sale.number = order.number; sale.orderNumber = order.number; sale.orderId = order.id; state.orders.push(order);
      }
      state.sales.push(sale);
      sale.items.forEach((item) => { const product = state.products.find((entry) => entry.id === item.productId); if (product) recordSaleCostExpense(sale, product); });
      commit();
      if (apiOnline) await syncAfterRemoteChange();
      saleCart = [];
      clearSaleForm(form);
      renderSaleCart();
      alert(`Venta registrada correctamente.\nIngreso: ${money.format(sale.total)}\nCosto de producto: ${money.format(sale.costTotal)}\nEl stock fue actualizado.`);
    } catch (error) { alert(`La venta NO fue registrada.\n${error.message || "No se pudo registrar la venta completa."}`); }
    finally {
      if (confirmButton) { confirmButton.disabled = false; confirmButton.textContent = "CONFIRMAR VENTA Y DESCONTAR STOCK"; }
    }
  });

  document.getElementById("expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const quantity = Number(data.quantity);
    const unitCost = Number(data.unitCost);
    const salePrice = Number(data.salePrice);
    const brand = String(data.brand || "").trim();
    const model = String(data.model || "").trim();
    const color = String(data.color || "").trim() || "-";
    let product = state.products.find((item) => item.id === data.productId);
    if (!product) {
      product = state.products.find((item) => String(item.categoryId || "") === String(data.categoryId || "")
        && normalizedMenuLabel(item.brand) === normalizedMenuLabel(brand)
        && normalizedMenuLabel(item.model) === normalizedMenuLabel(model)
        && normalizedMenuLabel(item.color || "-") === normalizedMenuLabel(color));
    }
    if (!data.categoryId || !brand || !model || !Number.isInteger(quantity) || quantity <= 0 || unitCost < 0 || salePrice < 0) {
      alert("Completa categoría, marca, modelo, cantidad, costo y precio de venta.");
      return;
    }
    rememberPhoneModel(brand, model);
    const isNewProduct = !product;
    const previousStock = Number(product?.stock || 0);
    const previousCost = Number(product?.costPrice || 0);
    if (isNewProduct) {
      product = {
        id: uid("p"),
        categoryId: data.categoryId,
        brand,
        model,
        color,
        name: buildProductName(brand, model, color),
        costPrice: unitCost,
        salePrice,
        price: salePrice,
        stock: quantity,
        inventoryScope: WORKSHOP_PRODUCT_SCOPE
      };
    }
    const purchase = {
      id: uid("e"),
      productId: product.id,
      productName: product.name,
      concept: product.name,
      quantity,
      unitCost,
      categoryId: data.categoryId,
      brand,
      model,
      color,
      salePrice,
      productName: buildProductName(brand, model, color),
      supplier: String(data.supplier || "").trim() || "-",
      invoiceNumber: String(data.invoiceNumber || "").trim() || "-",
      amount: quantity * unitCost,
      paymentMethod: data.paymentMethod || "Efectivo",
      account: accountingAccountForMethod(data.paymentMethod),
      paymentStatus: data.paymentStatus || "Pagado",
      createdAt: new Date().toISOString(),
      date: data.date
      ,createdBy: currentManagementUser?.name || "Sistema", createdById: currentManagementUser?.id || ""
    };
    if (apiOnline) {
      try {
        if (isNewProduct) {
          const payload = await apiRequest("/products", { method: "POST", body: { ...product, createdBy: currentManagementUser?.name || "Sistema", createdById: currentManagementUser?.id || "" } });
          product = payload.product || product;
          state.products.push(product);
        } else {
          const payload = await apiRequest("/purchases", { method: "POST", body: purchase });
          if (payload.product) Object.assign(product, payload.product);
        }
      } catch (error) {
        alert(error.message || "No se pudo sumar la compra al stock.");
        return;
      }
    } else {
      if (isNewProduct) state.products.push(product);
      else {
        const totalStock = previousStock + quantity;
        product.stock = totalStock;
        product.costPrice = totalStock > 0
          ? ((previousStock * previousCost) + (quantity * unitCost)) / totalStock
          : unitCost;
      }
    }
    if (isNewProduct) product.costPrice = unitCost;
    product.categoryId = data.categoryId;
    product.brand = brand;
    product.model = model;
    product.color = color;
    product.name = buildProductName(brand, model, color);
    product.salePrice = salePrice;
    product.price = salePrice;
    state.expenses.push(purchase);
    const courierCost = Number(data.courierCost || 0);
    if (courierCost > 0) {
      const courierCategory = ensureAdministrativeExpenseCategory("Cadete", /cadete|envio/);
      state.expenses.push({
        id: uid("e"),
        purchaseId: purchase.id,
        adminCategoryId: courierCategory?.id || "",
        concept: `Cadete / envío de ${product.name}`,
        productName: `Cadete / envío de ${product.name}`,
        amount: courierCost,
        paymentMethod: data.paymentMethod || "Efectivo",
        account: accountingAccountForMethod(data.paymentMethod),
        paymentStatus: data.paymentStatus || "Pagado",
        supplier: purchase.supplier,
        invoiceNumber: purchase.invoiceNumber,
        createdAt: new Date().toISOString(),
        date: data.date
      });
    }
    if (data.paymentStatus === "Pendiente") accountingState.payables.push({ id: uid("payable-"), purchaseId: purchase.id, supplier: purchase.supplier, concept: `Compra de ${purchase.productName}`, amount: purchase.amount + courierCost, balance: purchase.amount + courierCost, dueDate: "", status: "pending", createdAt: new Date().toISOString() });
    rememberPurchaseSupplier(purchase.supplier);
    event.currentTarget.reset();
    event.currentTarget.elements.date.value = today();
    commit();
  });

  document.getElementById("serviceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const existing = state.services.find((item) => item.id === data.id);
    const selection = resolveServiceProductSelection(data.category, data.brand, data.model);
    const manualCostPrice = String(data.manualCostPrice || "").trim();
    if (!selection?.selectedProduct && manualCostPrice === "") {
      alert("Esta categoria no tiene un producto asociado. Escribe el precio costo manual.");
      return;
    }
    const service = {
      id: data.id || uid("service-"),
      category: String(data.category || "").trim(),
      name: [data.category, data.brand, data.model].map((value) => String(value || "").trim()).filter(Boolean).join(" "),
      costPrice: selection?.selectedProduct ? selectedServiceCost(selection) : Number(manualCostPrice || 0),
      salePrice: Number(data.salePrice || 0),
      productKey: selection?.selectedProduct ? serviceProductKey(selection.selectedProduct) : "",
      productName: selection?.selectedProduct?.name || [data.brand, data.model].filter(Boolean).join(" "),
      brand: String(data.brand || "").trim(),
      model: String(data.model || "").trim(),
      active: existing?.active !== false
    };
    rememberPhoneModel(service.brand, service.model);

    if (apiOnline) {
      try {
        await apiRequest(existing ? `/services/${encodeURIComponent(service.id)}` : "/services", {
          method: existing ? "PUT" : "POST",
          body: service
        });
        resetServiceForm();
        await syncAfterRemoteChange();
        return;
      } catch (error) {
        alert(error.message || "No se pudo guardar el servicio en el servidor.");
        return;
      }
    }

    if (existing) {
      Object.assign(existing, service);
    } else {
      state.services.push(service);
    }
    resetServiceForm();
    commit();
  });

  const serviceForm = document.getElementById("serviceForm");
  serviceForm.elements.brand.addEventListener("change", () => {
    serviceForm.elements.model.value = "";
    renderServiceModelOptions();
    updateServiceCostPreview();
  });
  serviceForm.elements.model.addEventListener("change", updateServiceCostPreview);
  serviceForm.elements.model.addEventListener("input", updateServiceCostPreview);
  serviceForm.elements.category.addEventListener("change", updateServiceCostPreview);
  document.getElementById("addServiceCategory").addEventListener("click", addServiceCategory);
  document.getElementById("removeServiceCategory").addEventListener("click", removeServiceCategory);

  document.getElementById("expenseForm").elements.date.value = today();
  document.getElementById("expenseForm").elements.productId.addEventListener("change", (event) => {
    const product = state.products.find((item) => item.id === event.currentTarget.value);
    const form = document.getElementById("expenseForm");
    if (product) {
      form.elements.categoryId.value = product.categoryId || "";
      form.elements.brand.value = product.brand || "";
      form.elements.model.value = product.model || "";
      form.elements.color.value = product.color || "";
      form.elements.unitCost.value = Number(product.costPrice || 0);
      form.elements.salePrice.value = Number(product.salePrice || product.price || 0);
    } else {
      form.elements.categoryId.value = "";
      form.elements.brand.value = "";
      form.elements.model.value = "";
      form.elements.color.value = "";
      form.elements.unitCost.value = "";
      form.elements.salePrice.value = "";
    }
  });
}

function selectNewStockCategory(categoryId) {
  renderOptions();
  ["productForm", "expenseForm", "webStockTransferForm"].forEach((formId) => {
    const select = document.getElementById(formId)?.elements?.categoryId;
    if (select && [...select.options].some((option) => option.value === String(categoryId))) {
      select.value = String(categoryId);
    }
  });
}

function bindOrderDetail() {
  const panel = document.getElementById("orderDetailPanel");
  const form = document.getElementById("techOrderForm");
  document.getElementById("closeOrderDetail").addEventListener("click", closeOrderDetail);
  document.getElementById("cancelOrderDetail").addEventListener("click", closeOrderDetail);
  document.getElementById("addServiceItemButton").addEventListener("click", () => {
    addServiceItemRow({ description: "", price: 0, cost: 0, approvalStatus: "Pendiente", source: "added" });
    updateServiceItemsTotal();
  });
  document.getElementById("serviceItemsList").addEventListener("click", async (event) => {
    const suggestion = event.target.closest("[data-technical-catalog-item]");
    if (suggestion) {
      const row = suggestion.closest(".service-item-row");
      const descriptionInput = row?.querySelector("[name='serviceDescription']");
      const priceInput = row?.querySelector("[name='servicePrice']");
      const costInput = row?.querySelector("[name='serviceCost']");
      if (descriptionInput) descriptionInput.value = suggestion.dataset.technicalCatalogItem || "";
      if (priceInput) priceInput.value = Number(suggestion.dataset.technicalCatalogPrice || 0) || "";
      if (costInput) costInput.value = Number(suggestion.dataset.technicalCatalogCost || 0) || "";
      if (row) {
        row.dataset.productId = suggestion.dataset.technicalProductId || "";
        row.dataset.itemType = suggestion.dataset.technicalItemType || "service";
        row.dataset.consumesStock = suggestion.dataset.technicalConsumesStock || "false";
      }
      const suggestions = row?.querySelector(".technical-service-suggestions");
      if (suggestions) suggestions.hidden = true;
      row?.classList.remove("search-open");
      updateServiceItemsTotal();
      return;
    }
    const button = event.target.closest("[data-remove-service-item]");
    if (!button) return;
    const row = button.closest(".service-item-row");
    const mustRestoreStock = row?.dataset.stockDeducted === "true";
    if (mustRestoreStock) {
      const description = row.querySelector("[name='serviceDescription']")?.value.trim() || "este servicio";
      const linkedProduct = state.products.find((item) => String(item.id) === String(row.dataset.productId || ""));
      const currentStock = Number(linkedProduct?.stock || 0);
      const confirmed = await requestConfirmation({
        eyebrow: "Quitar servicio aprobado",
        title: "El producto volverá al stock",
        description: "Este servicio ya descontó su producto asociado. Se quitará y el repuesto volverá inmediatamente al inventario.",
        summary: linkedProduct ? `${description} · Stock ${currentStock} → ${currentStock + 1}` : description,
        acceptLabel: "Quitar y devolver al stock"
      });
      if (!confirmed) return;
    }
    row?.remove();
    updateServiceItemsTotal();
    if (mustRestoreStock) form.requestSubmit();
  });
  document.getElementById("serviceItemsList").addEventListener("input", (event) => {
    renderTechnicalServiceSuggestions(event.target);
    autofillTechnicalServicePrice(event.target);
    updateServiceItemsTotal();
  });
  document.getElementById("serviceItemsList").addEventListener("change", (event) => {
    autofillTechnicalServicePrice(event.target);
    updateServiceItemsTotal();
  });
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      closeOrderDetail();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("open")) {
      closeOrderDetail();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const order = state.orders.find((item) => item.id === data.orderId);
    if (!order) return;
    if (data.repairStatus === "Entregado" && normalizePaymentStatus(order.paymentStatus) !== "Pagado" && Number(order.budget || 0) > Number(order.paid || 0)) {
      const confirmedDelivery = await requestConfirmation({ eyebrow: "Saldo pendiente", title: "La orden todavía no está pagada", description: `Queda un saldo de ${money.format(Math.max(Number(order.budget || 0) - Number(order.paid || 0), 0))}. Solo continuá si la entrega está autorizada.`, summary: order.number, acceptLabel: "Entregar igualmente" });
      if (!confirmedDelivery) return;
    }
    const serviceItems = collectServiceItems();
    const duplicatedItems = findDuplicateServiceItemDescriptions(serviceItems);
    if (duplicatedItems.length) {
      const confirmed = await requestConfirmation({
        eyebrow: "Servicio duplicado",
        title: duplicatedItems.length === 1 ? "Este servicio ya está agregado" : "Hay servicios repetidos",
        description: "La orden ya contiene este ítem. Volvé para corregirlo o confirmá si realmente necesitás agregar otra unidad.",
        summary: duplicatedItems.join(" · "),
        acceptLabel: "Agregar igualmente"
      });
      if (!confirmed) return;
    }
    const quoteTotal = technicalBaseBudget(order) + serviceItemsTotal(serviceItems);
    const repairStatus = deriveRepairStatusFromServiceItems(serviceItems, data.repairStatus);
    const previousServiceItems = normalizeServiceItems(order);
    applyTechnicalBudgetToOrder(order, {
      repairStatus,
      technicianNotes: data.technicianNotes.trim(),
      serviceItems,
      quoteTotal
    });
    if (apiOnline && order.receiptId) {
      try {
        await apiRequest(`/receipts/${encodeURIComponent(order.receiptId)}/status`, {
          method: "PATCH",
          body: {
            status: repairStatus,
            technicianNotes: data.technicianNotes.trim(),
            quoteTotal,
            serviceItems,
            finishedAt: order.finishedAt || ""
          }
        });
        await syncAfterRemoteChange();
        const refreshedOrder = state.orders.find((item) => item.receiptId === order.receiptId) || order;
        syncOrderStockCostExpenses(refreshedOrder, serviceItems);
        commit();
        closeOrderDetail();
        return;
      } catch (error) {
        await showUxNotice({
          type: "warning",
          eyebrow: "No se guardaron los cambios",
          title: "Revisá la orden e intentá nuevamente",
          description: error.message || "No pudimos actualizar la orden en este momento.",
          acceptLabel: "Volver a la orden"
        });
        return;
      }
    }
    restoreRemovedServiceItemStockLocally(previousServiceItems, serviceItems);
    commitApprovedServiceItemStockLocally(serviceItems);
    syncOrderStockCostExpenses(order, serviceItems);
    commit();
    renderOrderReceiptPanel(order);
    closeOrderDetail();
  });
}

function applyTechnicalBudgetToOrder(order, data) {
  applyFinishedTimestamp(order, data.repairStatus);
  order.repairStatus = data.repairStatus;
  order.status = data.repairStatus;
  order.technicianNotes = data.technicianNotes;
  order.serviceItems = data.serviceItems;
  order.budget = data.quoteTotal;
}

function bindOrderStatusFilters() {
  document.getElementById("ordersStatusBar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-filter]");
    if (!button) return;
    orderStatusFilter = button.dataset.orderFilter;
    renderOrders();
  });
}

function openOrderDetail(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const panel = document.getElementById("orderDetailPanel");
  const form = document.getElementById("techOrderForm");
  document.getElementById("orderDetailTitle").textContent = `Detalle de ${order.number}`;
  form.elements.orderId.value = order.id;
  form.elements.repairStatus.value = order.repairStatus || order.status || "En diagnostico";
  form.elements.technicianNotes.value = order.technicianNotes || "";
  renderOrderOperationalHeader(order);
  renderServiceItemsEditor(order);
  renderOrderReceiptPanel(order);
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.technicianNotes.focus(), 0);
}

function closeOrderDetail() {
  const panel = document.getElementById("orderDetailPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

function renderOrderReceiptPanel(order) {
  const clientName = order.clientName || findName(state.clients, order.clientId);
  const clientDocument = order.clientDocument || findDocument(state.clients, order.clientId);
  const services = Array.isArray(order.services) ? order.services.join(", ") : order.services || "-";
  const serviceItems = normalizeServiceItems(order);
  const baseBudget = technicalBaseBudget(order);
  const totalBudget = baseBudget + serviceItemsTotal(serviceItems);
  document.getElementById("orderReceiptPanel").innerHTML = `
    ${orderQuickActionsMarkup(order)}
    <section class="order-detail-summary">
      <div>
        <span>Estado tecnico</span>
        ${statusBadge(order.repairStatus || order.status || "-")}
      </div>
      <div>
        <span>Estado del pago</span>
        <strong>${escapeHtml(normalizePaymentStatus(order.paymentStatus))}</strong>
      </div>
      <div>
        <span>Total presupuestado</span>
        <strong>${money.format(totalBudget)}</strong>
      </div>
    </section>
    <header class="order-receipt-header">
      <div class="order-receipt-logo">BEIM</div>
      <div class="order-receipt-company">
        <h3>BEIM</h3>
        <p>Servicio tecnico y tecnologia<br>Carlos Roxlo 1474 entre Colonia y Mercedes<br>Montevideo, Uruguay</p>
      </div>
      <div class="order-receipt-number">
        <span>Orden de trabajo</span>
        <strong>${escapeHtml(order.number)}</strong>
      </div>
    </header>
    <div class="order-receipt-grid">
      ${orderReceiptBox("Cliente", clientName)}
      ${orderReceiptBox("Cedula", clientDocument)}
      ${orderReceiptBox("Telefono", order.clientPhone || "-")}
      ${orderReceiptBox("Estado", order.repairStatus || order.status || "-")}
      ${orderReceiptBox("Equipo", order.device || "-")}
      ${orderReceiptBox("Marca / modelo", [order.brand, order.model].filter(Boolean).join(" ") || "-")}
      ${orderReceiptBox("Servicio", services, true)}
      ${orderReceiptBox("Falla reportada", order.problem || "-", true)}
      ${orderReceiptBox("Observaciones del tecnico", order.technicianNotes || "-", true)}
    </div>
    ${orderActivityTimelineMarkup(order)}
    ${orderBudgetBreakdown(serviceItems, baseBudget)}
  `;
  document.querySelector("[data-copy-order]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const orderNumber = button.dataset.copyOrder || "";
    const copied = await copyTextToClipboard(orderNumber);
    if (copied) {
      button.textContent = "Número copiado ✓";
      button.classList.add("copied");
      showToast(`Orden ${orderNumber} copiada`, "success");
      window.setTimeout(() => {
        button.textContent = "Copiar número de orden";
        button.classList.remove("copied");
      }, 2200);
      return;
    }
    showToast("No se pudo copiar. Podés seleccionar el número en el comprobante.", "warning");
  });
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.appendChild(helper);
  helper.select();
  helper.setSelectionRange(0, helper.value.length);
  let copied = false;
  try { copied = document.execCommand("copy"); } catch {}
  helper.remove();
  return copied;
}

function showToast(message, type = "success") {
  let toast = document.querySelector("#appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  window.clearTimeout(showToast.timer);
  toast.dataset.type = type;
  toast.textContent = message;
  toast.classList.add("visible");
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function renderServiceItemsEditor(order) {
  const list = document.getElementById("serviceItemsList");
  renderTechnicalServiceOptions();
  list.innerHTML = "";
  normalizeServiceItems(order).forEach((item) => addServiceItemRow(item));
  addServiceItemRow({ description: "", price: 0, cost: 0, approvalStatus: "Pendiente", source: "added" });
  updateServiceItemsTotal();
}

function renderTechnicalServiceOptions() {
  const list = document.getElementById("technicalServiceOptions");
  if (!list) return;
  const services = state.services
    .filter((service) => service.active !== false)
    .map((service) => ({ name: service.name, price: Number(service.salePrice || 0), type: "Servicio" }));
  const products = state.products
    .filter((product) => product.active !== false)
    .map((product) => ({ name: product.name || saleProductDescription(product), price: Number(product.salePrice || product.price || 0), type: "Producto" }));
  list.innerHTML = [...services, ...products]
    .filter((item, index, items) => item.name && items.findIndex((candidate) => normalizedMenuLabel(candidate.name) === normalizedMenuLabel(item.name)) === index)
    .map((item) => `<option value="${escapeHtml(item.name)}">${item.type} - ${money.format(item.price)}</option>`)
    .join("");
}

function technicalCatalogItems() {
  const services = state.services
    .filter((service) => service.active !== false)
    .map((service) => {
      const linkedProduct = resolveStoredServiceProduct(service)?.selectedProduct;
      return { name: service.name, price: Number(service.salePrice || 0), cost: Number(linkedProduct?.costPrice ?? service.costPrice ?? 0), type: "Servicio", itemType: "service", productId: linkedProduct?.id || "", consumesStock: Boolean(linkedProduct) };
    });
  const products = state.products
    .filter((product) => product.active !== false)
    .map((product) => ({ name: product.name || saleProductDescription(product), price: Number(product.salePrice || product.price || 0), cost: Number(product.costPrice || 0), type: "Producto", itemType: "product", productId: product.id, consumesStock: true }));
  return [...services, ...products]
    .filter((item, index, items) => item.name && items.findIndex((candidate) => normalizedMenuLabel(candidate.name) === normalizedMenuLabel(item.name)) === index);
}

function renderTechnicalServiceSuggestions(target) {
  if (!target?.matches("[name='serviceDescription']")) return;
  const row = target.closest(".service-item-row");
  const suggestions = row?.querySelector(".technical-service-suggestions");
  if (!suggestions) return;
  const searched = normalizedMenuLabel(target.value);
  const matches = searched
    ? technicalCatalogItems().filter((item) => normalizedMenuLabel(item.name).includes(searched)).slice(0, 6)
    : [];
  suggestions.innerHTML = matches.map((item) => `
    <button type="button" data-technical-catalog-item="${escapeHtml(item.name)}" data-technical-catalog-price="${item.price}" data-technical-catalog-cost="${item.cost}" data-technical-item-type="${item.itemType}" data-technical-product-id="${escapeHtml(item.productId)}" data-technical-consumes-stock="${item.consumesStock ? "true" : "false"}">
      <strong>${escapeHtml(item.name)}</strong><span>${item.type} · ${money.format(item.price)}</span>
    </button>
  `).join("");
  suggestions.hidden = matches.length === 0;
  row.classList.toggle("search-open", matches.length > 0);
}

function autofillTechnicalServicePrice(target) {
  if (!target?.matches("[name='serviceDescription']")) return;
  const row = target.closest(".service-item-row");
  if (row) {
    row.dataset.productId = "";
    row.dataset.itemType = "service";
    row.dataset.consumesStock = "false";
  }
  const catalogItem = state.services.find((item) => item.active !== false
    && normalizedMenuLabel(item.name) === normalizedMenuLabel(target.value));
  const product = state.products.find((item) => item.active !== false
    && normalizedMenuLabel(item.name || saleProductDescription(item)) === normalizedMenuLabel(target.value));
  if (!catalogItem && !product) return;
  const priceInput = row?.querySelector("[name='servicePrice']");
  const costInput = row?.querySelector("[name='serviceCost']");
  if (priceInput) priceInput.value = Number(catalogItem?.salePrice || product?.salePrice || product?.price || 0) || "";
  const linkedServiceProduct = catalogItem ? resolveStoredServiceProduct(catalogItem)?.selectedProduct : null;
  if (costInput) costInput.value = Number(linkedServiceProduct?.costPrice ?? product?.costPrice ?? catalogItem?.costPrice ?? 0) || "";
  if (row && product) {
    row.dataset.productId = product.id;
    row.dataset.itemType = "product";
    row.dataset.consumesStock = "true";
  } else if (row && catalogItem) {
    const linkedProduct = linkedServiceProduct;
    row.dataset.productId = linkedProduct?.id || "";
    row.dataset.consumesStock = linkedProduct ? "true" : "false";
  }
}

function addServiceItemRow(item) {
  const row = document.createElement("div");
  row.className = "service-item-row";
  row.dataset.serviceSource = item.source || "added";
  row.dataset.productId = item.productId || "";
  row.dataset.itemType = item.itemType || (item.productId ? "product" : "service");
  row.dataset.consumesStock = item.consumesStock ? "true" : "false";
  row.dataset.stockDeducted = item.stockDeducted ? "true" : "false";
  row.dataset.stockDeductedAt = item.stockDeductedAt || "";
  const status = normalizeServiceItemApprovalStatus(item.approvalStatus);
  row.innerHTML = `
    <input name="serviceDescription" autocomplete="off" placeholder="Escribir o buscar servicio o producto" value="${escapeHtml(item.description || "")}">
    <input name="servicePrice" type="number" min="0" step="0.01" placeholder="Precio" value="${Number(item.price || 0) || ""}">
    <input name="serviceCost" type="number" min="0" step="0.01" placeholder="Costo" value="${Number(item.cost || 0) || ""}">
    <select name="serviceApprovalStatus" aria-label="Estado de aprobacion">
      ${["Pendiente", "Aprobado", "No aprobado"].map((option) => `
        <option${option === status ? " selected" : ""}>${option}</option>
      `).join("")}
    </select>
    <button class="row-action" type="button" data-remove-service-item aria-label="Quitar item">Quitar</button>
    <div class="technical-service-suggestions" hidden></div>
  `;
  document.getElementById("serviceItemsList").appendChild(row);
}

function collectServiceItems() {
  return [...document.querySelectorAll("#serviceItemsList .service-item-row")]
    .map((row) => ({
      description: row.querySelector("[name='serviceDescription']").value.trim(),
      price: Number(row.querySelector("[name='servicePrice']").value || 0),
      cost: Number(row.querySelector("[name='serviceCost']").value || 0),
      approvalStatus: normalizeServiceItemApprovalStatus(row.querySelector("[name='serviceApprovalStatus']").value),
      source: row.dataset.serviceSource || "added",
      productId: row.dataset.productId || "",
      itemType: row.dataset.itemType || "service",
      consumesStock: row.dataset.consumesStock === "true",
      stockDeducted: row.dataset.stockDeducted === "true",
      stockDeductedAt: row.dataset.stockDeductedAt || "",
      quantity: 1
    }))
    .filter((item) => item.description || item.price > 0)
    .map((item) => ({
      description: item.description || "Servicio tecnico",
      price: Number.isFinite(item.price) && item.price > 0 ? item.price : 0,
      cost: Number.isFinite(item.cost) && item.cost > 0 ? item.cost : 0,
      approvalStatus: item.approvalStatus,
      source: item.source || "added",
      productId: item.productId || "",
      itemType: item.itemType || "service",
      consumesStock: Boolean(item.consumesStock),
      stockDeducted: Boolean(item.stockDeducted),
      stockDeductedAt: item.stockDeductedAt || "",
      quantity: Number(item.quantity || 1)
    }));
}

function updateServiceItemsTotal() {
  const pendingItems = collectServiceItems();
  const form = document.getElementById("techOrderForm");
  const order = state.orders.find((item) => item.id === form?.elements?.orderId?.value);
  const items = pendingItems;
  const baseBudget = order ? technicalBaseBudget(order) : 0;
  document.getElementById("serviceItemsTotal").textContent = money.format(baseBudget + serviceItemsTotal(items));
  const costTotal = Number(order?.cost || 0) + items.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  document.getElementById("serviceItemsCostTotal").textContent = money.format(costTotal);
  if (form?.elements?.repairStatus && items.length) {
    form.elements.repairStatus.value = deriveRepairStatusFromServiceItems(items, form.elements.repairStatus.value);
  }
}

function normalizeServiceItems(order) {
  const rawItems = Array.isArray(order.serviceItems) ? order.serviceItems : [];
  return rawItems
    .filter((item) => item.source !== "initial")
    .map((item) => ({
      description: String(item.description || item.name || item.service || "").trim(),
      price: Number(item.price || item.amount || item.total || 0),
      cost: Number(item.cost || item.costPrice || 0),
      approvalStatus: normalizeServiceItemApprovalStatus(item.approvalStatus || item.status),
      source: item.source || "added",
      productId: String(item.productId || ""),
      itemType: item.itemType === "product" || item.productId ? "product" : "service",
      consumesStock: Boolean(item.consumesStock || item.itemType === "product"),
      quantity: Math.max(1, Number(item.quantity || 1)),
      stockDeducted: Boolean(item.stockDeducted),
      stockDeductedAt: String(item.stockDeductedAt || "")
    }))
    .filter((item) => item.description || item.price > 0);
}

function restoreRemovedServiceItemStockLocally(previousItems, nextItems) {
  const available = nextItems.map((item) => ({ item, used: false }));
  previousItems.forEach((previous) => {
    if (!previous.stockDeducted || !previous.productId) return;
    const match = available.find((candidate) => !candidate.used
      && String(candidate.item.productId || "") === String(previous.productId || "")
      && normalizedMenuLabel(candidate.item.description) === normalizedMenuLabel(previous.description)
      && Number(candidate.item.quantity || 1) === Number(previous.quantity || 1));
    if (match && match.item.approvalStatus !== "No aprobado") {
      match.used = true;
      return;
    }
    const product = state.products.find((item) => String(item.id) === String(previous.productId));
    if (product) product.stock = Number(product.stock || 0) + Math.max(1, Number(previous.quantity || 1));
    if (match) {
      match.used = true;
      match.item.stockDeducted = false;
      match.item.stockDeductedAt = "";
    }
  });
}

function commitApprovedServiceItemStockLocally(items) {
  items.forEach((item) => {
    if (item.stockDeducted || item.approvalStatus !== "Aprobado") return;
    const product = state.products.find((candidate) => String(candidate.id) === String(item.productId || ""));
    if (!product) return;
    const quantity = Math.max(1, Number(item.quantity || 1));
    if (Number(product.stock || 0) < quantity) throw new Error(`No hay stock suficiente para ${product.name || item.description}.`);
    product.stock = Number(product.stock || 0) - quantity;
    item.stockDeducted = true;
    item.stockDeductedAt = new Date().toISOString();
  });
}

function findDuplicateServiceItemDescriptions(items) {
  const seen = new Set();
  const duplicated = new Map();
  items.forEach((item) => {
    const description = String(item.description || "").trim();
    const key = normalizedMenuLabel(description);
    if (!key) return;
    if (seen.has(key)) duplicated.set(key, description);
    else seen.add(key);
  });
  return [...duplicated.values()];
}

function technicalBaseBudget(order) {
  const budget = Number(order.budget || 0);
  const addedTotal = serviceItemsTotal(normalizeServiceItems(order));
  return Math.max(budget - addedTotal, 0);
}

function normalizeServiceItemApprovalStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "aprobado" || value === "aprobada") return "Aprobado";
  if (value === "no aprobado" || value === "rechazado" || value === "rechazada") return "No aprobado";
  return "Pendiente";
}

function serviceItemsTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function deriveRepairStatusFromServiceItems(items, currentStatus) {
  if (!items.length) return "Presupuestado";
  const statuses = items.map((item) => normalizeServiceItemApprovalStatus(item.approvalStatus));
  if (statuses.some((status) => status === "Pendiente")) return "Esperando aprobacion";
  if (statuses.some((status) => status === "Aprobado")) return "Aprobado";
  return "Presupuestado";
}

function orderBudgetBreakdown(items, baseBudget = 0) {
  if (!items.length && !baseBudget) {
    return "";
  }
  const baseRow = baseBudget > 0 ? `
    <tr>
      <td>Presupuesto de boleta</td>
      <td><span class="approval-status pending">Base</span></td>
      <td>${money.format(baseBudget)}</td>
    </tr>
  ` : "";
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.description || "Servicio tecnico")}</td>
      <td><span class="approval-status ${approvalStatusClass(item.approvalStatus)}">${escapeHtml(normalizeServiceItemApprovalStatus(item.approvalStatus))}</span></td>
      <td>${money.format(item.price || 0)}</td>
    </tr>
  `).join("");
  return `
    <section class="order-budget-breakdown">
      <h4>Presupuesto desglosado</h4>
      <table>
        <tbody>${baseRow}${rows}</tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th>${money.format(baseBudget + serviceItemsTotal(items))}</th>
          </tr>
        </tfoot>
      </table>
    </section>
  `;
}

function approvalStatusClass(status) {
  const normalized = normalizeServiceItemApprovalStatus(status);
  if (normalized === "Aprobado") return "approved";
  if (normalized === "No aprobado") return "rejected";
  return "pending";
}

function finalReceiptLineItems(order) {
  const items = normalizeServiceItems(order);
  const baseBudget = technicalBaseBudget(order);
  const baseDescription = finalReceiptBaseDescription(order);
  return [
    ...(baseBudget > 0 ? [{
      description: baseDescription,
      status: "Base",
      price: baseBudget
    }] : []),
    ...items.map((item) => ({
      description: item.description || "Servicio agregado",
      status: normalizeServiceItemApprovalStatus(item.approvalStatus),
      price: Number(item.price || 0)
    }))
  ];
}

function finalReceiptBaseDescription(order) {
  const services = Array.isArray(order.services)
    ? order.services.filter(Boolean).join(", ")
    : String(order.services || "").trim();
  return services || "Servicio inicial de boleta";
}

function openFinalReceiptPdf(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const receiptWindow = window.open("", "_blank", "width=900,height=1100");
  if (!receiptWindow) {
    alert("No pude abrir la boleta. Permiti las ventanas emergentes para imprimir o guardar PDF.");
    return;
  }
  receiptWindow.document.open();
  receiptWindow.document.write(buildFinalReceiptHtml(order));
  receiptWindow.document.close();
  receiptWindow.addEventListener("load", () => {
    receiptWindow.focus();
    receiptWindow.print();
  });
}

function buildFinalReceiptHtml(order) {
  const clientName = order.clientName || findName(state.clients, order.clientId);
  const clientDocument = order.clientDocument || findDocument(state.clients, order.clientId);
  const lineItems = finalReceiptLineItems(order);
  const logoUrl = new URL("assets/logo.png", window.location.href).href;
  const modelColor = [order.model, order.color].filter((item) => item && item !== "-").join(" ") || "-";
  const delivery = order.deliveryTime || "-";
  const visual = order.diagnosis && order.diagnosis !== "-" ? order.diagnosis : "-";
  const terms = order.terms || "El equipo fue reparado o diagnosticado segun las condiciones informadas al cliente. La garantia aplica solo sobre el trabajo realizado y los repuestos detallados en esta boleta.";
  const rows = lineItems.map((item) => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${money.format(item.price || 0)}</td>
    </tr>
  `).join("");
  const total = lineItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Boleta final ${escapeHtml(order.number)}</title>
  <style>
    :root { --bg: #eef1f5; --brand: #0b5b70; --brand-dark: #083f50; --accent: #c4932f; --ink: #1d232d; --muted: #667085; --line: #d8dde6; --soft: #f6f8fb; }
    * { box-sizing: border-box; }
    @page { size: A4; margin: 8mm; }
    body { margin: 0; padding: 12px; color: var(--ink); font-family: Arial, Helvetica, sans-serif; background: var(--bg); }
    .receipt-sheet { width: 794px; min-height: 0; margin: 0 auto; padding: 18px; background: #fff; border-radius: 8px; box-shadow: 0 12px 28px rgba(29, 35, 45, 0.12); color: #151a22; }
    .receipt-header { display: grid; grid-template-columns: 1fr 178px; gap: 12px; align-items: stretch; padding-bottom: 9px; border-bottom: 2px solid var(--ink); }
    .company-block { display: grid; grid-template-columns: 48px 1fr; align-items: center; align-content: center; gap: 12px; padding-left: 4px; }
    .receipt-brand-logo { width: 46px; height: 46px; object-fit: contain; }
    .company-copy { display: grid; gap: 1px; }
    .brand-name { color: var(--brand); font-size: 25px; font-weight: 800; line-height: 1; }
    .company-copy span, .receipt-title span { color: var(--muted); font-size: 10px; line-height: 1.08; }
    .receipt-title { display: grid; align-content: center; gap: 3px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; text-align: center; }
    .receipt-title strong { font-size: 20px; line-height: 1; }
    .receipt-title b { font-size: 11px; }
    .receipt-box { margin-top: 8px; padding: 9px; border: 1px solid var(--line); border-radius: 8px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .receipt-row .receipt-box { margin-top: 0; }
    .receipt-box h3 { margin: 0 0 5px; color: var(--brand); font-size: 11px; text-transform: uppercase; }
    .receipt-box p { margin: 2px 0 0; font-size: 11px; line-height: 1.24; }
    .multiline { min-height: 22px; max-height: 78px; white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; }
    .price-line { margin-top: 7px; padding-top: 5px; border-top: 1px solid var(--line); font-size: 12px; }
    .price-line span { font-weight: 800; }
    .cost-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .cost-table th, .cost-table td { padding: 5px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    .cost-table th:last-child, .cost-table td:last-child { text-align: right; }
    .cost-table tfoot th { border-bottom: 0; font-size: 13px; }
    .receipt-visual-grid { max-height: 45px; white-space: pre-wrap; overflow: hidden; font-size: 10px; line-height: 1.2; }
    .access-preview { display: grid; grid-template-columns: 1fr 80px; gap: 8px; align-items: start; }
    .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 14px; }
    .signature-area div { display: grid; gap: 4px; text-align: center; }
    .signature-area span { height: 24px; border-bottom: 1px solid var(--ink); }
    .signature-area strong { font-size: 10px; }
    .terms-box { margin-top: 8px; }
    .terms-box .multiline { max-height: none; overflow: visible; font-size: 9px; line-height: 1.12; }
    .print-copy { page-break-before: always; break-before: page; }
    @media print {
      body { padding: 0; background: #fff; }
      .receipt-sheet { width: 100%; min-height: auto; padding: 0; border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <article class="receipt-sheet">
    <header class="receipt-header">
      <div class="company-block">
        <img class="receipt-brand-logo" src="${escapeHtml(logoUrl)}" alt="Logo Beim">
        <div class="company-copy">
          <strong class="brand-name">Boleta Beim</strong>
          <span>Servicio tecnico y tecnologia</span>
          <span>Tel.: 092 514 774</span>
          <span>Carlos Roxlo 1474 entre Colonia y Mercedes</span>
          <span>Montevideo, Uruguay</span>
        </div>
      </div>
      <div class="receipt-title">
        <span>Boleta final</span>
        <strong>${escapeHtml(order.number)}</strong>
        <span>Fecha</span>
        <b>${escapeHtml(today())}</b>
      </div>
    </header>

    <section class="receipt-box two-col">
      <div>
        <h3>Cliente</h3>
        <p><b>Nombre:</b> ${escapeHtml(clientName)}</p>
        <p><b>Cedula:</b> ${escapeHtml(clientDocument)}</p>
        <p><b>Telefono:</b> ${escapeHtml(order.clientPhone || "-")}</p>
      </div>
      <div>
        <h3>Equipo</h3>
        <p><b>Marca:</b> ${escapeHtml(order.brand || "-")}</p>
        <p><b>Modelo:</b> ${escapeHtml(modelColor)}</p>
        <p><b>Entrega estimada:</b> ${escapeHtml(delivery)}</p>
      </div>
    </section>

    <section class="two-col receipt-row">
      <div class="receipt-box">
        <h3>Falla reportada por el cliente</h3>
        <p class="multiline">${escapeHtml(order.problem || "-")}</p>
      </div>
      <div class="receipt-box">
        <h3>Servicio realizado</h3>
        <p class="multiline">${escapeHtml(finalReceiptBaseDescription(order))}</p>
        <p class="price-line"><b>Total:</b> <span>${money.format(total)}</span></p>
      </div>
    </section>

    <section class="receipt-box">
      <h3>Observaciones del tecnico</h3>
      <p class="multiline">${escapeHtml(order.technicianNotes || "-")}</p>
    </section>

    <section class="receipt-box">
      <h3>Servicios y costos desglosados</h3>
      <table class="cost-table">
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Estado</th>
            <th>Costo</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="3">Sin servicios facturados.</td></tr>`}</tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th>${money.format(total)}</th>
          </tr>
        </tfoot>
      </table>
    </section>

    <section class="receipt-box">
      <h3>Inspeccion visual</h3>
      <div class="receipt-visual-grid">${escapeHtml(visual)}</div>
    </section>

    <section class="receipt-box">
      <h3>Acceso del equipo</h3>
      <div class="access-preview">
        <div>
          <p><b>Codigo:</b> ${escapeHtml(order.unlockCode || "-")}</p>
          <p><b>Contrasena:</b> ${escapeHtml(order.unlockPassword || "-")}</p>
          <p><b>Patron:</b> ${escapeHtml(order.unlockPattern || "-")}</p>
        </div>
        <div></div>
      </div>
    </section>

    <footer class="signature-area">
      <div>
        <span></span>
        <strong>Firma del cliente</strong>
      </div>
      <div>
        <span></span>
        <strong>Recibido por BEIM</strong>
      </div>
    </footer>

    <section class="receipt-box terms-box">
      <h3>Terminos de garantia</h3>
      <p class="multiline">${escapeHtml(terms)}</p>
    </section>
  </article>
  <script>
    window.addEventListener("DOMContentLoaded", () => {
      const sheet = document.querySelector(".receipt-sheet");
      if (!sheet || document.querySelector(".print-copy")) return;
      const copy = sheet.cloneNode(true);
      copy.classList.add("print-copy");
      document.body.appendChild(copy);
    });
  </script>
</body>
</html>`;
}

function orderReceiptBox(label, value, wide = false) {
  return `
    <section class="order-receipt-box${wide ? " wide" : ""}">
      <h4>${escapeHtml(label)}</h4>
      <p>${escapeHtml(value || "-")}</p>
    </section>
  `;
}

function commit() {
  saveState();
  localStorage.setItem(SAVE_META_KEY, new Date().toISOString());
  scheduleFinancialStatePersist();
  render();
}

function render() {
  renderMetrics();
  renderDashboardFocus();
  renderOrders();
  renderClients();
  renderProducts();
  renderSales();
  renderSaleCart();
  renderCash();
  renderReports();
  renderExpenses();
  renderServices();
  renderOptions();
  renderSidebarProductCategories();
  renderMenuSettings();
  if (selectedMenuCategoryId) renderMenuCategoryLinks();
  renderDashboardLists();
}

function renderMetrics() {
  const income = incomeForPeriod("day");
  const expenses = state.expenses
    .filter((item) => !item.annulledAt)
    .filter((item) => recordIsInPeriod(item.date || item.createdAt, "day"))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const profit = income - expenses;
  const openOrders = state.orders.filter((item) => matchesOrderStatusFilter(item, "open")).length;
  const pendingBalance = state.orders.reduce((sum, item) => {
    if ((item.repairStatus || item.status) === "Cancelado") {
      return sum;
    }
    if (normalizePaymentStatus(item.paymentStatus) === "Pagado") {
      return sum;
    }
    return sum + Math.max(Number(item.budget || 0) - Number(item.paid || 0), 0);
  }, 0);

  document.getElementById("metrics").innerHTML = [
    metric("Ordenes abiertas", openOrders, "tech"),
    metric("Saldo por cobrar", money.format(pendingBalance), "warn"),
    metric("Ingresos de hoy", money.format(income), "ok"),
    metric("Utilidad de hoy", money.format(profit), profit >= 0 ? "ok" : "danger")
  ].join("");
}

function recordIsInPeriod(value, period, now = new Date()) {
  if (!value) return false;
  const day = recordLocalDay(value);
  if (!day || day.slice(0, 4) !== today().slice(0, 4)) return false;
  if (period === "month") return day.slice(0, 7) === today().slice(0, 7);
  return day === today();
}

function incomeForPeriod(period) {
  const salesIncome = state.sales
    .filter((sale) => !sale.annulledAt)
    .filter((sale) => recordIsInPeriod(sale.date || sale.createdAt, period))
    .reduce((sum, sale) => sum + saleNetTotal(sale), 0);
  const paidOrdersIncome = state.orders.filter((order) => !isSaleOrder(order)).reduce((sum, order) => {
    if (order.paymentMovements?.length) return sum + order.paymentMovements.filter((movement) => recordIsInPeriod(movement.businessDate || movement.createdAt, period)).reduce((movementSum, movement) => movementSum + Number(movement.amount || 0), 0);
    return sum + (orderCollectedAmount(order) > 0 && recordIsInPeriod(order.paidAt || order.finishedAt || order.date, period) ? orderCollectedAmount(order) : 0);
  }, 0);
  return salesIncome + paidOrdersIncome;
}

function renderDashboardFocus() {
  const diagnosticOrders = state.orders.filter((order) => (order.repairStatus || order.status) === "En diagnostico").length;
  const waitingApproval = state.orders.filter((order) => ["Presupuestado", "Esperando aprobacion"].includes(order.repairStatus || order.status)).length;
  const overdueOrders = state.orders.filter((order) => !isFinishedOrderStatus(order.repairStatus || order.status || "") && orderStageAge(order).days >= 3).length;
  const readyOrders = state.orders.filter((order) => {
    return ["Listo para retirar", "Finalizado", "Cancelado"].includes(order.repairStatus || order.status);
  }).length;
  const unpaidOrders = state.orders.filter((order) => {
    if ((order.repairStatus || order.status) === "Cancelado") return false;
    return normalizePaymentStatus(order.paymentStatus) !== "Pagado" && Number(order.budget || 0) > 0;
  }).length;
  const lowStock = lowStockProducts().length;
  const todaySales = state.sales.filter((sale) => sale.date === today() && !sale.annulledAt).reduce((sum, sale) => sum + saleNetTotal(sale), 0);
  const focusItems = [
    { label: "Para diagnosticar", value: diagnosticOrders, meta: "Ingresos que necesitan revisión", tone: "tech", view: "orders", filter: "open" },
    { label: "Esperando cliente", value: waitingApproval, meta: "Presupuestos sin respuesta", tone: "warn", view: "orders", filter: "open" },
    { label: "Órdenes demoradas", value: overdueOrders, meta: "Sin avances durante 3 días o más", tone: "danger", view: "orders", filter: "open" },
    {
      label: "Listos para retirar",
      value: readyOrders,
      meta: "Ordenes que pueden entregarse",
      tone: "ok",
      view: "orders",
      filter: "ready"
    },
    {
      label: "Pagos pendientes",
      value: unpaidOrders,
      meta: "Trabajos con saldo abierto",
      tone: "danger",
      view: "orders",
      filter: "open"
    },
    {
      label: "Stock bajo",
      value: lowStock,
      meta: "Productos de Web y Taller para reponer",
      tone: "warn",
      view: "products"
    },
    {
      label: "Ventas de hoy",
      value: money.format(todaySales),
      meta: "Ingreso directo del dia",
      tone: "tech",
      view: "sales"
    },
    {
      label: "Gastos de hoy",
      value: money.format(state.expenses.filter((expense) => !expense.annulledAt && !isInventoryPurchaseRecord(expense) && recordIsInPeriod(expense.date || expense.createdAt, "day")).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)),
      meta: "Egresos registrados durante el dia",
      tone: "danger",
      view: "reports"
    }
  ];

  const container = document.getElementById("dashboardFocus");
  if (!container) return;
  container.innerHTML = focusItems.map((item) => `
    <button class="focus-card ${item.tone}" type="button" data-focus-view="${item.view}" data-focus-filter="${item.filter || ""}">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <small>${item.meta}</small>
    </button>
  `).join("");

  container.querySelectorAll("[data-focus-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.focusFilter) {
        orderStatusFilter = button.dataset.focusFilter;
      }
      lastSidebarView = button.dataset.focusView;
      showView(button.dataset.focusView);
      render();
    });
  });
}

function metric(label, value, tone = "neutral") {
  return `
    <article class="metric ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

const ORDER_FLOW = ["En diagnostico", "Presupuestado", "Esperando aprobacion", "Aprobado", "En reparacion", "Listo para retirar", "Entregado"];

function orderStageAge(order) {
  const source = order.updatedAt || order.finishedAt || order.createdAt || order.date;
  const timestamp = source ? new Date(String(source).length === 10 ? `${source}T12:00:00` : source).getTime() : Date.now();
  const days = Math.max(0, Math.floor((Date.now() - (Number.isFinite(timestamp) ? timestamp : Date.now())) / 86400000));
  if (days >= 7) return { days, label: `${days} días`, tone: "age-danger" };
  if (days >= 3) return { days, label: `${days} días`, tone: "age-warn" };
  if (days >= 1) return { days, label: `${days} día${days === 1 ? "" : "s"}`, tone: "age-watch" };
  return { days, label: "Hoy", tone: "age-ok" };
}

function orderNextAction(order) {
  const status = order.repairStatus || order.status || "En diagnostico";
  const payment = normalizePaymentStatus(order.paymentStatus);
  const actions = {
    "En diagnostico": ["Completar diagnóstico", "Definir servicios y repuestos"],
    "Presupuestado": ["Enviar presupuesto", "Solicitar respuesta al cliente"],
    "Esperando aprobacion": ["Contactar al cliente", "Confirmar o rechazar servicios"],
    "Aprobado": ["Comenzar reparación", "Verificar repuestos reservados"],
    "Esperando repuesto": ["Revisar llegada del repuesto", "Actualizar al cliente"],
    "En reparacion": ["Continuar reparación", "Registrar trabajo y pruebas"],
    "Listo para retirar": [payment === "Pagado" ? "Coordinar entrega" : "Cobrar y entregar", payment === "Pagado" ? "Avisar al cliente" : "Existe saldo pendiente"],
    "Finalizado": [payment === "Pagado" ? "Entregar equipo" : "Registrar cobro", "Cerrar la orden"],
    "Entregado": ["Orden completada", "Sin acciones pendientes"],
    "Cancelado": ["Orden cancelada", "Revisar devoluciones de stock"]
  };
  const [label, meta] = actions[status] || ["Revisar orden", "Definir siguiente etapa"];
  return { label, meta };
}

function renderOrderOperationalHeader(order) {
  const context = document.getElementById("orderContextBar");
  const workflow = document.getElementById("orderWorkflow");
  const next = orderNextAction(order);
  const age = orderStageAge(order);
  if (context) context.innerHTML = `
    <div><span>Cliente</span><strong>${escapeHtml(order.clientName || findName(state.clients, order.clientId))}</strong></div>
    <div><span>Equipo</span><strong>${escapeHtml([order.brand, order.model].filter(Boolean).join(" ") || order.device || "-")}</strong></div>
    <div><span>Próxima acción</span><strong>${escapeHtml(next.label)}</strong></div>
    <div><span>En esta etapa</span><strong class="stage-age ${age.tone}">${escapeHtml(age.label)}</strong></div>`;
  if (!workflow) return;
  const current = order.repairStatus || order.status || "En diagnostico";
  const currentIndex = ORDER_FLOW.indexOf(current);
  workflow.innerHTML = ORDER_FLOW.map((stage, index) => `<div class="${index < currentIndex ? "done" : index === currentIndex ? "current" : ""}"><span>${index + 1}</span><small>${escapeHtml(stage)}</small></div>`).join("");
}

function orderQuickActionsMarkup(order) {
  const phone = String(order.clientPhone || "").replace(/\D/g, "");
  const message = encodeURIComponent(`Hola ${order.clientName || ""}, te contactamos de BEIM por la orden ${order.number || ""}.`);
  return `<section class="order-quick-actions"><div><span>Acciones rápidas</span><strong>${escapeHtml(orderNextAction(order).label)}</strong></div>${phone ? `<a href="tel:${phone}">Llamar</a><a href="https://wa.me/${phone}?text=${message}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}<button type="button" data-copy-order="${escapeHtml(order.number || "")}" title="Copia el número de esta orden de trabajo">Copiar número de orden</button></section>`;
}

function orderActivityTimelineMarkup(order) {
  const items = normalizeServiceItems(order);
  const events = [
    { at: order.createdAt || order.date, title: "Orden ingresada", detail: `${order.device || "Equipo"} recibido para revisión.` },
    ...items.map((item) => ({ at: item.stockDeductedAt || order.updatedAt || order.date, title: `${item.description} · ${item.approvalStatus}`, detail: item.stockDeducted ? `Producto descontado del stock (${item.quantity || 1} unidad).` : "Sin movimiento de stock registrado." })),
    { at: order.updatedAt || order.finishedAt || order.date, title: `Estado: ${order.repairStatus || order.status || "En diagnóstico"}`, detail: orderNextAction(order).meta },
    ...(Number(order.paid || 0) > 0 ? [{ at: order.paidAt || order.updatedAt || order.date, title: `Pago: ${normalizePaymentStatus(order.paymentStatus)}`, detail: `${money.format(order.paid || 0)} registrado.` }] : [])
  ].filter((event) => event.at);
  return `<section class="order-activity"><div class="order-activity-head"><span>Historial de la orden</span><strong>${events.length} movimientos</strong></div><div class="order-activity-list">${events.map((event) => `<div><i></i><p><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.detail)}</span><time>${escapeHtml(formatOperationalDate(event.at))}</time></p></div>`).join("")}</div></section>`;
}

function formatOperationalDate(value) {
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderOrders() {
  const orders = filterBySearch(state.orders, (order) => [
    order.number,
    order.clientName,
    order.clientDocument,
    order.clientPhone,
    order.device,
    order.brand,
    order.model,
    order.problem,
    order.diagnosis,
    order.status
  ]);
  renderOrderStatusBar();
  const filteredOrders = orders.filter((order) => matchesOrderStatusFilter(order, orderStatusFilter));
  const sortedOrders = sortedByDate(filteredOrders).slice(0, TABLE_ROW_LIMIT);
  const showFinalReceipt = orderStatusFilter === "finished";
  const finalReceiptHeader = document.getElementById("ordersFinalReceiptHeader");
  if (finalReceiptHeader) finalReceiptHeader.hidden = !showFinalReceipt;
  const rows = sortedOrders.map((order) => {
    const age = orderStageAge(order);
    return `
      <tr class="openable-row ${age.tone}" data-order-id="${order.id}" title="${escapeHtml(order.problem)}">
        <td><strong class="table-id">${escapeHtml(order.number)}</strong></td>
        <td><strong>${escapeHtml(order.clientName || findName(state.clients, order.clientId))}</strong></td>
        <td><strong>${escapeHtml([order.brand, order.model].filter(Boolean).join(" ") || order.device || "-")}</strong><small class="cell-subtext">${escapeHtml(order.device || "")}</small></td>
        <td>${statusSelect(order)}</td>
        <td><span class="stage-age ${age.tone}">${escapeHtml(age.label)}</span></td>
        <td class="money-cell">${money.format(order.budget || 0)}</td>
        <td>${paymentStatusSelect(order)}</td>
        ${showFinalReceipt ? `<td><button class="row-action" type="button" data-final-receipt="${order.id}">Boleta PDF</button></td>` : ""}
      </tr>
    `;
  });

  setTable("ordersTable", rows, showFinalReceipt ? 8 : 7, "No hay ordenes de trabajo cargadas.");
  document.querySelectorAll("#ordersTable .openable-row").forEach((row) => {
    row.addEventListener("dblclick", (event) => {
      if (event.target.closest("button, select")) return;
      openOrderDetail(row.dataset.orderId);
    });
  });
  document.querySelectorAll("[data-final-receipt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openFinalReceiptPdf(button.dataset.finalReceipt);
    });
  });
  document.querySelectorAll("[data-order-status]").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("dblclick", (event) => event.stopPropagation());
    select.addEventListener("change", async () => {
      const order = state.orders.find((item) => item.id === select.dataset.orderStatus);
      if (!order) return;
      if (select.value === "Entregado" && normalizePaymentStatus(order.paymentStatus) !== "Pagado" && Number(order.budget || 0) > Number(order.paid || 0)) {
        const confirmedDelivery = await requestConfirmation({ eyebrow: "Saldo pendiente", title: "La orden todavía no está pagada", description: `Queda un saldo de ${money.format(Math.max(Number(order.budget || 0) - Number(order.paid || 0), 0))}. Solo continuá si la entrega está autorizada.`, summary: order.number, acceptLabel: "Entregar igualmente" });
        if (!confirmedDelivery) { select.value = order.repairStatus || order.status || "En diagnostico"; return; }
      }
      const previousFinishedAt = order.finishedAt || "";
      const approvedServiceItems = select.value === "Aprobado"
        ? normalizeServiceItems(order).map((item) => ({
          ...item,
          approvalStatus: item.approvalStatus === "Pendiente" ? "Aprobado" : item.approvalStatus
        }))
        : null;
      applyFinishedTimestamp(order, select.value);
      const nextFinishedAt = order.finishedAt || "";
      if (apiOnline && order.receiptId) {
        try {
          await apiRequest(`/receipts/${encodeURIComponent(order.receiptId)}/status`, {
            method: "PATCH",
            body: {
              status: select.value,
              technicianNotes: order.technicianNotes || "",
              ...(approvedServiceItems ? {
                serviceItems: approvedServiceItems,
                quoteTotal: technicalBaseBudget(order) + serviceItemsTotal(approvedServiceItems)
              } : {}),
              finishedAt: order.finishedAt || ""
            }
          });
          await syncAfterRemoteChange();
          const syncedOrder = state.orders.find((item) => item.id === order.id || item.receiptId === order.receiptId);
          if (syncedOrder && isFinishedOrderStatus(select.value) && !syncedOrder.finishedAt) {
            syncedOrder.finishedAt = nextFinishedAt;
            saveState();
            render();
          }
          return;
        } catch (error) {
          order.finishedAt = previousFinishedAt;
          alert(error.message || "No se pudo actualizar la orden en el servidor.");
          select.value = order.repairStatus || order.status || "En diagnostico";
          return;
        }
      }
      order.status = select.value;
      order.repairStatus = select.value;
      if (approvedServiceItems) {
        commitApprovedServiceItemStockLocally(approvedServiceItems);
        order.serviceItems = approvedServiceItems;
      }
      commit();
    });
  });
  document.querySelectorAll("[data-payment-status]").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("dblclick", (event) => event.stopPropagation());
    select.addEventListener("change", async () => {
      const order = state.orders.find((item) => item.id === select.dataset.paymentStatus);
      if (!order) return;
      const previousStatus = order.paymentStatus || "Sin abonar";
      let collectedAmount = Number(order.paid || 0);
      if (select.value === "Seña") {
        const requestedAmount = prompt("Monto cobrado como seña:", collectedAmount > 0 ? collectedAmount : "");
        if (requestedAmount === null) {
          select.value = previousStatus;
          return;
        }
        collectedAmount = Number(String(requestedAmount).replace(",", "."));
        if (!Number.isFinite(collectedAmount) || collectedAmount <= 0) {
          alert("Ingresa un monto cobrado válido.");
          select.value = previousStatus;
          return;
        }
      } else if (select.value === "Pagado") {
        collectedAmount = Number(order.budget || 0);
      } else {
        collectedAmount = 0;
      }
      if (apiOnline && order.receiptId) {
        try {
          await apiRequest(`/receipts/${encodeURIComponent(order.receiptId)}/payment-status`, {
            method: "PATCH",
            body: { paymentStatus: select.value, paid: collectedAmount, paidAt: collectedAmount > 0 ? new Date().toISOString() : "", businessDate: today() }
          });
          await syncAfterRemoteChange();
          const updatedOrder = state.orders.find((item) => item.id === order.id || item.receiptId === order.receiptId);
          if (updatedOrder) {
            updatedOrder.paid = collectedAmount;
            updatedOrder.paidAt = select.value !== "Sin abonar" ? (updatedOrder.paidAt || new Date().toISOString()) : "";
            saveState();
          }
          return;
        } catch (error) {
          alert(error.message || "No se pudo actualizar el estado de pago.");
          select.value = previousStatus;
          return;
        }
      }
      order.paymentStatus = select.value;
      order.paid = collectedAmount;
      order.paidAt = select.value !== "Sin abonar" ? (order.paidAt || new Date().toISOString()) : "";
      commit();
    });
  });
}

function renderOrderStatusBar() {
  const filters = [
    { id: "all", label: "Todas las ordenes" },
    { id: "open", label: "Ordenes abiertas" },
    { id: "diagnosis", label: "En diagnostico" },
    { id: "budget", label: "Presupuesto" },
    { id: "approved", label: "Aprobado" },
    { id: "waitingParts", label: "Espera repuesto" },
    { id: "process", label: "En proceso" },
    { id: "finished", label: "Finalizadas" }
  ];

  document.getElementById("ordersStatusBar").innerHTML = filters.map((filter) => {
    const count = state.orders.filter((order) => matchesOrderStatusFilter(order, filter.id)).length;
    const activeClass = filter.id === orderStatusFilter ? " active" : "";
    return `
      <button class="order-status-filter ${filter.id}${activeClass}" type="button" data-order-filter="${filter.id}">
        <span>${filter.label}</span>
        <strong>${count}</strong>
      </button>
    `;
  }).join("");
}

function matchesOrderStatusFilter(order, filter) {
  const status = order.repairStatus || order.status || "";
  const processStatuses = ["En reparacion", "Listo para retirar"];

  if (filter === "all") {
    return true;
  }
  if (filter === "open") {
    return !isFinishedOrderStatus(status);
  }
  if (filter === "diagnosis") {
    return status === "En diagnostico";
  }
  if (filter === "budget") {
    return status === "Presupuestado";
  }
  if (filter === "waitingApproval") {
    return status === "Esperando aprobacion";
  }
  if (filter === "approved") {
    return status === "Aprobado";
  }
  if (filter === "process") {
    return processStatuses.includes(status);
  }
  if (filter === "ready") {
    return ["Listo para retirar", "Finalizado", "Cancelado"].includes(status);
  }
  if (filter === "waitingParts") {
    return status === "Esperando repuesto";
  }
  if (filter === "finished") {
    return status !== "Cancelado" && isFinishedInCurrentWorkday(order);
  }
  return true;
}

function renderClients() {
  const clients = filterBySearch(state.clients, (client) => [
    client.name,
    client.document,
    client.phone,
    client.email
  ]);
  const rows = clients.slice(0, TABLE_ROW_LIMIT).map((client) => `
    <tr>
      <td><strong>${escapeHtml(client.name)}</strong></td>
      <td>${escapeHtml(client.document || "-")}</td>
      <td>${escapeHtml(client.phone)}</td>
      <td>${escapeHtml(client.email)}</td>
      <td><div class="client-row-actions"><button class="row-action primary-row-action" type="button" data-open-client="${client.id}">Abrir</button>${normalizedMenuLabel(client.name) === "default" ? `<span class="empty">Cliente fijo</span>` : `<button class="row-action" data-delete-client="${client.id}">Borrar</button>`}</div></td>
    </tr>
  `);

  setTable("clientsTable", rows, 5, "No hay clientes cargados.");
  document.querySelectorAll("[data-open-client]").forEach((button) => {
    button.addEventListener("click", () => openClientDetail(button.dataset.openClient));
  });
  bindDelete("[data-delete-client]", async (id) => {
    if (normalizedMenuLabel(state.clients.find((item) => item.id === id)?.name) === "default") return false;
    if (apiOnline && !String(id).startsWith("receipt-client-")) {
      await apiRequest(`/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
      await syncAfterRemoteChange();
      return false;
    }
    state.clients = state.clients.filter((item) => item.id !== id);
    state.orders = state.orders.filter((item) => item.clientId !== id);
    state.sales = state.sales.filter((item) => item.clientId !== id);
  });
}

function normalizedClientValue(value) {
  return normalizedMenuLabel(String(value || "").trim());
}

function orderBelongsToClient(order, client) {
  if (String(order.clientId || "") === String(client.id || "")) return true;
  const comparableFields = [
    [order.clientDocument, client.document],
    [order.clientEmail || order.email, client.email],
    [order.clientPhone || order.phone, client.phone]
  ];
  if (comparableFields.some(([orderValue, clientValue]) => {
    const left = normalizedClientValue(orderValue);
    const right = normalizedClientValue(clientValue);
    return left && right && left !== "-" && right !== "-" && left === right;
  })) return true;
  const orderName = normalizedClientValue(order.clientName);
  const clientName = normalizedClientValue(client.name);
  return Boolean(orderName && clientName && orderName === clientName);
}

function clientOrderTimestamp(order) {
  const raw = order.createdAt || order.entryDate || order.date || order.updatedAt || "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function openClientDetail(clientId) {
  const client = state.clients.find((item) => String(item.id) === String(clientId));
  if (!client) return;
  const orders = state.orders
    .filter((order) => orderBelongsToClient(order, client))
    .sort((left, right) => clientOrderTimestamp(right) - clientOrderTimestamp(left)
      || String(right.number || "").localeCompare(String(left.number || ""), "es", { numeric: true }));
  const panel = document.getElementById("clientDetailPanel");
  document.getElementById("clientDetailTitle").textContent = client.name || "Detalle del cliente";
  document.getElementById("clientDetailBody").innerHTML = `
    <section class="client-detail-summary">
      <div><span>Cédula</span><strong>${escapeHtml(client.document || "-")}</strong></div>
      <div><span>Teléfono</span><strong>${escapeHtml(client.phone || "-")}</strong></div>
      <div><span>Email</span><strong>${escapeHtml(client.email || "-")}</strong></div>
      <div><span>Órdenes realizadas</span><strong>${orders.length}</strong></div>
    </section>
    <div class="client-orders-head"><div><h3>Órdenes realizadas</h3><p>Ordenadas desde la más reciente hasta la más antigua.</p></div></div>
    <div class="table-wrap client-orders-table"><table>
      <thead><tr><th>Orden</th><th>Fecha</th><th>Equipo</th><th>Estado</th><th>Total</th><th></th></tr></thead>
      <tbody>${orders.length ? orders.map((order) => `<tr>
        <td><strong class="table-id">${escapeHtml(order.number || "-")}</strong></td>
        <td>${escapeHtml(formatOperationalDate(order.createdAt || order.entryDate || order.date))}</td>
        <td>${escapeHtml([order.device, order.brand, order.model].filter(Boolean).join(" · ") || "-")}</td>
        <td>${statusBadge(order.repairStatus || order.status || "-")}</td>
        <td class="money-cell">${money.format(Number(order.budget || 0))}</td>
        <td><button class="row-action primary-row-action" type="button" data-open-client-order="${order.id}">Abrir</button></td>
      </tr>`).join("") : `<tr><td colspan="6"><p class="empty">Este cliente todavía no tiene órdenes registradas.</p></td></tr>`}</tbody>
    </table></div>`;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
}

function closeClientDetail() {
  const panel = document.getElementById("clientDetailPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

function bindClientDetail() {
  const panel = document.getElementById("clientDetailPanel");
  document.getElementById("closeClientDetail").addEventListener("click", closeClientDetail);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) closeClientDetail();
    const orderButton = event.target.closest("[data-open-client-order]");
    if (!orderButton) return;
    closeClientDetail();
    openOrderDetail(orderButton.dataset.openClientOrder);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("open")) closeClientDetail();
  });
}

function normalizeProductInventoryScope(product) {
  const explicitScope = String(product.inventoryScope || product.scope || product.source || "").toLowerCase();
  if (["workshop", "taller", "local"].includes(explicitScope)) return WORKSHOP_PRODUCT_SCOPE;
  if (["web", "catalog", "catalogo", "store", "tienda"].includes(explicitScope)) return WEB_PRODUCT_SCOPE;

  const type = String(product.productType || product.product_type || "").toLowerCase();
  if (["repuesto", "servicio", "taller", "insumo", "herramienta"].includes(type)) {
    return WORKSHOP_PRODUCT_SCOPE;
  }
  if (["accesorio", "producto", "web", "catalogo", "tienda"].includes(type)) {
    return WEB_PRODUCT_SCOPE;
  }

  return WORKSHOP_PRODUCT_SCOPE;
}

function isWorkshopProduct(product) {
  const scope = String(product.inventoryScope || product.scope || product.source || WORKSHOP_PRODUCT_SCOPE).toLowerCase();
  return scope === WORKSHOP_PRODUCT_SCOPE || scope === "taller" || scope === "local";
}

function workshopProducts() {
  return state.products.filter(isWorkshopProduct);
}

function lowStockLimit(product) {
  const configuredLimit = Number(product.minStock);
  return Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 2;
}

function lowStockProducts() {
  return state.products.filter((product) => Number(product.stock || 0) <= lowStockLimit(product));
}

function productOrigin(product) {
  return isWorkshopProduct(product) ? "Taller" : "Web";
}

function renderProducts() {
  const stockProducts = workshopProducts();
  const categoryFilteredProducts = selectedProductCategoryId === "all"
    ? stockProducts
    : stockProducts.filter((product) => product.categoryId === selectedProductCategoryId);
  const products = filterBySearch(categoryFilteredProducts, (product) => [
    product.name,
    findCategoryName(product.categoryId),
    product.brand,
    product.model,
    product.color,
    product.costPrice,
    product.salePrice,
    product.stock
  ]);
  const rows = products.slice(0, TABLE_ROW_LIMIT).map((product) => `
    <tr>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(findCategoryName(product.categoryId))}</td>
      <td>${escapeHtml(product.brand || "-")}</td>
      <td>${escapeHtml(product.model || "-")}</td>
      <td>${escapeHtml(product.color || "-")}</td>
      <td class="money-cell">${money.format(product.costPrice || 0)}</td>
      <td class="money-cell">${money.format(product.salePrice || product.price || 0)}</td>
      <td><span class="stock-badge${product.stock <= lowStockLimit(product) ? " low" : ""}">${product.stock}</span></td>
      <td>${lowStockLimit(product)}</td>
      <td><button class="row-action" type="button" data-stock-movements="${product.id}">Movimientos</button> <button class="row-action" data-delete-product="${product.id}">Borrar</button></td>
    </tr>
  `);

  renderProductCategories();
  setTable("productsTable", rows, 10, "No hay productos cargados en el stock del taller.");
  document.querySelectorAll("[data-stock-movements]").forEach((button) => button.addEventListener("click", () => renderStockMovements(button.dataset.stockMovements)));
  bindDelete("[data-delete-product]", async (id) => {
    if (apiOnline) {
      await apiRequest(`/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      await syncAfterRemoteChange();
      return false;
    }
    state.products = state.products.filter((item) => item.id !== id);
    state.sales = state.sales.filter((item) => item.productId !== id);
  });
}

async function renderStockMovements(productId) {
  const panel = document.getElementById("stockMovementsPanel");
  const product = state.products.find((item) => item.id === productId);
  if (!panel || !product) return;
  panel.hidden = false;
  panel.innerHTML = `<p class="empty">Cargando movimientos de ${escapeHtml(product.name)}...</p>`;
  try {
    const payload = apiOnline ? await apiRequest(`/stock-movements?productId=${encodeURIComponent(productId)}`) : { movements: [] };
    const movements = payload.movements || [];
    const labels = { purchase: "Compra", sale: "Venta", sale_annulment: "Anulación de venta", purchase_annulment: "Anulación de compra", return: "Devolución", adjustment: "Ajuste" };
    panel.innerHTML = `<div class="menu-category-detail-head"><div><p class="eyebrow">Historial de stock</p><h3>${escapeHtml(product.name)}</h3></div><button class="row-action" type="button" data-close-stock-movements>Cerrar</button></div>
      <div class="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Movimiento</th><th>Cantidad</th><th>Saldo</th><th>Referencia</th><th>Detalle</th></tr></thead><tbody>
      ${movements.length ? movements.map((movement) => `<tr><td>${new Date(movement.createdAt).toLocaleString("es-UY")}</td><td>${escapeHtml(labels[movement.movementType] || movement.movementType)}</td><td class="money-cell">${movement.quantity > 0 ? "+" : ""}${movement.quantity}</td><td>${movement.balanceAfter}</td><td>${escapeHtml(movement.referenceId || "-")}</td><td>${escapeHtml(movement.detail || "-")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">No hay movimientos registrados todavía.</td></tr>`}
      </tbody></table></div>`;
    panel.querySelector("[data-close-stock-movements]").addEventListener("click", () => { panel.hidden = true; });
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) { panel.innerHTML = `<p class="empty">${escapeHtml(error.message || "No se pudo cargar el historial.")}</p>`; }
}

function renderSidebarProductCategories() {
  const container = document.getElementById("sidebarProductCategories");
  if (!container) return;
  const visibleCategories = sortedStockCategories().filter((category) => category.name.toLowerCase() !== "general");
  const categoryButtons = visibleCategories.map((category) => {
    const count = workshopProducts().filter((product) => product.categoryId === category.id).length;
    const active = selectedProductCategoryId === category.id ? " active" : "";
    return `<button class="subnav-button${active}" type="button" data-sidebar-category="${category.id}">${escapeHtml(category.name)} (${count})</button>`;
  }).join("");

  container.innerHTML = categoryButtons;
  container.classList.toggle("visible", visibleCategories.length > 0 && stockSubmenuExpanded);
  document.querySelector(".nav-stock-toggle")?.setAttribute("aria-expanded", String(visibleCategories.length > 0 && stockSubmenuExpanded));

  container.querySelectorAll("[data-sidebar-category]").forEach((button) => {
    button.addEventListener("click", () => {
      stockSubmenuExpanded = true;
      selectedProductCategoryId = button.dataset.sidebarCategory;
      lastSidebarView = "products";
      showView("products");
      renderProducts();
    });
  });
}

function sortedStockCategories() {
  let savedOrder = [];
  try { savedOrder = JSON.parse(localStorage.getItem(PRODUCT_CATEGORY_ORDER_KEY) || "[]"); } catch { savedOrder = []; }
  const positions = new Map(savedOrder.map((id, index) => [id, index]));
  return [...state.productCategories].sort((left, right) => {
    const leftPosition = positions.has(left.id) ? positions.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.has(right.id) ? positions.get(right.id) : Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function reorderStockCategory(categoryId, direction) {
  const categories = sortedStockCategories();
  const index = categories.findIndex((category) => category.id === categoryId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= categories.length) return;
  [categories[index], categories[target]] = [categories[target], categories[index]];
  localStorage.setItem(PRODUCT_CATEGORY_ORDER_KEY, JSON.stringify(categories.map((category) => category.id)));
  localStorage.setItem(SAVE_META_KEY, new Date().toISOString());
  scheduleFinancialStatePersist(0);
  renderProductCategories();
  renderSidebarProductCategories();
  renderOptions();
}

function orderedProductCategories() {
  const categories = state.productCategories || [];
  const result = [];
  const appendChildren = (parentId, depth, ancestry = new Set()) => {
    categories
      .filter((category) => (category.parentId || "") === parentId && !ancestry.has(category.id))
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || left.name.localeCompare(right.name, "es"))
      .forEach((category) => {
        result.push({ category, depth });
        appendChildren(category.id, depth + 1, new Set([...ancestry, category.id]));
      });
  };
  appendChildren("", 0);
  categories.filter((category) => !result.some((item) => item.category.id === category.id))
    .forEach((category) => result.push({ category: { ...category, parentId: "" }, depth: 0 }));
  return result;
}

function categoryDescendantIds(categoryId) {
  const descendants = [];
  const visit = (parentId) => {
    state.productCategories.filter((category) => category.parentId === parentId).forEach((category) => {
      if (descendants.includes(category.id)) return;
      descendants.push(category.id);
      visit(category.id);
    });
  };
  visit(categoryId);
  return descendants;
}

function categoryParentOptions(selectedId = "", excludedIds = []) {
  const options = orderedProductCategories()
    .filter(({ category }) => !excludedIds.includes(category.id))
    .map(({ category, depth }) => `<option value="${category.id}"${category.id === selectedId ? " selected" : ""}>${"— ".repeat(depth)}${escapeHtml(category.name)}</option>`)
    .join("");
  return `<option value=""${selectedId ? "" : " selected"}>Sin categoría superior</option>${options}`;
}

function renderSettingsCategories() {
  const form = document.getElementById("settingsCategoryForm");
  const tree = document.getElementById("settingsCategoryTree");
  if (!form || !tree) return;
  const currentParent = form.elements.parentId.value;
  form.elements.parentId.innerHTML = categoryParentOptions(currentParent);
  tree.innerHTML = orderedProductCategories().map(({ category, depth }) => {
    const protectedCategory = category.name.toLowerCase() === "general";
    const excluded = [category.id, ...categoryDescendantIds(category.id)];
    return `<div class="settings-category-row" style="margin-left:${Math.min(depth, 5) * 22}px" data-settings-category="${category.id}">
      <input value="${escapeHtml(category.name)}" data-settings-name="${category.id}" aria-label="Nombre de ${escapeHtml(category.name)}">
      <select data-settings-parent="${category.id}" aria-label="Categoría superior de ${escapeHtml(category.name)}">${categoryParentOptions(category.parentId || "", excluded)}</select>
      <div class="settings-category-actions">
        <button class="row-action" type="button" data-category-up="${category.id}" title="Subir">↑</button>
        <button class="row-action" type="button" data-category-down="${category.id}" title="Bajar">↓</button>
        ${protectedCategory ? "" : `<button class="row-action" type="button" data-settings-delete="${category.id}">Eliminar</button>`}
      </div>
    </div>`;
  }).join("") || `<p class="empty">No hay categorías creadas.</p>`;

  tree.querySelectorAll("[data-settings-name]").forEach((input) => input.addEventListener("change", () => renameSettingsCategory(input.dataset.settingsName, input.value)));
  tree.querySelectorAll("[data-settings-parent]").forEach((select) => select.addEventListener("change", () => moveSettingsCategory(select.dataset.settingsParent, select.value)));
  tree.querySelectorAll("[data-category-up]").forEach((button) => button.addEventListener("click", () => reorderSettingsCategory(button.dataset.categoryUp, -1)));
  tree.querySelectorAll("[data-category-down]").forEach((button) => button.addEventListener("click", () => reorderSettingsCategory(button.dataset.categoryDown, 1)));
  tree.querySelectorAll("[data-settings-delete]").forEach((button) => button.addEventListener("click", () => deleteProductCategory(button.dataset.settingsDelete)));
}

async function createSettingsCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const name = String(data.name || "").trim();
  if (name.length < 2) return alert("La categoría necesita un nombre.");
  if (state.productCategories.some((category) => category.name.toLowerCase() === name.toLowerCase())) return alert("Esa categoría ya existe.");
  const siblings = state.productCategories.filter((category) => (category.parentId || "") === (data.parentId || ""));
  const category = { id: uid("cat"), name, parentId: data.parentId || "", order: siblings.length };
  if (apiOnline) {
    try {
      await apiRequest("/categories", { method: "POST", body: category });
      const metadata = loadCategoryTreeMeta();
      metadata[category.id] = { parentId: category.parentId, order: category.order };
      localStorage.setItem(CATEGORY_TREE_KEY, JSON.stringify(metadata));
      scheduleFinancialStatePersist(0);
      form.reset();
      await syncAfterRemoteChange();
      return;
    } catch (error) { return alert(error.message || "No se pudo crear la categoría."); }
  }
  state.productCategories.push(category);
  form.reset();
  commit();
}

async function renameSettingsCategory(categoryId, requestedName) {
  const category = state.productCategories.find((item) => item.id === categoryId);
  const name = String(requestedName || "").trim();
  if (!category || name.length < 2) return renderSettingsCategories();
  if (state.productCategories.some((item) => item.id !== categoryId && item.name.toLowerCase() === name.toLowerCase())) {
    alert("Esa categoría ya existe.");
    return renderSettingsCategories();
  }
  if (apiOnline) {
    try { await apiRequest(`/categories/${encodeURIComponent(categoryId)}`, { method: "PATCH", body: { name } }); await syncAfterRemoteChange(); }
    catch (error) { alert(error.message || "No se pudo modificar la categoría."); renderSettingsCategories(); }
    return;
  }
  category.name = name;
  commit();
}

function moveSettingsCategory(categoryId, parentId) {
  const category = state.productCategories.find((item) => item.id === categoryId);
  if (!category || categoryId === parentId || categoryDescendantIds(categoryId).includes(parentId)) return;
  category.parentId = parentId || "";
  category.order = state.productCategories.filter((item) => item.id !== categoryId && (item.parentId || "") === category.parentId).length;
  commit();
}

function reorderSettingsCategory(categoryId, direction) {
  const category = state.productCategories.find((item) => item.id === categoryId);
  if (!category) return;
  const siblings = state.productCategories
    .filter((item) => (item.parentId || "") === (category.parentId || ""))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const index = siblings.findIndex((item) => item.id === categoryId);
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= siblings.length) return;
  [siblings[index], siblings[targetIndex]] = [siblings[targetIndex], siblings[index]];
  siblings.forEach((item, order) => { item.order = order; });
  commit();
}

function renderProductCategories() {
  document.getElementById("productCategoriesList").innerHTML = state.productCategories.length
    ? sortedStockCategories().map((category) => {
      const count = workshopProducts().filter((product) => product.categoryId === category.id).length;
      const canDelete = category.name.toLowerCase() !== "general";
      return `
        <span class="category-pill">
          ${escapeHtml(category.name)} (${count})
          <button class="category-edit-button" type="button" data-stock-category-up="${category.id}" aria-label="Subir ${escapeHtml(category.name)}">↑</button>
          <button class="category-edit-button" type="button" data-stock-category-down="${category.id}" aria-label="Bajar ${escapeHtml(category.name)}">↓</button>
          <button class="category-edit-button" type="button" data-edit-category="${category.id}" aria-label="Editar ${escapeHtml(category.name)}">Editar</button>
          ${canDelete ? `<button class="category-delete-button" type="button" data-delete-category="${category.id}" aria-label="Eliminar ${escapeHtml(category.name)}">x</button>` : ""}
        </span>
      `;
    }).join("")
    : `<p class="empty">No hay subcategorias cargadas.</p>`;

  document.querySelectorAll("[data-stock-category-up]").forEach((button) => {
    button.addEventListener("click", () => reorderStockCategory(button.dataset.stockCategoryUp, -1));
  });
  document.querySelectorAll("[data-stock-category-down]").forEach((button) => {
    button.addEventListener("click", () => reorderStockCategory(button.dataset.stockCategoryDown, 1));
  });

  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteProductCategory(button.dataset.deleteCategory);
    });
  });

  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      await editProductCategory(button.dataset.editCategory);
    });
  });
}

async function editProductCategory(categoryId) {
  const category = state.productCategories.find((item) => item.id === categoryId);
  if (!category) return;
  const requestedName = prompt("Nuevo nombre de la subcategoria:", category.name);
  if (requestedName === null) return;
  const name = requestedName.trim();
  if (name.length < 2) {
    alert("La subcategoria necesita un nombre.");
    return;
  }
  const exists = state.productCategories.some((item) => {
    return item.id !== categoryId && item.name.toLowerCase() === name.toLowerCase();
  });
  if (exists) {
    await showUxNotice({
      type: "warning",
      eyebrow: "Nombre no disponible",
      title: "Subcategoría duplicada",
      description: "Ya existe una subcategoría con ese nombre. Elige uno diferente para continuar.",
      acceptLabel: "Entendido"
    });
    return;
  }
  if (apiOnline) {
    try {
      await apiRequest(`/categories/${encodeURIComponent(categoryId)}`, { method: "PATCH", body: { name } });
      await syncAfterRemoteChange();
      renderSidebarProductCategories();
      renderProductCategories();
      renderProducts();
      return;
    } catch (error) {
      alert(error.message || "No se pudo modificar la subcategoria en el servidor.");
      return;
    }
  }
  category.name = name;
  commit();
  renderSidebarProductCategories();
  renderProductCategories();
  renderProducts();
}

async function deleteProductCategory(categoryId) {
  const category = state.productCategories.find((item) => item.id === categoryId);
  if (!category) return;
  const linkedProducts = state.products.filter((product) => product.categoryId === categoryId);
  if (linkedProducts.length) {
    alert("No se puede eliminar una subcategoria con productos cargados. Primero mueve o borra esos productos.");
    return;
  }

  if (!confirm(`Eliminar la subcategoria "${category.name}"?`)) {
    return;
  }

  if (apiOnline) {
    try {
      await apiRequest(`/categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
      await syncAfterRemoteChange();
      renderProductCategories();
      return;
    } catch (error) {
      alert(error.message || "No se pudo eliminar la subcategoria en el servidor.");
      return;
    }
  }

  state.productCategories = state.productCategories.filter((item) => item.id !== categoryId);
  if (selectedProductCategoryId === categoryId) {
    selectedProductCategoryId = "all";
  }
  commit();
  renderProductCategories();
}

function renderSales() {
  const sales = filterBySearch(state.sales, (sale) => {
    const client = findName(state.clients, sale.clientId);
    const product = state.products.find((item) => item.id === sale.productId);
    const productDescription = sale.productDescription || (product ? saleProductDescription(product) : "Producto eliminado");
    return [sale.date, client, productDescription, sale.quantity, sale.total];
  });
  const rows = sortedByDate(sales).slice(0, TABLE_ROW_LIMIT).map((sale) => {
    const client = findName(state.clients, sale.clientId);
    const product = state.products.find((item) => item.id === sale.productId);
    const productDescription = sale.productDescription || (product ? saleProductDescription(product) : "Producto eliminado");
    return `
      <tr${sale.annulledAt ? ` class="is-annulled" title="Anulada: ${escapeHtml(sale.annulReason || "Sin motivo")}"` : ""}>
        <td><strong class="table-id">${escapeHtml(sale.number || "-")}</strong></td>
        <td>${formatDate(sale.date)}</td>
        <td>${escapeHtml(client)}</td>
        <td>${escapeHtml(productDescription)}</td>
        <td>${sale.quantity}</td>
        <td class="money-cell">${money.format(saleNetTotal(sale))}${sale.returnedAmount ? `<br><small>Devuelto: ${money.format(sale.returnedAmount)}</small>` : ""}</td>
        <td>
          <button class="row-action" type="button" data-print-sale-order="${sale.id}">Imprimir</button>
          ${sale.annulledAt
            ? `<div class="annulment-report"><strong>Anulada</strong><span>Motivo: ${escapeHtml(sale.annulReason || "Sin motivo registrado")}</span></div>`
            : `<button class="row-action" type="button" data-return-sale="${sale.id}">Devolver</button> <button class="row-action" type="button" data-annul-sale="${sale.id}">Anular</button>`}
        </td>
      </tr>
    `;
  });

  setTable("salesTable", rows, 7, "No hay ventas registradas.");
  document.querySelectorAll("[data-print-sale-order]").forEach((button) => {
    button.addEventListener("click", () => {
      const sale = state.sales.find((item) => item.id === button.dataset.printSaleOrder);
      const order = state.orders.find((item) => item.id === sale?.orderId || item.receiptId === sale?.receiptId || item.number === sale?.orderNumber);
      if (!order) return alert("No encontramos la orden asociada a esta venta.");
      openFinalReceiptPdf(order.id);
    });
  });
  document.querySelectorAll("[data-return-sale]").forEach((button) => button.addEventListener("click", () => returnSaleItems(button.dataset.returnSale)));
  document.querySelectorAll("[data-annul-sale]").forEach((button) => button.addEventListener("click", async () => {
    const sale = state.sales.find((item) => item.id === button.dataset.annulSale);
    if (!sale || sale.annulledAt) return;
    const reason = await requestActionReason({
      title: `Anular ${sale.number || "venta"}`,
      description: "El producto volverá al stock. Indicá el motivo para dejar registro de la operación.",
      defaultValue: "Venta anulada",
      acceptLabel: "Anular venta"
    });
    if (reason === null) return;
    button.disabled = true;
    try {
      if (apiOnline) await apiRequest(`/sales/${encodeURIComponent(sale.id)}/annul`, { method: "POST", body: { productId: sale.productId, quantity: sale.quantity, reason } });
      else {
        const items = sale.items?.length ? sale.items : [{ productId: sale.productId, quantity: sale.quantity }];
        items.forEach((saleItem) => { const product = state.products.find((item) => item.id === saleItem.productId); if (product) product.stock = Number(product.stock || 0) + Number(saleItem.quantity || 0); });
      }
      sale.annulledAt = new Date().toISOString();
      sale.annulReason = reason || "Venta anulada";
      sale.returnedAmount = Number(sale.total || 0);
      state.expenses.filter((expense) => expense.saleId === sale.id).forEach((expense) => { expense.annulledAt = sale.annulledAt; expense.annulReason = sale.annulReason; });
      const order = state.orders.find((item) => item.id === sale.orderId || item.receiptId === sale.receiptId || item.saleId === sale.id);
      if (order) {
        order.budget = 0;
        order.paid = 0;
        order.paymentStatus = "Sin abonar";
        order.annulledAmount = Number(sale.total || 0);
      }
      commit();
      if (apiOnline) await syncAfterRemoteChange();
    } catch (error) {
      button.disabled = false;
      alert(error.message || "No se pudo anular la venta.");
    }
  }));
}

async function returnSaleItems(saleId) {
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale || sale.annulledAt) return;
  const sourceItems = sale.items?.length ? sale.items : [{ productId: sale.productId, productDescription: sale.productDescription, quantity: sale.quantity, unitPrice: Number(sale.total || 0) / Math.max(1, Number(sale.quantity || 1)), costTotal: sale.costTotal }];
  const items = [];
  for (const item of sourceItems) {
    const returned = (sale.returns || []).flatMap((entry) => entry.items || []).filter((entry) => entry.productId === item.productId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const available = Number(item.quantity || 0) - returned;
    if (available <= 0) continue;
    const answer = prompt(`Cantidad a devolver de ${item.productDescription}\nDisponible para devolución: ${available}`, "0");
    if (answer === null) return;
    const quantity = Number(answer || 0);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > available) return alert("La cantidad de devolución no es válida.");
    if (quantity > 0) items.push({ productId: item.productId, quantity, productDescription: item.productDescription, unitPrice: item.unitPrice, unitCost: Number(item.costTotal || 0) / Math.max(1, Number(item.quantity || 1)) });
  }
  if (!items.length) return;
  const reason = prompt("Motivo de la devolución:", "Devolución de cliente");
  if (reason === null || !confirm("Confirmar devolución y reingreso de los productos al stock?")) return;
  try {
    let returnRecord;
    if (apiOnline) {
      const payload = await apiRequest(`/sales/${encodeURIComponent(sale.id)}/return`, { method: "POST", body: { items, reason } });
      returnRecord = payload.return;
    } else {
      returnRecord = { id: uid("return-"), createdAt: new Date().toISOString(), reason, items: items.map((item) => ({ ...item, amount: item.unitPrice * item.quantity })) };
      items.forEach((item) => { const product = state.products.find((entry) => entry.id === item.productId); if (product) product.stock += item.quantity; });
    }
    sale.returns = [...(sale.returns || []), returnRecord];
    const returnedAmount = (returnRecord.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    sale.returnedAmount = Number(sale.returnedAmount || 0) + returnedAmount;
    items.forEach((item) => {
      const expense = state.expenses.find((entry) => entry.saleId === sale.id && entry.productId === item.productId && !entry.annulledAt);
      if (expense) { expense.originalAmount = Number(expense.originalAmount || expense.amount || 0); expense.returnedCost = Number(expense.returnedCost || 0) + item.unitCost * item.quantity; expense.amount = Math.max(0, expense.originalAmount - expense.returnedCost); }
    });
    const order = state.orders.find((entry) => entry.id === sale.orderId || entry.receiptId === sale.receiptId);
    if (order) { order.budget = saleNetTotal(sale); order.paid = saleNetTotal(sale); order.returns = sale.returns; }
    commit();
    if (apiOnline) await syncAfterRemoteChange();
  } catch (error) { alert(error.message || "No se pudo registrar la devolución."); }
}

function renderExpenses() {
  const expenses = filterBySearch(state.expenses.filter(isPurchaseRecord), (expense) => [
    expense.date,
    expense.productName || expense.concept,
    expense.supplier,
    expense.invoiceNumber,
    expense.quantity,
    expense.unitCost,
    expense.amount
  ]);
  const rows = [...expenses].sort((left, right) => expenseTimestamp(right) - expenseTimestamp(left)).slice(0, TABLE_ROW_LIMIT).map((expense) => {
    const timestamp = expenseTimestamp(expense);
    return `
    <tr${expense.annulledAt ? ` class="is-annulled" title="Anulada: ${escapeHtml(expense.annulReason || "Sin motivo")}"` : ""}>
      <td>${capitalizeText(timestamp.toLocaleDateString("es-UY", { weekday: "long" }))}</td>
      <td>${timestamp.toLocaleDateString("es-UY")}</td>
      <td>${timestamp.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}</td>
      <td>${escapeHtml(expense.productName || expense.concept)}</td>
      <td>${escapeHtml(expense.supplier || "-")}</td>
      <td>${escapeHtml(expense.invoiceNumber || "-")}</td>
      <td>${expense.quantity || "-"}</td>
      <td class="money-cell">${expense.unitCost != null ? money.format(expense.unitCost) : "-"}</td>
      <td class="money-cell">${money.format(expense.amount)}</td>
      <td>${expense.annulledAt ? `<span class="empty">Anulada</span>` : `<button class="row-action" data-annul-expense="${expense.id}">Anular</button>`}</td>
    </tr>
  `;
  });

  setTable("expensesTable", rows, 10, "No hay compras cargadas.");
  document.querySelectorAll("[data-annul-expense]").forEach((button) => button.addEventListener("click", async () => {
    const expense = state.expenses.find((item) => item.id === button.dataset.annulExpense);
    if (!expense || expense.annulledAt) return;
    const productLabel = expense.productName || expense.concept || "esta compra";
    const quantityLabel = Number(expense.quantity || 0) > 0 ? ` Se retirarán ${Number(expense.quantity)} unidad${Number(expense.quantity) === 1 ? "" : "es"} del stock.` : " El stock será actualizado.";
    const reason = await requestActionReason({
      title: `Anular ${expense.invoiceNumber || "compra"}`,
      description: `${productLabel}.${quantityLabel} Indicá el motivo para dejar un registro de la operación.`,
      defaultValue: "Compra anulada",
      acceptLabel: "Anular compra"
    });
    if (reason === null) return;
    button.disabled = true;
    try {
      if (apiOnline) await apiRequest(`/purchases/${encodeURIComponent(expense.id)}/annul`, { method: "POST", body: { productId: expense.productId, quantity: expense.quantity, reason } });
      else {
        const product = state.products.find((item) => item.id === expense.productId);
        if (!product || Number(product.stock || 0) < Number(expense.quantity || 0)) throw new Error("El stock actual es menor que la compra que deseas anular.");
        product.stock -= Number(expense.quantity || 0);
      }
      expense.annulledAt = new Date().toISOString();
      expense.annulReason = reason || "Compra anulada";
      state.expenses.filter((item) => item.purchaseId === expense.id).forEach((item) => { item.annulledAt = expense.annulledAt; item.annulReason = expense.annulReason; });
      commit();
      if (apiOnline) await syncAfterRemoteChange();
    } catch (error) {
      button.disabled = false;
      alert(error.message || "No se pudo anular la compra.");
    }
  }));
}

function requestActionReason({ title, description, defaultValue = "", acceptLabel = "Confirmar" } = {}) {
  const backdrop = document.querySelector("#actionReasonDialog");
  const input = document.querySelector("#actionReasonInput");
  const error = document.querySelector("#actionReasonError");
  const accept = document.querySelector("#actionReasonAccept");
  const cancel = document.querySelector("#actionReasonCancel");
  if (!backdrop || !input || !accept || !cancel) return Promise.resolve(null);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.querySelector("#actionReasonTitle").textContent = title || "Confirmar acción";
  document.querySelector("#actionReasonDescription").textContent = description || "Indicá el motivo para continuar.";
  accept.textContent = acceptLabel;
  input.value = defaultValue;
  error.textContent = "";
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    input.focus();
    input.select();
  }, 0);

  return new Promise((resolve) => {
    const finish = (value) => {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      accept.removeEventListener("click", submit);
      cancel.removeEventListener("click", dismiss);
      backdrop.removeEventListener("click", clickOutside);
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus?.();
      resolve(value);
    };
    const submit = () => {
      const value = input.value.trim();
      if (!value) {
        error.textContent = "Escribí un motivo para poder continuar.";
        input.focus();
        return;
      }
      finish(value);
    };
    const dismiss = () => finish(null);
    const clickOutside = (event) => {
      if (event.target === backdrop) dismiss();
    };
    const keydown = (event) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submit();
    };
    accept.addEventListener("click", submit);
    cancel.addEventListener("click", dismiss);
    backdrop.addEventListener("click", clickOutside);
    document.addEventListener("keydown", keydown);
  });
}

let professionalAlertQueue = Promise.resolve();

function installProfessionalAlerts() {
  window.alert = (message) => {
    const description = String(message || "Revisa la información para continuar.");
    const success = /correctamente|completad[ao]|guardad[ao]|añadid[ao]|actualizad[ao]|realizad[ao]/i.test(description);
    professionalAlertQueue = professionalAlertQueue.then(() => showUxNotice({
      type: success ? "success" : "warning",
      eyebrow: success ? "Operación completada" : "Revisa la información",
      title: success ? "Todo listo" : "Necesitamos un dato más",
      description,
      acceptLabel: "Entendido"
    }));
  };
}

function showUxNotice({ type = "success", eyebrow = "Operación completada", title = "Todo listo", description = "La operación se realizó correctamente.", acceptLabel = "Entendido" } = {}) {
  const backdrop = document.querySelector("#uxNoticeDialog");
  const accept = document.querySelector("#uxNoticeAccept");
  const icon = document.querySelector("#uxNoticeDialog .ux-notice-icon");
  if (!backdrop || !accept) return Promise.resolve();

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.querySelector("#uxNoticeEyebrow").textContent = eyebrow;
  document.querySelector("#uxNoticeTitle").textContent = title;
  document.querySelector("#uxNoticeDescription").textContent = description;
  backdrop.dataset.noticeType = type;
  if (icon) icon.textContent = type === "warning" ? "!" : "✓";
  accept.textContent = acceptLabel;
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  window.setTimeout(() => accept.focus(), 0);

  return new Promise((resolve) => {
    const finish = () => {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      accept.removeEventListener("click", finish);
      backdrop.removeEventListener("click", clickOutside);
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus?.();
      resolve();
    };
    const clickOutside = (event) => { if (event.target === backdrop) finish(); };
    const keydown = (event) => {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        finish();
      }
    };
    accept.addEventListener("click", finish);
    backdrop.addEventListener("click", clickOutside);
    document.addEventListener("keydown", keydown);
  });
}

function requestTextInput({ eyebrow = "Nuevo registro", title = "Ingresar nombre", description = "Escribí un nombre para continuar.", label = "Nombre", placeholder = "", acceptLabel = "Crear", maxLength = 60, validate = null } = {}) {
  const backdrop = document.getElementById("textInputDialog");
  const input = document.getElementById("textInputValue");
  const error = document.getElementById("textInputError");
  const accept = document.getElementById("textInputAccept");
  const cancel = document.getElementById("textInputCancel");
  if (!backdrop || !input || !error || !accept || !cancel) return Promise.resolve(null);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.getElementById("textInputEyebrow").textContent = eyebrow;
  document.getElementById("textInputTitle").textContent = title;
  document.getElementById("textInputDescription").textContent = description;
  document.getElementById("textInputLabel").textContent = label;
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.value = "";
  error.textContent = "";
  accept.textContent = acceptLabel;
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  window.setTimeout(() => input.focus(), 0);
  return new Promise((resolve) => {
    const finish = (value) => {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      accept.removeEventListener("click", submit);
      cancel.removeEventListener("click", dismiss);
      backdrop.removeEventListener("click", clickOutside);
      input.removeEventListener("input", clearError);
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus?.();
      resolve(value);
    };
    const submit = () => {
      const value = input.value.trim();
      const message = value.length < 2 ? "Escribí al menos 2 caracteres." : (typeof validate === "function" ? validate(value) : "");
      if (message) {
        error.textContent = message;
        input.focus();
        input.select();
        return;
      }
      finish(value);
    };
    const dismiss = () => finish(null);
    const clickOutside = (event) => { if (event.target === backdrop) dismiss(); };
    const clearError = () => { error.textContent = ""; };
    const keydown = (event) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "Enter") { event.preventDefault(); submit(); }
    };
    accept.addEventListener("click", submit);
    cancel.addEventListener("click", dismiss);
    backdrop.addEventListener("click", clickOutside);
    input.addEventListener("input", clearError);
    document.addEventListener("keydown", keydown);
  });
}

function requestConfirmation({ eyebrow = "Confirmar acción", title = "¿Deseás continuar?", description = "Revisá la información antes de confirmar.", summary = "", acceptLabel = "Confirmar" } = {}) {
  const backdrop = document.querySelector("#confirmActionDialog");
  const accept = document.querySelector("#confirmActionAccept");
  const cancel = document.querySelector("#confirmActionCancel");
  const summaryElement = document.querySelector("#confirmActionSummary");
  if (!backdrop || !accept || !cancel || !summaryElement) return Promise.resolve(false);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.querySelector("#confirmActionEyebrow").textContent = eyebrow;
  document.querySelector("#confirmActionTitle").textContent = title;
  document.querySelector("#confirmActionDescription").textContent = description;
  summaryElement.textContent = summary;
  summaryElement.hidden = !summary;
  accept.textContent = acceptLabel;
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  window.setTimeout(() => cancel.focus(), 0);

  return new Promise((resolve) => {
    const finish = (confirmed) => {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      accept.removeEventListener("click", confirmAction);
      cancel.removeEventListener("click", dismiss);
      backdrop.removeEventListener("click", clickOutside);
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus?.();
      resolve(confirmed);
    };
    const confirmAction = () => finish(true);
    const dismiss = () => finish(false);
    const clickOutside = (event) => { if (event.target === backdrop) dismiss(); };
    const keydown = (event) => {
      if (event.key === "Escape") dismiss();
    };
    accept.addEventListener("click", confirmAction);
    cancel.addEventListener("click", dismiss);
    backdrop.addEventListener("click", clickOutside);
    document.addEventListener("keydown", keydown);
  });
}

function isPurchaseRecord(expense) {
  return Boolean(expense?.productId && Number(expense.quantity || 0) > 0);
}

function isInventoryPurchaseRecord(expense) {
  return isPurchaseRecord(expense) && !expense?.saleId && !expense?.stockCostOrderKey;
}

function expenseTimestamp(expense) {
  const timestamp = new Date(expense.createdAt || `${expense.date || today()}T00:00:00`);
  return Number.isNaN(timestamp.getTime()) ? new Date(0) : timestamp;
}

function capitalizeText(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "-";
}

function renderServices() {
  const services = filterBySearch(state.services || [], (service) => [
    service.category,
    service.name,
    service.brand,
    service.model,
    service.costPrice,
    service.salePrice,
    service.active ? "Activo" : "Inactivo"
  ]).sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return String(left.category || "").localeCompare(String(right.category || ""), "es", { numeric: true })
      || String(left.name || "").localeCompare(String(right.name || ""), "es", { numeric: true });
  });

  const rows = services.map((service) => {
    const selection = resolveStoredServiceProduct(service);
    const costPrice = selection?.selectedProduct ? selectedServiceCost(selection) : Number(service.costPrice || 0);
    const profit = Number(service.salePrice || 0) - costPrice;
    return `
      <tr class="${service.active ? "" : "inactive-row"}">
        <td><strong class="service-category">${escapeHtml(service.category || "General")}</strong></td>
        <td><strong>${escapeHtml(service.name)}</strong></td>
        <td>${escapeHtml(service.brand || selection?.selectedProduct?.brand || "-")}</td>
        <td>${escapeHtml(service.model || selection?.selectedProduct?.model || "-")}</td>
        <td><div class="service-stock-indicators">${serviceStockAvailabilityMarkup(selection)}</div></td>
        <td class="money-cell">${money.format(costPrice)}</td>
        <td class="money-cell">${money.format(service.salePrice || 0)}</td>
        <td class="money-cell service-profit">${money.format(profit)}</td>
        <td><span class="service-status ${service.active ? "active" : "inactive"}">${service.active ? "Activo" : "Inactivo"}</span></td>
        <td>
          <div class="table-actions">
            <button class="row-action" type="button" data-edit-service="${escapeHtml(service.id)}">Editar</button>
            <button class="row-action" type="button" data-toggle-service="${escapeHtml(service.id)}">${service.active ? "Desactivar" : "Activar"}</button>
            <button class="row-action danger" type="button" data-delete-service="${escapeHtml(service.id)}">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  });

  setTable("servicesTable", rows, 10, "No hay servicios cargados.");
  document.querySelectorAll("[data-edit-service]").forEach((button) => {
    button.addEventListener("click", () => editService(button.dataset.editService));
  });
  document.querySelectorAll("[data-toggle-service]").forEach((button) => {
    button.addEventListener("click", () => toggleService(button.dataset.toggleService));
  });
  document.querySelectorAll("[data-delete-service]").forEach((button) => {
    button.addEventListener("click", () => deleteService(button.dataset.deleteService));
  });
}

function editService(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  const form = document.getElementById("serviceForm");
  if (!service || !form) return;
  form.elements.id.value = service.id;
  form.elements.category.value = service.category || "";
  const storedSelection = resolveStoredServiceProduct(service);
  form.elements.brand.value = service.brand || storedSelection?.selectedProduct?.brand || "";
  renderServiceModelOptions();
  form.elements.model.value = service.model || storedSelection?.selectedProduct?.model || "";
  form.elements.salePrice.value = service.salePrice || 0;
  updateServiceCostPreview();
  if (!storedSelection?.selectedProduct) {
    form.elements.manualCostPrice.value = service.costPrice || "";
  }
  document.getElementById("serviceSubmitButton").textContent = "Guardar cambios";
  showView("services");
  form.elements.category.focus();
}

function resetServiceForm() {
  const form = document.getElementById("serviceForm");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  updateServiceCostPreview();
  document.getElementById("serviceSubmitButton").textContent = "Agregar servicio";
}

async function toggleService(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  const selection = resolveStoredServiceProduct(service);
  const updated = {
    ...service,
    costPrice: selection?.selectedProduct ? selectedServiceCost(selection) : Number(service.costPrice || 0),
    productName: selection?.selectedProduct?.name || service.productName || "",
    active: !service.active
  };
  if (apiOnline) {
    try {
      await apiRequest(`/services/${encodeURIComponent(service.id)}`, { method: "PUT", body: updated });
      await syncAfterRemoteChange();
      return;
    } catch (error) {
      alert(error.message || "No se pudo cambiar el estado del servicio.");
      return;
    }
  }
  Object.assign(service, updated);
  commit();
}

async function deleteService(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  const confirmed = await requestConfirmation({
    eyebrow: "Acción irreversible",
    title: "¿Eliminar este servicio?",
    description: "Se quitará del catálogo de trabajo y no podrás recuperarlo desde el sistema.",
    summary: service.name,
    acceptLabel: "Eliminar servicio"
  });
  if (!confirmed) return;
  if (apiOnline) {
    try {
      await apiRequest(`/services/${encodeURIComponent(service.id)}`, { method: "DELETE" });
      resetServiceForm();
      await syncAfterRemoteChange();
      return;
    } catch (error) {
      alert(error.message || "No se pudo eliminar el servicio.");
      return;
    }
  }
  state.services = state.services.filter((item) => item.id !== serviceId);
  resetServiceForm();
  commit();
}

function serviceProductKey(product) {
  const identity = [product.brand, product.model]
    .filter(Boolean)
    .join(" ") || product.name || product.id;
  return String(identity)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizedServiceText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveServiceProductSelection(category, brand, model) {
  const normalizedBrand = normalizedServiceText(brand);
  const normalizedModel = normalizedServiceText(model);
  const comparableModel = normalizedModel.replace(/\bpromo\b/g, "").replace(/\s+/g, " ").trim();
  const products = (state.products || []).filter((product) => {
    const productModel = normalizedServiceText(product.model);
    return normalizedServiceText(product.brand) === normalizedBrand
      && (productModel === normalizedModel || productModel === comparableModel)
      && serviceCategoryMatchesProduct(category, product);
  });
  if (!products.length) return null;

  const ranked = [...products].sort((left, right) => {
    const rank = (product) => {
      const inStock = Number(product.stock || 0) > 0;
      if (isWorkshopProduct(product) && inStock) return 0;
      if (!isWorkshopProduct(product) && inStock) return 1;
      if (isWorkshopProduct(product)) return 2;
      return 3;
    };
    return rank(left) - rank(right) || Number(right.stock || 0) - Number(left.stock || 0);
  });
  const workshopProducts = products.filter((product) => isWorkshopProduct(product));
  const webProducts = products.filter((product) => !isWorkshopProduct(product));
  return {
    products,
    selectedProduct: ranked[0],
    workshopStock: workshopProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0),
    webStock: webProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0),
    hasWorkshop: workshopProducts.length > 0,
    hasWeb: webProducts.length > 0
  };
}

function resolveStoredServiceProduct(service) {
  if (service.brand && service.model) {
    return resolveServiceProductSelection(service.category, service.brand, service.model);
  }
  const legacyProduct = (state.products || []).find((product) => serviceProductKey(product) === service.productKey);
  return legacyProduct ? resolveServiceProductSelection(service.category, legacyProduct.brand, legacyProduct.model) : null;
}

function serviceCategoryMatchesProduct(serviceCategory, product) {
  const category = [
    ...(state.productCategories || []),
    ...(state.webProductCategories || [])
  ].find((item) => item.id === product.categoryId);
  if (!category) return false;
  const serviceTokens = meaningfulCategoryTokens(serviceCategory);
  const productTokens = meaningfulCategoryTokens(category.name);
  return serviceTokens.some((token) => productTokens.includes(token));
}

function meaningfulCategoryTokens(value) {
  const ignored = new Set(["de", "del", "la", "el", "para", "y"]);
  return normalizedServiceText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !ignored.has(token))
    .map((token) => {
      if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
      if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
      return token;
    });
}

function updateServiceCostPreview() {
  const form = document.getElementById("serviceForm");
  if (!form) return;
  const selection = resolveServiceProductSelection(form.elements.category.value, form.elements.brand.value, form.elements.model.value);
  const preview = document.getElementById("serviceCostPreview");
  if (preview) preview.textContent = money.format(selectedServiceCost(selection));
  const previewBox = document.querySelector("#serviceForm .service-cost-preview");
  const manualCost = form.elements.manualCostPrice;
  const hasCompleteSelection = Boolean(form.elements.category.value && form.elements.brand.value && form.elements.model.value);
  const needsManualCost = hasCompleteSelection && !selection?.selectedProduct;
  if (previewBox) previewBox.hidden = needsManualCost;
  manualCost.hidden = !needsManualCost;
  manualCost.required = needsManualCost;
  const stockPreview = document.getElementById("serviceStockPreview");
  if (stockPreview) {
    stockPreview.innerHTML = selection
      ? serviceStockAvailabilityMarkup(selection)
      : "Selecciona marca y modelo";
  }
}

function selectedServiceCost(selection) {
  const product = selection?.selectedProduct;
  if (!product) return 0;
  return isWorkshopProduct(product)
    ? Number(product.costPrice || 0)
    : Number(product.salePrice || product.price || 0);
}

function serviceStockAvailabilityMarkup(selection) {
  if (!selection) return `<span class="service-stock-badge out">Costo manual: sin categoria de producto</span>`;
  const badges = [];
  if (selection.hasWorkshop) {
    badges.push(`<span class="service-stock-badge workshop ${selection.workshopStock > 0 ? "available" : "out"}">Taller: ${selection.workshopStock > 0 ? `${selection.workshopStock} en stock` : "Sin stock"}</span>`);
  }
  if (selection.hasWeb) {
    badges.push(`<span class="service-stock-badge web ${selection.webStock > 0 ? "available" : "out"}">Web: ${selection.webStock > 0 ? `${selection.webStock} en stock` : "Agotado"}</span>`);
  }
  return badges.join("") || `<span class="service-stock-badge out">Sin stock</span>`;
}

function renderServiceCategoryOptions() {
  const form = document.getElementById("serviceForm");
  if (!form) return;
  const select = form.elements.category;
  const selected = select.value;
  const categories = state.serviceCategories || [];
  select.innerHTML = `<option value="">Categoria</option>` + categories.map((category) => {
    return `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`;
  }).join("");
  if (categories.some((category) => category.name === selected)) select.value = selected;
}

function renderServiceBrandOptions() {
  const form = document.getElementById("serviceForm");
  if (!form) return;
  renderPhoneBrandOptions();
}

function renderServiceModelOptions() {
  const form = document.getElementById("serviceForm");
  if (!form) return;
  const input = form.elements.model;
  const brand = normalizedServiceText(form.elements.brand.value);
  const models = [...new Set(phoneModelsForBrand(form.elements.brand.value))]
    .sort((left, right) => left.localeCompare(right, "es", { numeric: true }));
  document.getElementById("serviceModelOptions").innerHTML = models
    .map((model) => `<option value="${escapeHtml(model)}"></option>`)
    .join("");
  input.placeholder = models.length ? "Seleccionar o escribir modelo" : "Escribir modelo";
  updateServiceCostPreview();
}

async function addServiceCategory() {
  const name = await requestTextInput({
    eyebrow: "Catálogo de servicios",
    title: "Nueva categoría de servicio",
    description: "Creá una categoría clara para mantener el catálogo ordenado y agilizar la carga de trabajos.",
    label: "Nombre de la categoría",
    placeholder: "Ej.: Reparación de pantallas",
    acceptLabel: "Crear categoría",
    validate: (value) => (state.serviceCategories || []).some((category) => normalizedServiceText(category.name) === normalizedServiceText(value)) ? "Ya existe una categoría con ese nombre." : ""
  });
  if (!name) return;
  if (apiOnline) {
    try {
      await apiRequest("/service-categories", { method: "POST", body: { name } });
      await syncAfterRemoteChange();
      document.getElementById("serviceForm").elements.category.value = name;
      updateServiceCostPreview();
      return;
    } catch (error) {
      alert(error.message || "No se pudo agregar la categoria.");
      return;
    }
  }
  if (!(state.serviceCategories || []).some((category) => normalizedServiceText(category.name) === normalizedServiceText(name))) {
    state.serviceCategories.push({ id: uid("service-category-"), name });
    commit();
  }
  document.getElementById("serviceForm").elements.category.value = name;
  updateServiceCostPreview();
}

async function removeServiceCategory() {
  const form = document.getElementById("serviceForm");
  const category = (state.serviceCategories || []).find((item) => item.name === form.elements.category.value);
  if (!category) return;
  if (!confirm(`Quitar la categoria ${category.name}? Los servicios ya guardados conservaran su categoria.`)) return;
  if (apiOnline) {
    try {
      await apiRequest(`/service-categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
      await syncAfterRemoteChange();
      return;
    } catch (error) {
      alert(error.message || "No se pudo quitar la categoria.");
      return;
    }
  }
  state.serviceCategories = state.serviceCategories.filter((item) => item.id !== category.id);
  commit();
}

function renderOptions() {
  const saleForm = document.getElementById("saleForm");
  const productForm = document.getElementById("productForm");
  const expenseForm = document.getElementById("expenseForm");
  productForm.elements.categoryId.innerHTML = optionList(sortedStockCategories(), "Seleccionar subcategoria");
  const selectedSaleClient = saleForm.elements.clientId.value;
  saleForm.elements.clientId.innerHTML = optionList(state.clients, "Seleccionar cliente");
  const defaultClient = state.clients.find((client) => normalizedMenuLabel(client.name) === "default");
  if (state.clients.some((client) => client.id === selectedSaleClient)) saleForm.elements.clientId.value = selectedSaleClient;
  else if (defaultClient) saleForm.elements.clientId.value = defaultClient.id;
  if (defaultClient) saleForm.elements.clientId.querySelector(`option[value="${CSS.escape(defaultClient.id)}"]`).defaultSelected = true;
  const validCategoryIds = new Set([
    ...state.productCategories.map((item) => item.id),
    ...(state.webProductCategories || []).map((item) => item.id)
  ]);
  const availableProducts = state.products.filter((item) => validCategoryIds.has(item.categoryId) && isWorkshopProduct(item));
  document.getElementById("saleProductOptions").innerHTML = availableProducts
    .map((item) => `<option value="${escapeHtml(saleProductSearchLabel(item))}"></option>`)
    .concat((state.services || []).filter((service) => service.active !== false).map((service) => `<option value="${escapeHtml(serviceSaleSearchLabel(service))}"></option>`))
    .join("");
  const transferForm = document.getElementById("webStockTransferForm");
  if (transferForm) {
    const webProducts = state.products.filter((item) => !isWorkshopProduct(item) && Number(item.stock || 0) > 0);
    const selectedSource = transferForm.elements.sourceProductId.value;
    const selectedCategory = transferForm.elements.categoryId.value;
    transferForm.elements.sourceProductId.innerHTML = optionList(webProducts, "Seleccionar producto web", (item) => `${item.name} | Stock ${item.stock} | ${money.format(item.salePrice || item.price || 0)}`);
    transferForm.elements.categoryId.innerHTML = optionList(sortedStockCategories(), "Seleccionar subcategoria");
    if (webProducts.some((item) => item.id === selectedSource)) transferForm.elements.sourceProductId.value = selectedSource;
    if (sortedStockCategories().some((item) => item.id === selectedCategory)) transferForm.elements.categoryId.value = selectedCategory;
  }
  const selectedPurchaseProduct = expenseForm.elements.productId.value;
  expenseForm.elements.productId.innerHTML = optionList(workshopProducts(), "Crear producto nuevo", (item) => {
    return `${item.name} - Stock actual ${item.stock}`;
  });
  expenseForm.elements.categoryId.innerHTML = optionList(sortedStockCategories(), "Seleccionar categoría");
  if (state.products.some((item) => item.id === selectedPurchaseProduct)) expenseForm.elements.productId.value = selectedPurchaseProduct;
  renderServiceCategoryOptions();
  renderServiceBrandOptions();
  renderServiceModelOptions();
}

function clearProductForm(form = document.getElementById("productForm")) {
  if (!form) return;
  form.reset();
  ["categoryId", "brand", "model", "color", "costPrice", "salePrice", "stock", "minStock", "supplierName"].forEach((name) => {
    if (form.elements[name]) form.elements[name].value = "";
  });
  form.elements.categoryId?.focus();
}

function clearSaleForm(form = document.getElementById("saleForm")) {
  if (!form) return;
  form.reset();
  form.elements.productSearch.value = "";
  form.elements.quantity.value = "";
  const defaultClient = state.clients.find((client) => normalizedMenuLabel(client.name) === "default");
  form.elements.clientId.value = defaultClient?.id || "";
  form.elements.productSearch.focus();
}

function resolveSaleProduct(value) {
  const searched = normalizedMenuLabel(value);
  return state.products.find((item) => normalizedMenuLabel(saleProductSearchLabel(item)) === searched)
    || state.products.find((item) => normalizedMenuLabel(saleProductDescription(item)) === searched);
}

function serviceSaleSearchLabel(service) {
  return `Servicio | ${service.name} | ${service.brand} ${service.model} | ${money.format(service.salePrice || 0)}`;
}

function resolveSaleService(value) {
  const searched = normalizedMenuLabel(value);
  return (state.services || []).find((service) => service.active !== false && normalizedMenuLabel(serviceSaleSearchLabel(service)) === searched);
}

function addCurrentProductToSale() {
  const form = document.getElementById("saleForm");
  const service = resolveSaleService(form.elements.productSearch.value);
  const selection = service ? resolveStoredServiceProduct(service) : null;
  const product = service
    ? selection?.products?.find((item) => isWorkshopProduct(item) && Number(item.stock || 0) > 0)
    : resolveSaleProduct(form.elements.productSearch.value);
  const quantity = Number(form.elements.quantity.value || 0);
  if (!product || !Number.isInteger(quantity) || quantity <= 0) {
    alert(service ? "Este servicio no tiene un repuesto disponible en el stock del taller." : "Selecciona un producto de los resultados y escribe una cantidad válida.");
    return false;
  }
  const cartKey = `${product.id}:${service?.id || ""}`;
  const existing = saleCart.find((item) => `${item.productId}:${item.serviceId || ""}` === cartKey);
  const nextQuantity = quantity + Number(existing?.quantity || 0);
  if (nextQuantity > Number(product.stock || 0)) {
    alert(`No hay stock suficiente. Disponible: ${product.stock}.`);
    return false;
  }
  const unitPrice = Number(service?.salePrice || product.salePrice || product.price || 0);
  const item = existing || { productId: product.id, serviceId: service?.id || "", itemType: service ? "service" : "product", productDescription: service?.name || saleProductDescription(product), quantity: 0, unitPrice, total: 0, costTotal: 0 };
  item.quantity = nextQuantity;
  item.total = unitPrice * nextQuantity;
  item.costTotal = Number(product.costPrice || 0) * nextQuantity;
  if (!existing) saleCart.push(item);
  form.elements.productSearch.value = "";
  form.elements.quantity.value = "";
  renderSaleCart();
  form.elements.productSearch.focus();
  return true;
}

function renderSaleCart() {
  const container = document.getElementById("saleCart");
  if (!container) return;
  if (!saleCart.length) {
    container.innerHTML = `<p class="empty">Añade uno o varios productos antes de registrar la venta.</p>`;
    return;
  }
  const total = saleCart.reduce((sum, item) => sum + item.total, 0);
  container.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody>
    ${saleCart.map((item) => `<tr><td>${escapeHtml(item.productDescription)}</td><td>${item.quantity}</td><td>${money.format(item.unitPrice)}</td><td class="money-cell">${money.format(item.total)}</td><td><button class="row-action" type="button" data-remove-sale-item="${item.productId}:${item.serviceId || ""}">Quitar</button></td></tr>`).join("")}
    <tr><td colspan="3"><strong>Total de la venta</strong></td><td class="money-cell"><strong>${money.format(total)}</strong></td><td></td></tr>
  </tbody></table></div>`;
}

function renderDashboardLists() {
  const dashboardOrders = filterBySearch(state.orders, (order) => [
    order.number,
    order.clientName,
    order.clientDocument,
    order.device,
    order.status
  ]);
  const recentOrderRows = sortedByDate(dashboardOrders).slice(0, 6).map((order) => `
      <tr class="openable-row" data-order-id="${order.id}">
        <td><strong class="table-id">${escapeHtml(order.number)}</strong></td>
        <td><strong>${escapeHtml(order.clientName || findName(state.clients, order.clientId))}</strong></td>
        <td>${escapeHtml(order.device)}</td>
        <td>${statusBadge(order.status)} <button class="row-action" type="button" data-open-dashboard-order="${order.id}">Abrir</button></td>
      </tr>
  `);
  setTable("recentOrders", recentOrderRows, 4, "Sin ordenes recientes.");
  document.querySelectorAll("#recentOrders .openable-row").forEach((row) => {
    row.addEventListener("dblclick", () => openOrderDetail(row.dataset.orderId));
  });
  document.querySelectorAll("[data-open-dashboard-order]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); openOrderDetail(button.dataset.openDashboardOrder); }));

  const lowStock = filterBySearch(lowStockProducts(), (item) => [
    item.name,
    item.brand,
    item.model,
    item.color,
    item.costPrice,
    item.salePrice || item.price,
    item.stock,
    productOrigin(item)
  ]);
  document.getElementById("lowStock").innerHTML = lowStock.length
    ? lowStock.map((item) => `
      <div class="stock-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>Stock minimo: ${lowStockLimit(item)} unidades</small>
        </div>
        <div class="stock-item-status">
          <span class="stock-origin ${isWorkshopProduct(item) ? "workshop" : "web"}">${productOrigin(item)}</span>
          <span class="badge">${item.stock} unidades</span>
        </div>
      </div>
    `).join("")
    : `<p class="empty">No hay productos con stock bajo.</p>`;
}

function optionList(items, placeholder, label = (item) => item.name) {
  return `<option value="">${placeholder}</option>` + items.map((item) => {
    return `<option value="${item.id}">${escapeHtml(label(item))}</option>`;
  }).join("");
}

function filterBySearch(items, fields) {
  if (!globalSearchTerm) {
    return items;
  }

  return items.filter((item) => fields(item).some((value) => {
    return String(value ?? "").toLowerCase().includes(globalSearchTerm);
  }));
}

function setTable(id, rows, columns, emptyText) {
  document.getElementById(id).innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="${columns}" class="empty">${emptyText}</td></tr>`;
}

function bindDelete(selector, remove) {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Object.values(button.dataset)[0];
      try {
        const shouldCommit = await remove(id);
        if (shouldCommit !== false) {
          commit();
        }
      } catch (error) {
        alert(error.message || "No se pudo borrar el registro.");
      }
    });
  });
}

function sortedByDate(items) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

function findName(items, id) {
  return items.find((item) => item.id === id)?.name || "Eliminado";
}

function findDocument(items, id) {
  return items.find((item) => item.id === id)?.document || "-";
}

function findCategoryName(id) {
  return [...state.productCategories, ...(state.webProductCategories || [])].find((category) => category.id === id)?.name || "General";
}

function saleProductDescription(product) {
  const category = findCategoryName(product.categoryId);
  return [category.toLowerCase() === "general" ? "" : category, product.brand, product.model].filter(Boolean).join(" ");
}

function saleProductSearchLabel(product) {
  return `${saleProductDescription(product)} - ${productOrigin(product)} - ${money.format(product.salePrice || product.price)} - Stock ${product.stock}`;
}

function buildProductName(brand, model, color) {
  return [brand, model, color && color !== "-" ? color : ""].filter(Boolean).join(" ");
}

function nextOrderNumber() {
  const max = state.orders.reduce((highest, order) => {
    const number = Number(String(order.number || "").replace(/\D/g, ""));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return `OT-${String(max + 1).padStart(4, "0")}`;
}

function statusBadge(status) {
  const className = `status order-status ${statusClass(status)}`;
  return `<span class="${className}">${escapeHtml(status)}</span>`;
}

function statusSelect(order) {
  const status = order.repairStatus || order.status || "En diagnostico";
  if (status === "Cancelado") return statusBadge(status);
  const className = `status-select order-status ${statusClass(status)}`;
  return `
    <select class="${className}" data-order-status="${order.id}" aria-label="Cambiar estado de ${escapeHtml(order.number)}">
      ${quickRepairStatuses.map((item) => {
        const selected = item === status ? " selected" : "";
        return `<option value="${escapeHtml(item)}"${selected}>${escapeHtml(item)}</option>`;
      }).join("")}
    </select>
  `;
}

function statusClass(status) {
  const statusClasses = {
    "En diagnostico": "diagnosis",
    Presupuestado: "budget",
    "Esperando aprobacion": "waiting-approval",
    Aprobado: "approved",
    "En reparacion": "process",
    "Listo para retirar": "process",
    "Esperando repuesto": "waiting-parts",
    Finalizado: "finished",
    Entregado: "finished",
    Cancelado: "finished"
  };
  return statusClasses[status] || "open";
}

function paymentStatusSelect(order) {
  const status = normalizePaymentStatus(order.paymentStatus);
  const className = `status-select payment-status ${paymentStatusClass(status)}`;
  return `<select class="${className}" data-payment-status="${order.id}" aria-label="Cambiar estado de pago de ${escapeHtml(order.number)}">
      ${paymentStatuses.map((item) => {
        const selected = item === status ? " selected" : "";
        return `<option value="${escapeHtml(item)}"${selected}>${escapeHtml(item)}</option>`;
      }).join("")}
    </select>`;
}

function normalizePaymentStatus(status) {
  const value = String(status || "").trim();
  if (value === "Pagado") return "Pagado";
  if (value === "Seña" || value === "Sena" || value === "Parcial") return "Seña";
  return "Sin abonar";
}

function paymentStatusClass(status) {
  const classes = {
    "Sin abonar": "unpaid",
    "Seña": "deposit",
    Pagado: "paid"
  };
  return classes[status] || "unpaid";
}

function reportEntryTimestamp(value) {
  if (!value) return 0;
  const raw = String(value);
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatReportEntryDateTime(value) {
  if (!value) return "-";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDate(raw);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? formatDate(recordLocalDay(raw)) : parsed.toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
