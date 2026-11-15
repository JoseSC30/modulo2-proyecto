const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  });
}

const {
  ensureStore,
  readStore,
  updateStore
} = require("./store");
const {
  destroyProvisioning,
  executeProvisioning,
  cloudList,
  providerList,
  runCloudLifecycle,
  SUPPORTED_CLOUDS,
  sanitizeTenantId
} = require("./providers");

const PORT = Number(process.env.PANEL_PORT || 4173);
const HOST = process.env.PANEL_HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const sessions = new Map();

ensureStore();

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, encoded) {
  if (!encoded || !encoded.startsWith("scrypt$")) return false;
  const [, salt, expected] = encoded.split("$");
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function ensureAdmin() {
  const configuredPassword = process.env.PANEL_ADMIN_PASSWORD;
  const configuredUser = process.env.PANEL_ADMIN_USER || "admin";
  if (!configuredPassword) return false;
  const store = readStore();
  if (!store.admin) {
    updateStore((current) => {
      current.admin = {
        username: configuredUser,
        passwordHash: hashPassword(configuredPassword),
        createdAt: now()
      };
    });
  }
  return true;
}

function parseCookies(request) {
  const cookies = {};
  (request.headers.cookie || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index > -1) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return cookies;
}

function sessionFrom(request) {
  const token = parseCookies(request).panel_session;
  return token ? sessions.get(token) : null;
}

function setSession(response, username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, createdAt: Date.now() });
  response.setHeader("Set-Cookie", `panel_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
}

function clearSession(request, response) {
  const token = parseCookies(request).panel_session;
  if (token) sessions.delete(token);
  response.setHeader("Set-Cookie", "panel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function send(response, status, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(body);
}

function error(response, status, message, code = "request_error") {
  send(response, status, { error: code, message });
}

function requireAuth(request, response) {
  if (sessionFrom(request)) return true;
  error(response, 401, "La sesión no es válida o expiró.", "unauthorized");
  return false;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("El cuerpo de la solicitud es demasiado grande."));
      }
    });
    request.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("El cuerpo debe ser JSON válido."));
      }
    });
    request.on("error", reject);
  });
}

function audit(action, tenantId, result, detail) {
  updateStore((store) => {
    store.audit.unshift({
      id: id("audit"),
      createdAt: now(),
      user: process.env.PANEL_ADMIN_USER || "admin",
      action,
      tenantId: tenantId || null,
      result,
      detail
    });
    store.audit = store.audit.slice(0, 500);
  });
}

function publicJob(job) {
  return {
    id: job.id,
    tenantId: job.tenantId,
    action: job.action,
    cloud: job.cloud || "aws",
    provider: job.provider,
    status: job.status,
    progress: job.progress,
    logs: job.logs,
    error: job.error || null,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null
  };
}

function createJob(tenant, action) {
  const job = {
    id: id("job"),
    tenantId: tenant.id,
    action,
    cloud: tenant.cloud || "aws",
    provider: tenant.provider,
    status: "queued",
    progress: 0,
    logs: [],
    versions: tenant.versions,
    createdAt: now()
  };
  updateStore((store) => store.jobs.unshift(job));
  setImmediate(() => processJob(job.id));
  return job;
}

async function processJob(jobId) {
  const initial = readStore();
  const job = initial.jobs.find((item) => item.id === jobId);
  const tenant = initial.tenants.find((item) => item.id === job?.tenantId);
  if (!job || !tenant) return;
  const plan = initial.plans.find((item) => item.id === tenant.planId);
  const updateJob = (mutator) => updateStore((store) => {
    const target = store.jobs.find((item) => item.id === jobId);
    if (target) mutator(target);
  });
  const report = async (message) => {
    updateJob((target) => {
      target.logs.push({ at: now(), message });
      target.progress = Math.min(95, target.progress + Math.max(5, Math.floor(90 / 6)));
    });
  };
  updateJob((target) => {
    target.status = "running";
    target.startedAt = now();
    target.logs.push({ at: now(), message: "Trabajo iniciado." });
    target.progress = 5;
  });
  updateStore((store) => {
    const current = store.tenants.find((item) => item.id === tenant.id);
    if (current && job.action === "provision") current.status = "provisioning";
    if (current && job.action === "delete") current.status = "deleting";
  });
  try {
    if (!plan && job.action === "provision") throw new Error("El plan del tenant ya no existe.");
    const provisionResult = job.action === "provision"
      ? await executeProvisioning(tenant, plan, job, report)
      : null;
    if (job.action === "delete") await destroyProvisioning(tenant, job, report);
    if (job.action === "suspend" || job.action === "resume") {
      await runCloudLifecycle(tenant, job.action, report);
    }
    const endpoint = typeof provisionResult === "string" ? provisionResult : (provisionResult?.frontendUrl || null);
    const ips = typeof provisionResult === "object" && provisionResult !== null ? {
      frontend: provisionResult.frontendIp || (endpoint ? endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "") : null),
      backend: provisionResult.backendIp || null,
      database: provisionResult.databaseIp || null,
    } : null;
    updateStore((store) => {
      const currentJob = store.jobs.find((item) => item.id === jobId);
      const currentTenant = store.tenants.find((item) => item.id === tenant.id);
      if (currentJob) {
        currentJob.status = "succeeded";
        currentJob.progress = 100;
        currentJob.finishedAt = now();
        currentJob.logs.push({ at: now(), message: "Trabajo completado correctamente." });
      }
      if (currentTenant) {
        if (job.action === "provision") {
          currentTenant.status = "active";
          currentTenant.endpoint = endpoint || currentTenant.endpoint || null;
          if (ips) {
            currentTenant.ips = ips;
            currentTenant.frontendIp = ips.frontend;
            currentTenant.backendIp = ips.backend;
            currentTenant.databaseIp = ips.database;
          }
          currentTenant.lastDeployedAt = now();
        } else if (job.action === "delete") {
          currentTenant.status = "deleted";
          currentTenant.deletedAt = now();
        } else {
          currentTenant.status = job.action === "suspend" ? "suspended" : "active";
        }
      }
    });
    audit(job.action, tenant.id, "ok", "Trabajo completado correctamente.");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Error desconocido durante el trabajo.";
    updateStore((store) => {
      const currentJob = store.jobs.find((item) => item.id === jobId);
      const currentTenant = store.tenants.find((item) => item.id === tenant.id);
      if (currentJob) {
        currentJob.status = "failed";
        currentJob.error = message;
        currentJob.finishedAt = now();
        currentJob.logs.push({ at: now(), message: `Error: ${message}` });
      }
      if (currentTenant && job.action !== "delete") currentTenant.status = "failed";
    });
    audit(job.action, tenant.id, "error", message);
  }
}

function planFor(store, planId) {
  return store.plans.find((plan) => plan.id === planId);
}

function validateTenantInput(body, store) {
  const name = String(body.name || "").trim();
  const slug = sanitizeTenantId(body.slug || name);
  const email = String(body.contactEmail || "").trim();
  const environment = String(body.environment || "development");
  const cloud = String(body.cloud || "aws");
  const provider = String(body.provider || "terraform");
  if (name.length < 3 || name.length > 120) throw new Error("El nombre debe tener entre 3 y 120 caracteres.");
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug)) throw new Error("El identificador debe usar minúsculas, números y guiones.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Ingresa un correo de contacto válido.");
  if (!["development", "staging", "production"].includes(environment)) throw new Error("El entorno seleccionado no es válido.");
  if (!SUPPORTED_CLOUDS.has(cloud)) throw new Error("La nube seleccionada no es válida.");
  if (!providerList().some((item) => item.id === provider)) throw new Error("El motor seleccionado no es válido.");
  const plan = planFor(store, String(body.planId || ""));
  if (!plan) throw new Error("Selecciona un plan válido.");
  if (store.tenants.some((tenant) => tenant.slug === slug && tenant.status !== "deleted")) {
    throw new Error("Ya existe un tenant con ese identificador.");
  }
  return { name, slug, email, environment, cloud, provider, plan };
}

async function handleApi(request, response, pathname, method) {
  if (method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await readBody(request);
      if (!ensureAdmin()) return error(response, 503, "Configura PANEL_ADMIN_PASSWORD antes de iniciar sesión.", "admin_not_configured");
      const store = readStore();
      if (body.username !== store.admin.username || !verifyPassword(String(body.password || ""), store.admin.passwordHash)) {
        return error(response, 401, "Usuario o contraseña incorrectos.", "invalid_credentials");
      }
      setSession(response, store.admin.username);
      audit("login", null, "ok", "Inicio de sesión correcto.");
      return send(response, 200, { username: store.admin.username });
    } catch (caught) {
      return error(response, 400, caught.message);
    }
  }
  if (method === "POST" && pathname === "/api/auth/logout") {
    clearSession(request, response);
    return send(response, 200, { ok: true });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const session = sessionFrom(request);
    return session ? send(response, 200, { authenticated: true, username: session.username }) : send(response, 200, { authenticated: false });
  }
  if (!requireAuth(request, response)) return;

  if (method === "GET" && pathname === "/api/bootstrap") {
    const store = readStore();
    const activeTenants = store.tenants.filter((tenant) => tenant.status !== "deleted");
    return send(response, 200, {
      user: sessionFrom(request).username,
      plans: store.plans,
      tenants: activeTenants,
      jobs: store.jobs.slice(0, 40).map(publicJob),
      audit: store.audit.slice(0, 80),
      providers: providerList(),
      clouds: cloudList(),
      metrics: {
        ...store.metrics,
        grafanaUrl: process.env.PANEL_GRAFANA_URL || store.metrics?.grafanaUrl || "http://18.225.95.75:3000/login",
        grafanaUser: process.env.PANEL_GRAFANA_USER || "admin",
        grafanaPassword: process.env.PANEL_GRAFANA_PASSWORD || "admin123",
        prometheusUrl: process.env.PANEL_PROMETHEUS_URL || store.metrics?.prometheusUrl || "http://localhost:9090",
        activeTenants: activeTenants.filter((tenant) => tenant.status === "active").length,
        suspendedTenants: activeTenants.filter((tenant) => tenant.status === "suspended").length,
        runningJobs: store.jobs.filter((job) => ["queued", "running"].includes(job.status)).length
      },
      provisionMode: process.env.PANEL_PROVISION_MODE === "real" ? "real" : "dry-run"
    });
  }

  if (method === "POST" && pathname === "/api/tenants") {
    try {
      const store = readStore();
      const input = validateTenantInput(await readBody(request), store);
      const tenant = {
        id: id("tenant"),
        name: input.name,
        slug: input.slug,
        contactEmail: input.email,
        environment: input.environment,
        cloud: input.cloud,
        provider: input.provider,
        planId: input.plan.id,
        versions: {
          application: process.env.PANEL_APP_VERSION || "main",
          templates: process.env.PANEL_TEMPLATE_VERSION || "1.0.0",
          tool: input.provider === "terraform" ? "Terraform 1.x" : "Pulumi 3.x",
          cloud: input.cloud
        },
        status: "queued",
        endpoint: null,
        createdAt: now()
      };
      updateStore((current) => current.tenants.unshift(tenant));
      const job = createJob(tenant, "provision");
      audit("create_tenant", tenant.id, "started", `Plan ${input.plan.name}, nube ${input.cloud}, motor ${input.provider}.`);
      return send(response, 202, { tenant, job: publicJob(job) });
    } catch (caught) {
      return error(response, 400, caught.message);
    }
  }

  const tenantMatch = pathname.match(/^\/api\/tenants\/([^/]+)(?:\/(suspend|resume|retry|deletion-preview))?$/);
  if (tenantMatch) {
    const tenantId = tenantMatch[1];
    const action = tenantMatch[2];
    const store = readStore();
    const tenant = store.tenants.find((item) => item.id === tenantId);
    if (!tenant) return error(response, 404, "Tenant no encontrado.", "not_found");
    if (method === "GET" && action === "deletion-preview") {
      const plan = planFor(store, tenant.planId);
      return send(response, 200, {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        resources: ["Instancia de base de datos", "Instancia backend", "Instancia frontend", "Estado Terraform/Pulumi"],
        data: [`Base de datos del tenant ${tenant.slug}`, "Historial de despliegues asociado"],
        warning: "Esta acción no se puede deshacer desde el panel."
      });
    }
    if (method === "POST" && ["suspend", "resume"].includes(action)) {
      if (action === "suspend" && tenant.status !== "active") return error(response, 409, "Solo se puede suspender un tenant activo.");
      if (action === "resume" && tenant.status !== "suspended") return error(response, 409, "Solo se puede reanudar un tenant suspendido.");
      const job = createJob(tenant, action);
      audit(action, tenant.id, "started", `Cambio de ciclo de vida solicitado para ${tenant.slug}.`);
      return send(response, 202, { job: publicJob(job) });
    }
    if (method === "POST" && action === "retry") {
      if (tenant.status !== "failed") return error(response, 409, "Solo se puede reintentar un tenant fallido.");
      const job = createJob(tenant, "provision");
      audit("retry_tenant", tenant.id, "started", "Reintento solicitado.");
      return send(response, 202, { job: publicJob(job) });
    }
    if (method === "DELETE" && !action) {
      try {
        const body = await readBody(request);
        if (String(body.confirmation || "") !== tenant.slug) {
          return error(response, 400, `Escribe exactamente ${tenant.slug} para confirmar la eliminación.`);
        }
        const job = createJob(tenant, "delete");
        audit("delete_tenant", tenant.id, "started", "Eliminación confirmada por el administrador.");
        return send(response, 202, { job: publicJob(job) });
      } catch (caught) {
        return error(response, 400, caught.message);
      }
    }
  }

  if (method === "GET" && pathname.startsWith("/api/jobs/")) {
    const jobId = pathname.split("/").pop();
    const job = readStore().jobs.find((item) => item.id === jobId);
    return job ? send(response, 200, publicJob(job)) : error(response, 404, "Trabajo no encontrado.", "not_found");
  }

  if (method === "POST" && pathname === "/api/monitoring/sync") {
    updateStore((store) => {
      store.metrics.lastSyncAt = now();
      store.metrics.monitoredTenants = store.tenants.filter((tenant) => tenant.status === "active").length;
    });
    audit("monitoring_sync", null, "ok", "Sincronización local preparada para Prometheus.");
    return send(response, 200, { ok: true, message: "Sincronización registrada. Prometheus/Grafana aún no están conectados." });
  }

  return error(response, 404, "Ruta API no encontrada.", "not_found");
}

function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return error(response, 403, "Ruta no permitida.");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return error(response, 404, "Página no encontrada.", "not_found");
  const extensions = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
  response.writeHead(200, {
    "Content-Type": `${extensions[path.extname(file)] || "application/octet-stream"}; charset=utf-8`,
    "Cache-Control": "no-cache"
  });
  fs.createReadStream(file).pipe(response);
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  const parsed = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (parsed.pathname.startsWith("/api/")) {
      await handleApi(request, response, parsed.pathname, request.method);
    } else if (request.method === "GET") {
      serveStatic(request, response, parsed.pathname);
    } else {
      error(response, 405, "Método no permitido.");
    }
  } catch (caught) {
    error(response, 500, caught instanceof Error ? caught.message : "Error interno.");
  }
});

server.listen(PORT, HOST, () => {
  ensureAdmin();
  console.log(`Panel de tenants disponible en http://${HOST}:${PORT}`);
  if (!process.env.PANEL_ADMIN_PASSWORD) {
    console.warn("PANEL_ADMIN_PASSWORD no está configurado; el login permanecerá deshabilitado.");
  }
});
