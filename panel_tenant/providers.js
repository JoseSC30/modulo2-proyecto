const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SUPPORTED_PROVIDERS = new Set(["terraform", "pulumi"]);
const SUPPORTED_CLOUDS = new Set(["aws", "azure"]);
const DISPLAY_CLOUDS = [
  { id: "aws", name: "AWS", enabled: true },
  { id: "azure", name: "Azure", enabled: true }
];
const DISPLAY_PROVIDERS = [
  { id: "terraform", name: "Terraform", enabled: true },
  { id: "pulumi", name: "Pulumi", enabled: true },
  { id: "opentofu", name: "OpenTofu", enabled: false },
  { id: "cloudformation", name: "CloudFormation", enabled: false }
];

class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderError";
  }
}

function providerList() {
  return DISPLAY_PROVIDERS;
}

function cloudList() {
  return DISPLAY_CLOUDS;
}

function tenantCloud(tenant) {
  return tenant.cloud || "aws";
}

function sanitizeTenantId(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function commandName(name) {
  return process.platform === "win32" && !path.extname(name) ? `${name}.exe` : name;
}

function cleanOutput(text) {
  return text
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

function runCommand(command, args, options, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const append = (chunk, target) => {
      const text = cleanOutput(chunk.toString());
      if (target === "stdout") stdout += text;
      else stderr += text;
      if (onOutput) onOutput(text);
    };
    child.stdout.on("data", (chunk) => append(chunk, "stdout"));
    child.stderr.on("data", (chunk) => append(chunk, "stderr"));
    child.on("error", (error) => reject(new ProviderError(`No se pudo ejecutar ${command}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const detail = (stderr || stdout).trim().slice(-4000);
        reject(new ProviderError(`${command} terminó con código ${code}. ${detail}`));
      }
    });
  });
}

function requireExistingDirectory(directory, label) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new ProviderError(`No existe el directorio configurado para ${label}: ${directory}`);
  }
}

function resolveScannerCommand(configured, logicalName, fallbackCommand, candidates) {
  const isDefaultCommand = !configured
    || configured === logicalName
    || configured === `${logicalName}.cmd`
    || configured === `${logicalName}.exe`;
  if (!isDefaultCommand) return configured;
  const candidate = candidates.find((item) => item && fs.existsSync(item));
  return candidate || configured || fallbackCommand;
}

function windowsScannerCandidates(name) {
  if (process.platform !== "win32") return [];
  const candidates = [];
  if (name === "checkov") {
    const pythonRoot = path.join(process.env.APPDATA || "", "Python");
    if (fs.existsSync(pythonRoot)) {
      fs.readdirSync(pythonRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^Python\d+$/.test(entry.name))
        .forEach((entry) => candidates.push(path.join(pythonRoot, entry.name, "Scripts", "checkov.cmd")));
    }
  }
  if (name === "tfsec") {
    candidates.push(path.join(process.env.LOCALAPPDATA || "", "Programs", "tfsec", "tfsec.exe"));
  }
  if (name === "tflint") {
    const wingetRoot = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetRoot)) {
      fs.readdirSync(wingetRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.indexOf("TerraformLinters.tflint_") === 0)
        .forEach((entry) => candidates.push(path.join(wingetRoot, entry.name, "tflint.exe")));
    }
  }
  return candidates;
}

function runScanner(command, args, options, onOutput) {
  return new Promise((resolve) => {
    const executable = commandName(command);
    const spawnOptions = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true
    };
    const usesWindowsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(executable);
    if (usesWindowsShell) {
      spawnOptions.shell = true;
    }
    const spawnArgs = usesWindowsShell
      ? args.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`)
      : args;
    let child;
    try {
      child = spawn(executable, spawnArgs, spawnOptions);
    } catch (error) {
      resolve({
        available: false,
        code: null,
        stdout: "",
        stderr: "",
        error: error.message
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    const append = (chunk, target) => {
      const text = cleanOutput(chunk.toString());
      if (target === "stdout") stdout += text;
      else stderr += text;
      if (onOutput) onOutput(text);
    };
    child.stdout.on("data", (chunk) => append(chunk, "stdout"));
    child.stderr.on("data", (chunk) => append(chunk, "stderr"));
    child.on("error", (error) => resolve({
      available: false,
      code: null,
      stdout,
      stderr,
      error: error.message
    }));
    child.on("close", (code) => resolve({
      available: true,
      code,
      stdout,
      stderr
    }));
  });
}

async function runSecurityScans(directory, report) {
  await report("Iniciando análisis de seguridad y calidad de infraestructura.");
  await report(`Los escáneres analizarán la configuración Terraform en ${directory}.`);
  const scanners = [
    {
      name: "Checkov",
      command: resolveScannerCommand(process.env.PANEL_CHECKOV_COMMAND, "checkov", process.platform === "win32" ? "checkov.cmd" : "checkov", windowsScannerCandidates("checkov")),
      args: ["-d", directory, "--framework", "terraform", "--compact"]
    },
    {
      name: "tfsec",
      command: resolveScannerCommand(process.env.PANEL_TFSEC_COMMAND, "tfsec", "tfsec", windowsScannerCandidates("tfsec")),
      args: [directory, "--no-color", "--concise-output"]
    },
    {
      name: "TFLint",
      command: resolveScannerCommand(process.env.PANEL_TFLINT_COMMAND, "tflint", "tflint", windowsScannerCandidates("tflint")),
      args: ["--chdir", directory, "--format", "compact"]
    }
  ];
  for (const scanner of scanners) {
    await report(`${scanner.name}: ejecutando...`);
    const result = await runScanner(scanner.command, scanner.args, { cwd: directory }, report);
    if (!result.available) {
      await report(`${scanner.name}: no está instalado o no está disponible (${result.error}). Se continúa.`);
    } else if (result.code === 0) {
      await report(`${scanner.name}: finalizó sin hallazgos bloqueantes.`);
    } else {
      await report(`${scanner.name}: reportó hallazgos o advertencias (código ${result.code}). Se continúa con la creación.`);
    }
  }
  await report("Análisis finalizado. Los resultados no bloquean el aprovisionamiento.");
}

function tenantBackendKey(tenant) {
  return `terraform/tenants/${tenant.slug}/terraform.tfstate`;
}

function infrastructureDirectory(tenant, tool) {
  const cloud = tenantCloud(tenant);
  if (tool === "terraform") {
    const configured = cloud === "azure"
      ? process.env.PANEL_TERRAFORM_AZURE_DIR
      : process.env.PANEL_TERRAFORM_AWS_DIR || process.env.PANEL_TERRAFORM_DIR;
    return path.resolve(__dirname, configured || `../terraform/${cloud}`);
  }
  const configured = cloud === "azure"
    ? process.env.PANEL_PULUMI_AZURE_DIR
    : process.env.PANEL_PULUMI_AWS_DIR || process.env.PANEL_PULUMI_DIR;
  return path.resolve(__dirname, configured || `../pulumi/${cloud}`);
}

async function azureSubscriptionId(report) {
  if (process.env.PANEL_AZURE_SUBSCRIPTION_ID) return process.env.PANEL_AZURE_SUBSCRIPTION_ID;
  await report("Azure: consultando la suscripción activa del Azure CLI.");
  const result = await runCommand("az", ["account", "show", "--query", "id", "--output", "tsv"], {
    cwd: __dirname
  }, report);
  const subscriptionId = result.stdout.trim();
  if (!subscriptionId) throw new ProviderError("Azure CLI no devolvió una suscripción activa.");
  return subscriptionId;
}

function requireAzureSetting(name, value) {
  if (!value) throw new ProviderError(`Configura ${name} antes de aprovisionar en Azure.`);
  return value;
}

function resolveAzureInstanceType(plan) {
  const configured = plan?.azureInstanceType || process.env.PANEL_AZURE_INSTANCE_TYPE;
  return configured || "Standard_D2ads_v7";
}

function terraformVariables(tenant, plan, subscriptionId) {
  if (tenantCloud(tenant) === "azure") {
    return [
      `project_name=${tenant.slug}`,
      `database_volume_size=${plan.databaseVolumeSize}`,
      `azure_subscription_id=${requireAzureSetting("PANEL_AZURE_SUBSCRIPTION_ID o inicia sesión con Azure CLI", subscriptionId)}`,
      `azure_location=${process.env.PANEL_AZURE_LOCATION || "eastus2"}`,
      ...(process.env.PANEL_AZURE_RESOURCE_GROUP_NAME ? [`azure_resource_group_name=${process.env.PANEL_AZURE_RESOURCE_GROUP_NAME}`] : []),
      `azure_instance_type=${resolveAzureInstanceType(plan)}`,
      `database_image_id=${requireAzureSetting("PANEL_AZURE_DATABASE_IMAGE_ID", process.env.PANEL_AZURE_DATABASE_IMAGE_ID)}`,
      `backend_image_id=${requireAzureSetting("PANEL_AZURE_BACKEND_IMAGE_ID", process.env.PANEL_AZURE_BACKEND_IMAGE_ID)}`,
      `frontend_image_id=${requireAzureSetting("PANEL_AZURE_FRONTEND_IMAGE_ID", process.env.PANEL_AZURE_FRONTEND_IMAGE_ID)}`,
      `admin_ssh_public_key=${requireAzureSetting("PANEL_AZURE_SSH_PUBLIC_KEY", process.env.PANEL_AZURE_SSH_PUBLIC_KEY)}`
    ];
  }
  const vars = [
    `project_name=${tenant.slug}`,
    `database_volume_size=${plan.databaseVolumeSize}`,
    `instance_type=${plan.instanceType}`
  ];
  const optional = [
    ["database_ami_id", process.env.PANEL_DATABASE_AMI_ID],
    ["backend_ami_id", process.env.PANEL_BACKEND_AMI_ID],
    ["frontend_ami_id", process.env.PANEL_FRONTEND_AMI_ID]
  ];
  optional.forEach(([key, value]) => {
    if (value) vars.push(`${key}=${value}`);
  });
  return vars;
}

async function runTerraform(tenant, plan, job, report) {
  const directory = infrastructureDirectory(tenant, "terraform");
  requireExistingDirectory(directory, "Terraform");
  const jobDir = path.join(__dirname, "data", "jobs", job.id);
  const tfDataDir = path.join(jobDir, "terraform-data");
  fs.mkdirSync(tfDataDir, { recursive: true });
  const subscriptionId = tenantCloud(tenant) === "azure" ? await azureSubscriptionId(report) : null;
  const variables = terraformVariables(tenant, plan, subscriptionId);
  const commonEnv = { TF_DATA_DIR: tfDataDir, TF_IN_AUTOMATION: "true" };
  const backendArguments = tenantCloud(tenant) === "azure"
    ? [`-backend-config=path=${path.join(__dirname, "data", "tenants", "azure", tenant.slug, "terraform.tfstate")}`]
    : [`-backend-config=key=${tenantBackendKey(tenant)}`];
  if (tenantCloud(tenant) === "azure") {
    fs.mkdirSync(path.join(__dirname, "data", "tenants", "azure", tenant.slug), { recursive: true });
  }
  await report("Inicializando el estado aislado del tenant");
  await runCommand("terraform", [
    "init", "-input=false", "-reconfigure", "-no-color",
    ...backendArguments
  ], { cwd: directory, env: commonEnv }, report);
  await report("Aplicando red, frontend, backend y base de datos");
  const applyArgs = ["apply", "-auto-approve", "-input=false"];
  variables.forEach((value) => applyArgs.push("-var", value));
  applyArgs.push("-no-color");
  await runCommand("terraform", applyArgs, { cwd: directory, env: commonEnv }, report);
  await report("Terraform terminó correctamente");
  const output = await runCommand("terraform", ["output", "-json", "-no-color"], { cwd: directory, env: commonEnv }, report);
  const outputs = JSON.parse(output.stdout);
  return {
    frontendUrl: outputs.frontend_url?.value || null,
    frontendIp: outputs.frontend_public_ip?.value || null,
    backendIp: outputs.backend_public_ip?.value || outputs.backend_private_ip?.value || null,
    databaseIp: outputs.database_public_ip?.value || outputs.database_private_ip?.value || null,
    backendUrl: outputs.backend_url?.value || null,
  };
}

async function runPulumi(tenant, plan, job, report) {
  const directory = infrastructureDirectory(tenant, "pulumi");
  requireExistingDirectory(directory, "Pulumi");
  const stack = `tenant-${tenantCloud(tenant)}-${tenant.slug}`;
  const env = {
    PULUMI_CONFIG_PASSPHRASE: process.env.PANEL_PULUMI_PASSPHRASE || "pulumi",
    PULUMI_CONFIG_PASSPHRASE_FILE: "",
    PULUMI_SKIP_UPDATE_CHECK: "true",
    PULUMI_COLOR: "never"
  };
  await report("Creando o seleccionando el stack aislado de Pulumi");
  await runCommand("pulumi", ["stack", "select", stack, "--create"], { cwd: directory, env }, report);
  const config = [
    ["projectName", tenant.slug],
    ["databaseVolumeSize", String(plan.databaseVolumeSize)],
    ["instanceType", tenantCloud(tenant) === "azure" ? resolveAzureInstanceType(plan) : plan.instanceType]
  ];
  if (tenantCloud(tenant) === "azure") {
    const subscriptionId = await azureSubscriptionId(report);
    config.push(
      ["azure-native:subscriptionId", subscriptionId],
      ["location", process.env.PANEL_AZURE_LOCATION || "eastus2"],
      ...(process.env.PANEL_AZURE_RESOURCE_GROUP_NAME ? [["resourceGroupName", process.env.PANEL_AZURE_RESOURCE_GROUP_NAME]] : []),
      ["adminUsername", process.env.PANEL_AZURE_ADMIN_USERNAME || "azureuser"],
      ["adminSshPublicKey", requireAzureSetting("PANEL_AZURE_SSH_PUBLIC_KEY", process.env.PANEL_AZURE_SSH_PUBLIC_KEY)],
      ["databaseImageId", requireAzureSetting("PANEL_AZURE_DATABASE_IMAGE_ID", process.env.PANEL_AZURE_DATABASE_IMAGE_ID)],
      ["backendImageId", requireAzureSetting("PANEL_AZURE_BACKEND_IMAGE_ID", process.env.PANEL_AZURE_BACKEND_IMAGE_ID)],
      ["frontendImageId", requireAzureSetting("PANEL_AZURE_FRONTEND_IMAGE_ID", process.env.PANEL_AZURE_FRONTEND_IMAGE_ID)]
    );
  }
  for (const [key, value] of config) {
    await runCommand("pulumi", ["config", "set", key, value], { cwd: directory, env }, report);
  }
  await report("Aplicando el stack de Pulumi");
  await runCommand("pulumi", ["up", "--yes", "--skip-preview"], { cwd: directory, env }, report);
  await report("Pulumi terminó correctamente");
  const output = await runCommand("pulumi", ["stack", "output", "--json"], { cwd: directory, env }, report);
  const outputs = JSON.parse(output.stdout);
  const getVal = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
  return {
    frontendUrl: getVal(outputs.frontendUrl) || getVal(outputs.frontend_url) || null,
    frontendIp: getVal(outputs.frontendPublicIp) || getVal(outputs.frontend_public_ip) || null,
    backendIp: getVal(outputs.backendPublicIp) || getVal(outputs.backendPrivateIp) || getVal(outputs.backend_public_ip) || null,
    databaseIp: getVal(outputs.databasePublicIp) || getVal(outputs.databasePrivateIp) || getVal(outputs.database_public_ip) || null,
    backendUrl: getVal(outputs.backendUrl) || getVal(outputs.backend_url) || null,
  };
}

async function runAwsLifecycle(tenant, action, report) {
  if (process.env.PANEL_PROVISION_MODE !== "real") {
    await report("Modo seguro: se simuló el cambio de estado sin tocar AWS.");
    return;
  }
  const stateNames = action === "suspend" ? "running" : "stopped";
  await report(`Buscando instancias del tenant ${tenant.slug}`);
  const result = await runCommand("aws", [
    "ec2", "describe-instances",
    "--filters", `Name=tag:Project,Values=${tenant.slug}`, `Name=instance-state-name,Values=${stateNames}`,
    "--query", "Reservations[].Instances[].InstanceId",
    "--output", "text"
  ], { cwd: __dirname }, report);
  const instanceIds = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (!instanceIds.length) {
    throw new ProviderError(`No se encontraron instancias en estado ${stateNames} para ${tenant.slug}.`);
  }
  await report(`${instanceIds.length} instancia(s) encontradas.`);
  await runCommand("aws", [
    "ec2", action === "suspend" ? "stop-instances" : "start-instances",
    "--instance-ids", ...instanceIds
  ], { cwd: __dirname }, report);
  await report(action === "suspend" ? "Solicitud de detención enviada a AWS." : "Solicitud de inicio enviada a AWS.");
}

async function runAzureLifecycle(tenant, action, report) {
  if (process.env.PANEL_PROVISION_MODE !== "real") {
    await report("Modo seguro: se simuló el cambio de estado sin tocar Azure.");
    return;
  }
  const resourceGroup = process.env.PANEL_AZURE_RESOURCE_GROUP_NAME || `${tenant.slug}-rg`;
  await report(`Buscando máquinas virtuales del tenant en ${resourceGroup}`);
  const result = await runCommand("az", [
    "vm", "list", "--resource-group", resourceGroup,
    "--query", `[?tags.Project=='${tenant.slug}'].id`, "--output", "tsv"
  ], { cwd: __dirname }, report);
  const ids = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (!ids.length) throw new ProviderError(`No se encontraron máquinas virtuales en ${resourceGroup}.`);
  await report(`${ids.length} máquina(s) virtual(es) encontrada(s).`);
  await runCommand("az", [
    "vm", action === "suspend" ? "deallocate" : "start",
    "--ids", ...ids
  ], { cwd: __dirname }, report);
  await report(action === "suspend" ? "Solicitud de desasignación enviada a Azure." : "Solicitud de inicio enviada a Azure.");
}

async function runCloudLifecycle(tenant, action, report) {
  return tenantCloud(tenant) === "azure"
    ? runAzureLifecycle(tenant, action, report)
    : runAwsLifecycle(tenant, action, report);
}

async function executeProvisioning(tenant, plan, job, report) {
  if (!SUPPORTED_CLOUDS.has(tenantCloud(tenant))) {
    throw new ProviderError(`${tenantCloud(tenant)} no está habilitado como nube.`);
  }
  if (!SUPPORTED_PROVIDERS.has(tenant.provider)) {
    throw new ProviderError(`${tenant.provider} aparece en el catálogo, pero todavía no está habilitado.`);
  }
  const terraformDirectory = infrastructureDirectory(tenant, "terraform");
  requireExistingDirectory(terraformDirectory, "Terraform");
  await runSecurityScans(terraformDirectory, report);
  if (process.env.PANEL_PROVISION_MODE !== "real") {
    const messages = [
      `Modo seguro activo: no se crearán recursos en ${tenantCloud(tenant).toUpperCase()}.`,
      `Plan ${plan.name}: ${plan.databaseVolumeSize} GB de base de datos.`,
      `Motor seleccionado: ${tenant.provider}.`,
      "Validación de aislamiento y parámetros completada.",
      "Simulación finalizada correctamente."
    ];
    for (const message of messages) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await report(message);
    }
    return null;
  }
  if (tenant.provider === "terraform") return runTerraform(tenant, plan, job, report);
  return runPulumi(tenant, plan, job, report);
}

async function destroyProvisioning(tenant, job, report) {
  if (process.env.PANEL_PROVISION_MODE !== "real") {
    await report(`Modo seguro: se simuló la eliminación sin tocar ${tenantCloud(tenant).toUpperCase()}.`);
    return;
  }
  if (tenant.provider === "pulumi") {
    const directory = infrastructureDirectory(tenant, "pulumi");
    const stack = `tenant-${tenantCloud(tenant)}-${tenant.slug}`;
    const env = {
      PULUMI_CONFIG_PASSPHRASE: process.env.PANEL_PULUMI_PASSPHRASE || "pulumi",
      PULUMI_CONFIG_PASSPHRASE_FILE: "",
      PULUMI_SKIP_UPDATE_CHECK: "true",
      PULUMI_COLOR: "never"
    };
    requireExistingDirectory(directory, "Pulumi");
    await report("Seleccionando el stack de Pulumi para eliminarlo");
    await runCommand("pulumi", ["stack", "select", stack], { cwd: directory, env }, report);
    await report("Eliminando los recursos administrados por Pulumi");
    await runCommand("pulumi", ["destroy", "--yes", "--skip-preview"], { cwd: directory, env }, report);
    return;
  }
  if (tenant.provider !== "terraform") {
    throw new ProviderError(`${tenant.provider} no tiene un adaptador de eliminación habilitado.`);
  }
  const directory = infrastructureDirectory(tenant, "terraform");
  const tfDataDir = path.join(__dirname, "data", "jobs", job.id, "terraform-data");
  fs.mkdirSync(tfDataDir, { recursive: true });
  const env = { TF_DATA_DIR: tfDataDir, TF_IN_AUTOMATION: "true" };
  await report("Inicializando el estado del tenant para eliminarlo");
  const backendArguments = tenantCloud(tenant) === "azure"
    ? [`-backend-config=path=${path.join(__dirname, "data", "tenants", "azure", tenant.slug, "terraform.tfstate")}`]
    : [`-backend-config=key=${tenantBackendKey(tenant)}`];
  if (tenantCloud(tenant) === "azure") {
    fs.mkdirSync(path.join(__dirname, "data", "tenants", "azure", tenant.slug), { recursive: true });
  }
  await runCommand("terraform", [
    "init", "-input=false", "-reconfigure", "-no-color",
    ...backendArguments
  ], { cwd: directory, env }, report);
  await report("Eliminando los recursos administrados por Terraform");
  const destroyArgs = ["destroy", "-auto-approve", "-input=false", "-no-color", `-var=project_name=${tenant.slug}`];
  if (tenantCloud(tenant) === "azure") {
    const subscriptionId = await azureSubscriptionId(report);
    [
      `azure_subscription_id=${subscriptionId}`,
      `azure_location=${process.env.PANEL_AZURE_LOCATION || "eastus2"}`,
      ...(process.env.PANEL_AZURE_RESOURCE_GROUP_NAME ? [`azure_resource_group_name=${process.env.PANEL_AZURE_RESOURCE_GROUP_NAME}`] : []),
      `azure_instance_type=${resolveAzureInstanceType()}`,
      `database_image_id=${requireAzureSetting("PANEL_AZURE_DATABASE_IMAGE_ID", process.env.PANEL_AZURE_DATABASE_IMAGE_ID)}`,
      `backend_image_id=${requireAzureSetting("PANEL_AZURE_BACKEND_IMAGE_ID", process.env.PANEL_AZURE_BACKEND_IMAGE_ID)}`,
      `frontend_image_id=${requireAzureSetting("PANEL_AZURE_FRONTEND_IMAGE_ID", process.env.PANEL_AZURE_FRONTEND_IMAGE_ID)}`,
      `admin_ssh_public_key=${requireAzureSetting("PANEL_AZURE_SSH_PUBLIC_KEY", process.env.PANEL_AZURE_SSH_PUBLIC_KEY)}`
    ].forEach((value) => destroyArgs.push("-var", value));
  }
  await runCommand("terraform", destroyArgs, {
    cwd: directory,
    env
  }, report);
}

module.exports = {
  DISPLAY_PROVIDERS,
  DISPLAY_CLOUDS,
  SUPPORTED_PROVIDERS,
  SUPPORTED_CLOUDS,
  ProviderError,
  executeProvisioning,
  destroyProvisioning,
  runAwsLifecycle,
  runCloudLifecycle,
  cloudList,
  providerList,
  sanitizeTenantId
};
