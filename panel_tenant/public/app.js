const state = {
  page: "dashboard",
  data: null,
  pollers: new Map()
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));
const date = (value) => value ? new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";
const label = (value) => ({ active: "Activo", provisioning: "Desplegando", queued: "En cola", running: "En curso", failed: "Fallido", suspended: "Suspendido", deleting: "Eliminando", deleted: "Eliminado", succeeded: "Completado" }[value] || value);
const badge = (value) => `<span class="badge badge-${esc(value)}">${esc(label(value))}</span>`;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "No se pudo completar la operación.");
  return body;
}

function toast(message, isError = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show${isError ? " error" : ""}`;
  setTimeout(() => element.className = "toast", 3600);
}

async function load() {
  state.data = await api("/api/bootstrap");
  $("#mode-label").textContent = state.data.provisionMode === "real" ? "AWS / Azure activo" : "Simulación";
  $("#profile-name").textContent = state.data.user;
  $("#profile-initial").textContent = state.data.user.slice(0, 1).toUpperCase();
  render();
}

function pageHeading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">GLOBOMATICS · TENANT DESK</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function render() {
  const titles = { dashboard: "Resumen", tenants: "Tenants", plans: "Planes", monitoring: "Monitoreo", audit: "Auditoría" };
  $("#page-title").textContent = titles[state.page];
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
  const renderer = { dashboard: renderDashboard, tenants: renderTenants, plans: renderPlans, monitoring: renderMonitoring, audit: renderAudit }[state.page];
  $("#page-content").innerHTML = renderer();
  bindPageEvents();
}

function renderDashboard() {
  const { tenants, jobs, metrics } = state.data;
  const recent = jobs.slice(0, 5);
  return `${pageHeading("Resumen operativo", "Una lectura rápida de tus instituciones y despliegues.", `<button class="button button-primary" data-action="create-tenant">+ Crear tenant</button>`)}
    <div class="grid stats-grid">
      <div class="stat-card"><small>Tenants registrados</small><strong>${tenants.length}</strong><span class="muted">Instituciones en el panel</span></div>
      <div class="stat-card"><small>Activos</small><strong class="stat-accent">${metrics.activeTenants}</strong><span class="muted">Operando normalmente</span></div>
      <div class="stat-card"><small>Suspendidos</small><strong>${metrics.suspendedTenants}</strong><span class="muted">Pueden reanudarse</span></div>
      <div class="stat-card"><small>Operaciones en curso</small><strong class="stat-warn">${metrics.runningJobs}</strong><span class="muted">Trabajos asíncronos</span></div>
    </div>
    <div class="grid two-col">
      <section class="panel"><div class="panel-heading"><h3>Actividad reciente</h3><button class="mini-button" data-page-link="audit">Ver auditoría</button></div><div class="panel-body">${recent.length ? recent.map(jobRow).join("") : '<div class="empty">Todavía no hay operaciones. Crea tu primer tenant.</div>'}</div></section>
      <section class="panel"><div class="panel-heading"><h3>Acceso rápido</h3></div><div class="panel-body">
        <button class="button button-primary button-wide" data-action="create-tenant">Nuevo tenant <span>→</span></button>
        <button class="button button-secondary button-wide" data-page-link="plans">Explorar planes <span>→</span></button>
        <div class="modal-note">Modo actual: <strong>${state.data.provisionMode === "real" ? "ejecución real" : "simulación segura"}</strong>. Puedes cambiarlo en el archivo .env local.</div>
      </div></section>
    </div>`;
}

function jobRow(job) {
  const tenant = state.data.tenants.find((item) => item.id === job.tenantId);
  const cloud = state.data.clouds.find((item) => item.id === (job.cloud || tenant?.cloud || "aws"));
  return `<div class="job-row"><div class="job-icon">${job.action === "delete" ? "×" : "↗"}</div><div class="job-info"><strong>${esc(tenant?.name || "Tenant")}</strong><small>${esc(job.action)} · ${esc(cloud?.name || "AWS")} · ${date(job.createdAt)}</small></div>${badge(job.status)}<span class="muted">${job.progress}%</span></div>`;
}

function renderTenants() {
  const rows = state.data.tenants.map((tenant) => {
    const plan = state.data.plans.find((item) => item.id === tenant.planId);
    const canSuspend = tenant.status === "active";
    const canResume = tenant.status === "suspended";
    const canRetry = tenant.status === "failed";
    const cloud = state.data.clouds.find((item) => item.id === (tenant.cloud || "aws"));

    const frontendIp = tenant.frontendIp || tenant.ips?.frontend || (tenant.endpoint ? tenant.endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "") : "");
    const backendIp = tenant.backendIp || tenant.ips?.backend || "";
    const databaseIp = tenant.databaseIp || tenant.ips?.database || "";

    let endpointHtml = '<span class="muted">Disponible al completar</span>';
    if (tenant.status === "active" || frontendIp || backendIp || databaseIp) {
      const webDisplay = tenant.endpoint && /^http:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\/?$/.test(tenant.endpoint)
        ? `<a href="${esc(tenant.endpoint)}" target="_blank" rel="noopener">${esc(frontendIp || tenant.endpoint)}</a>`
        : (frontendIp ? `<code>${esc(frontendIp)}</code>` : '<span class="muted">—</span>');

      endpointHtml = `<div class="ip-stack">
        <div class="ip-item"><span class="ip-tag ip-tag-web" title="Frontend (Web)">Web</span> ${webDisplay}</div>
        <div class="ip-item"><span class="ip-tag ip-tag-api" title="Backend (API)">API</span> ${backendIp ? `<code title="Click para copiar">${esc(backendIp)}</code>` : '<span class="muted">—</span>'}</div>
        <div class="ip-item"><span class="ip-tag ip-tag-db" title="Base de Datos (PostgreSQL)">DB</span> ${databaseIp ? `<code title="Click para copiar">${esc(databaseIp)}</code>` : '<span class="muted">—</span>'}</div>
      </div>`;
    }

    return `<tr><td><strong>${esc(tenant.name)}</strong><small>${esc(tenant.slug)} · ${esc(tenant.contactEmail)}</small></td>
      <td><strong>${esc(plan?.name || "—")}</strong><small>${plan?.databaseVolumeSize || 0} GB DB</small></td>
      <td>${badge(tenant.status)}<small>${esc(tenant.environment)}</small></td>
      <td class="endpoint-cell">${endpointHtml}</td>
      <td><strong>${esc(cloud?.name || "AWS")}</strong><small>${esc(tenant.provider)} · ${date(tenant.createdAt)}</small></td>
      <td class="actions">${canSuspend ? `<button class="mini-button" data-tenant-action="suspend" data-id="${tenant.id}">Suspender</button>` : ""}${canResume ? `<button class="mini-button" data-tenant-action="resume" data-id="${tenant.id}">Reanudar</button>` : ""}${canRetry ? `<button class="mini-button" data-tenant-action="retry" data-id="${tenant.id}">Reintentar</button>` : ""}<button class="mini-button" data-tenant-action="logs" data-id="${tenant.id}">Log</button><button class="mini-button" data-tenant-action="delete" data-id="${tenant.id}">Eliminar</button></td></tr>`;
  }).join("");
  return `${pageHeading("Tus tenants", "Cada institución mantiene su configuración, estado y despliegue aislados.", `<button class="button button-primary" data-action="create-tenant">+ Crear tenant</button>`)}
    <section class="panel"><div class="panel-heading"><h3>${state.data.tenants.length} instituciones</h3><span class="muted">AWS y Azure · región configurada por tenant</span></div><div class="table-wrap"><table><thead><tr><th>Institución</th><th>Plan</th><th>Estado</th><th>IPs / Instancias</th><th>Nube / motor</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty">No tienes tenants todavía.</div></td></tr>`}</tbody></table></div></section>`;
}

