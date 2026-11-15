const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, process.env.PANEL_DATA_DIR || "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_PLANS = [
  {
    id: "basico",
    name: "Básico",
    description: "Para instituciones pequeñas que están comenzando.",
    price: 19,
    currency: "USD",
    databaseVolumeSize: 10,
    instanceType: "t2.micro",
    azureInstanceType: "Standard_F1as_v7",
    maxStudents: 100,
    backupPolicy: "Semanal",
    retentionDays: 7,
    support: "Comunidad",
    accent: "mint",
    features: ["10 GB de disco para la base de datos", "Instancias t2.micro (1 GB de RAM)", "Monitoreo básico"]
  },
  {
    id: "estandar",
    name: "Estándar",
    description: "Equilibrio para instituciones en crecimiento.",
    price: 49,
    currency: "USD",
    databaseVolumeSize: 20,
    instanceType: "t2.small",
    azureInstanceType: "Standard_D2as_v7",
    maxStudents: 1000,
    backupPolicy: "Diario",
    retentionDays: 14,
    support: "Prioritario",
    accent: "violet",
    features: ["20 GB de disco para la base de datos", "Instancias t2.small (2 GB de RAM)", "Métricas ampliadas"]
  },
  {
    id: "avanzado",
    name: "Avanzado",
    description: "Más capacidad y retención para operación intensiva.",
    price: 99,
    currency: "USD",
    databaseVolumeSize: 50,
    instanceType: "t3.medium",
    azureInstanceType: "Standard_D2ads_v7",
    maxStudents: 5000,
    backupPolicy: "Diario + retención",
    retentionDays: 30,
    support: "Dedicado",
    accent: "amber",
    features: ["50 GB de base de datos", "Hasta 5,000 estudiantes", "Respaldo diario por 30 días", "Alertas operativas"]
  }
];

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    writeStore({
      version: 1,
      admin: null,
      plans: DEFAULT_PLANS,
      tenants: [],
      jobs: [],
      audit: [],
      metrics: {
        prometheusUrl: process.env.PANEL_PROMETHEUS_URL || "http://localhost:9090",
        grafanaUrl: process.env.PANEL_GRAFANA_URL || "http://localhost:3000",
        lastSyncAt: null,
        monitoredTenants: 0
      }
    });
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STORE_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporary, STORE_FILE);
}

function updateStore(mutator) {
  const store = readStore();
  const result = mutator(store);
  writeStore(store);
  return result === undefined ? store : result;
}

function resetPlansIfMissing(store) {
  if (!Array.isArray(store.plans) || store.plans.length === 0) {
    store.plans = DEFAULT_PLANS;
  }
}

module.exports = {
  DATA_DIR,
  DEFAULT_PLANS,
  ensureStore,
  readStore,
  writeStore,
  updateStore,
  resetPlansIfMissing
};