function renderPlans() {
  return `${pageHeading("Planes que escalan contigo", "Capacidad, soporte y operación pensados para cada etapa.", "")}
    <div class="grid plans-grid">${state.data.plans.map((plan, index) => `<article class="plan-card ${esc(plan.accent)} ${index === 1 ? "featured" : ""}">${index === 1 ? '<span class="plan-tag">MÁS ELEGIDO</span>' : ""}<div class="plan-color"></div><h2>${esc(plan.name)}</h2><p>${esc(plan.description)}</p><div class="price">$${plan.price}<small> / mes</small></div><ul>${plan.features.map((feature) => `<li>${esc(feature)}</li>`).join("")}</ul><button class="button button-secondary button-wide" data-action="create-tenant" data-plan="${plan.id}">Elegir plan <span>→</span></button></article>`).join("")}</div>`;
}

function renderMonitoring() {
  const { metrics } = state.data;
  const grafanaUrl = metrics.grafanaUrl || "http://18.225.95.75:3000/login";
  const grafanaUser = metrics.grafanaUser || "admin";
  const grafanaPassword = metrics.grafanaPassword || "admin123";

  return `${pageHeading("Monitoreo en Grafana", "Supervisión de métricas de CPU, RAM y almacenamiento en tiempo real.", `<a href="${esc(grafanaUrl)}" target="_blank" rel="noopener" class="button button-primary">Abrir Grafana ↗</a>`)}
    <section class="panel"><div class="panel-heading"><h3>Servidor de Grafana & Prometheus</h3><span class="badge badge-active">Configurado</span></div><div class="panel-body"><div class="metric-list">
      <div class="metric"><small>Servidor Grafana</small><strong><a href="${esc(grafanaUrl)}" target="_blank" rel="noopener" style="font-size:16px;">${esc(grafanaUrl)}</a></strong><span class="muted">Acceso a dashboards</span></div>
      <div class="metric"><small>Usuario Grafana</small><strong><code>${esc(grafanaUser)}</code></strong><span class="muted">Credencial de acceso</span></div>
      <div class="metric"><small>Contraseña Grafana</small><strong><code>${esc(grafanaPassword)}</code></strong><span class="muted">Credencial de acceso</span></div>
      <div class="metric"><small>Puerto node_exporter</small><strong><code>9100</code></strong><span class="muted">Métricas activas en instancias</span></div>
      <div class="metric"><small>Tenants observados</small><strong>${metrics.monitoredTenants || metrics.activeTenants || 0}</strong><span class="muted">Última sync: ${date(metrics.lastSyncAt)}</span></div>
    </div><div class="modal-note"><strong>Instrucciones para Grafana:</strong><br>1. Haz clic en <strong>"Abrir Grafana ↗"</strong> e inicia sesión con el usuario <code>${esc(grafanaUser)}</code> y contraseña <code>${esc(grafanaPassword)}</code>.<br>2. En la pestaña <strong>"Tenants"</strong> de este panel tienes las IPs individuales de cada instancia (Web, API y DB) para agregarlas como targets a Prometheus en el puerto <code>9100</code>.</div></div></section>`;
}

function renderAudit() {
  const rows = state.data.audit.map((entry) => `<div class="audit-row"><div class="job-icon">${entry.result === "error" ? "!" : "✓"}</div><div class="job-info"><strong>${esc(entry.action)}</strong><small>${esc(entry.detail)} · ${date(entry.createdAt)}</small></div>${badge(entry.result === "error" ? "failed" : entry.result)}</div>`).join("");
  return `${pageHeading("Auditoría", "Un registro legible de cada acción ejecutada desde el panel.", "")}<section class="panel"><div class="panel-heading"><h3>${state.data.audit.length} eventos recientes</h3></div><div class="panel-body">${rows || '<div class="empty">No hay eventos registrados.</div>'}</div></section>`;
}

function createTenantModal(preselectedPlan = "") {
  const planOptions = state.data.plans.map((plan) => `<option value="${plan.id}" ${plan.id === preselectedPlan ? "selected" : ""}>${esc(plan.name)} · ${plan.databaseVolumeSize} GB · $${plan.price}/mes</option>`).join("");
  const cloudOptions = state.data.clouds.map((cloud) => `<option value="${cloud.id}" ${cloud.id === "aws" ? "selected" : ""}>${esc(cloud.name)}</option>`).join("");
  const providers = state.data.providers.map((provider) => `<option value="${provider.id}" ${provider.enabled ? "" : "disabled"}>${esc(provider.name)}${provider.enabled ? "" : " · próximamente"}</option>`).join("");
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><form id="tenant-form" class="modal"><button type="button" class="close" data-action="close-modal">×</button><p class="eyebrow">NUEVA INSTITUCIÓN</p><h2>Crear tenant</h2><p class="muted">Define el espacio aislado y prepara su despliegue.</p><div class="form-grid"><label>Nombre de la institución<input name="name" placeholder="Instituto San Marcos" required></label><label>Identificador único<input name="slug" placeholder="san-marcos" pattern="[a-z0-9\\-]+" required><small class="muted">Minúsculas, números y guiones.</small></label><label>Correo de contacto<input name="contactEmail" type="email" placeholder="admin@institucion.edu" required></label><label>Entorno<select name="environment"><option value="development">Desarrollo</option><option value="staging">Staging</option><option value="production">Producción</option></select></label><label>Nube de despliegue<select name="cloud" required>${cloudOptions}</select></label><label>Plan<select name="planId" required>${planOptions}</select></label><label>Motor de infraestructura<select name="provider" required>${providers}</select></label></div><div class="modal-note">Se crearán frontend, backend y base de datos separados en la nube seleccionada. El plan define la capacidad inicial de PostgreSQL y el tipo de instancia.</div><div class="form-actions"><button type="button" class="button button-secondary" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Crear y aprovisionar →</button></div></form></div>`;
  $("#tenant-form").addEventListener("submit", submitTenant);
}

async function submitTenant(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  showTenantReview(payload);
}

function showTenantReview(payload) {
  const plan = state.data.plans.find((item) => item.id === payload.planId);
  const provider = state.data.providers.find((item) => item.id === payload.provider);
  const cloud = state.data.clouds.find((item) => item.id === payload.cloud);
  const instanceType = payload.cloud === "azure" ? plan?.azureInstanceType : plan?.instanceType;
  const environments = { development: "Desarrollo", staging: "Staging", production: "Producción" };
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><div class="modal review-modal"><button type="button" class="close" data-action="close-modal">×</button><p class="eyebrow">REVISIÓN</p><h2>Confirma los datos</h2><p class="muted">Al crear, el panel ejecutará el aprovisionamiento en la nube seleccionada.</p><div class="review-card"><div><span>Institución</span><strong>${esc(payload.name)}</strong></div><div><span>Identificador</span><strong>${esc(payload.slug)}</strong></div><div><span>Correo de contacto</span><strong>${esc(payload.contactEmail)}</strong></div><div><span>Entorno</span><strong>${esc(environments[payload.environment] || payload.environment)}</strong></div><div><span>Nube</span><strong>${esc(cloud?.name || payload.cloud)}</strong></div><div><span>Plan</span><strong>${esc(plan?.name || "—")} · ${esc(instanceType || "—")} · ${plan?.databaseVolumeSize || 0} GB DB</strong></div><div><span>Motor</span><strong>${esc(provider?.name || payload.provider)}</strong></div><div><span>Recursos</span><strong>Frontend, backend y base de datos independientes</strong></div></div><div class="modal-note">Revisa especialmente la nube, el identificador, el plan y el motor. Después de confirmar comenzará el trabajo asíncrono.</div><div class="form-actions"><button type="button" class="button button-secondary" id="review-back">← Volver a editar</button><button class="button button-primary" type="button" id="confirm-tenant">Confirmar y aprovisionar →</button></div></div></div>`;
  $("#review-back").addEventListener("click", () => createTenantModal(payload.planId));
  $("#confirm-tenant").addEventListener("click", () => submitTenantPayload(payload));
}

async function submitTenantPayload(payload) {
  try {
    const result = await api("/api/tenants", { method: "POST", body: JSON.stringify(payload) });
    closeModal();
    toast("Tenant creado. El trabajo de aprovisionamiento está en curso.");
    await load();
    watchJob(result.job.id);
  } catch (caught) { toast(caught.message, true); }
}

function closeModal() { $("#modal-root").innerHTML = ""; }

async function actionTenant(action, tenantId) {
  const tenant = state.data.tenants.find((item) => item.id === tenantId);
  try {
    if (action === "logs") {
      const jobs = state.data.jobs.filter((job) => job.tenantId === tenantId);
      $("#modal-root").innerHTML = `<div class="modal-backdrop logs-backdrop"><div class="modal logs-modal"><button class="close" data-action="close-modal">×</button><p class="eyebrow">OPERACIONES</p><h2>Log de ${esc(tenant.name)}</h2><p class="muted">Salida completa de las operaciones ejecutadas para este tenant.</p><div class="logs-list">${jobs.length ? jobs.map((job) => { const cloud = state.data.clouds.find((item) => item.id === (job.cloud || tenant.cloud || "aws")); return `<section class="log-job"><div class="log-job-heading"><strong>${esc(job.action)} · ${esc(cloud?.name || "AWS")} · ${esc(job.provider)}</strong>${badge(job.status)}<span>${job.progress}%</span></div><pre class="job-log">${job.logs.length ? job.logs.map((entry) => `[${date(entry.at)}] ${entry.message}`).join("\n") : "Sin mensajes."}</pre></section>`; }).join("") : '<div class="empty">Sin operaciones.</div>'}</div></div></div>`;
      return;
    }
    if (action === "delete") {
      const preview = await api(`/api/tenants/${tenantId}/deletion-preview`);
      $("#modal-root").innerHTML = `<div class="modal-backdrop"><form id="delete-form" class="modal"><button type="button" class="close" data-action="close-modal">×</button><p class="eyebrow">ACCIÓN IRREVERSIBLE</p><h2>Eliminar ${esc(preview.tenant.name)}</h2><p class="muted">${esc(preview.warning)}</p><div class="modal-note"><strong>Se eliminará:</strong><br>${preview.resources.map(esc).join("<br>")}<br><br><strong>Datos afectados:</strong><br>${preview.data.map(esc).join("<br>")}</div><label>Escribe <strong>${esc(preview.tenant.slug)}</strong> para confirmar<input name="confirmation" required autocomplete="off"></label><div class="form-actions"><button type="button" class="button button-secondary" data-action="close-modal">Cancelar</button><button class="button button-danger" type="submit">Confirmar eliminación</button></div></form></div>`;
      $("#delete-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          const confirmation = new FormData(event.currentTarget).get("confirmation");
          const result = await api(`/api/tenants/${tenantId}`, { method: "DELETE", body: JSON.stringify({ confirmation }) });
          closeModal(); toast("Eliminación iniciada."); await load(); watchJob(result.job.id);
        } catch (caught) { toast(caught.message, true); }
      });
      return;
    }
    const result = await api(`/api/tenants/${tenantId}/${action}`, { method: "POST", body: "{}" });
    toast(action === "retry" ? "Reintento iniciado." : "Cambio de estado iniciado.");
    await load();
    watchJob(result.job.id);
  } catch (caught) { toast(caught.message, true); }
}

function watchJob(jobId) {
  if (state.pollers.has(jobId)) return;
  const poll = async () => {
    try {
      const job = await api(`/api/jobs/${jobId}`);
      if (state.data) {
        const index = state.data.jobs.findIndex((item) => item.id === job.id);
        if (index >= 0) state.data.jobs[index] = job; else state.data.jobs.unshift(job);
        render();
      }
      if (["succeeded", "failed"].includes(job.status)) {
        clearInterval(state.pollers.get(jobId));
        state.pollers.delete(jobId);
        await load();
        toast(job.status === "succeeded" ? "Operación completada." : `Operación fallida: ${job.error}`, job.status === "failed");
      }
    } catch (caught) { clearInterval(state.pollers.get(jobId)); state.pollers.delete(jobId); toast(caught.message, true); }
  };
  const interval = setInterval(poll, 800);
  state.pollers.set(jobId, interval);
  poll();
}

function bindPageEvents() {
  document.querySelectorAll("[data-page-link]").forEach((element) => element.addEventListener("click", () => { state.page = element.dataset.pageLink; render(); }));
  document.querySelectorAll("[data-action='create-tenant']").forEach((element) => element.addEventListener("click", () => createTenantModal(element.dataset.plan || "")));
  document.querySelectorAll("[data-tenant-action]").forEach((element) => element.addEventListener("click", () => actionTenant(element.dataset.tenantAction, element.dataset.id)));
  const sync = document.querySelector("[data-action='sync']");
  if (sync) sync.addEventListener("click", async () => { try { await api("/api/monitoring/sync", { method: "POST", body: "{}" }); await load(); toast("Sincronización registrada."); } catch (caught) { toast(caught.message, true); } });
}

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => { state.page = item.dataset.page; render(); }));
$("#logout-button").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); window.location.reload(); });
$("#modal-root").addEventListener("click", (event) => {
  if (event.target.closest("[data-action='close-modal']")) closeModal();
});
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
    $("#login-view").classList.add("hidden");
    $("#app-view").classList.remove("hidden");
    await load();
  } catch (caught) { toast(caught.message, true); }
});

api("/api/auth/me").then(async (result) => {
  if (result.authenticated) {
    $("#login-view").classList.add("hidden");
    $("#app-view").classList.remove("hidden");
    await load();
  }
}).catch(() => {});
