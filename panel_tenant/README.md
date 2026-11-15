# Orbit Tenant Desk

Panel web local para administrar instituciones de la plataforma Control de
Asistencias. Incluye login de administrador, catálogo de planes, creación de
tenants, jobs asíncronos, reintentos, suspensión, reanudación, eliminación con
confirmación, auditoría y una base para Prometheus/Grafana.

La aplicación usa Node.js y un archivo JSON local para que pueda arrancar sin
instalar PostgreSQL. El almacenamiento está encapsulado en `store.js` para
poder cambiarlo por PostgreSQL después sin modificar las pantallas ni la API.

## Inicio local

Requiere Node.js 18 o superior.

```powershell
cd panel_tenant
Copy-Item .env.example .env
# Editar .env y cambiar PANEL_ADMIN_PASSWORD.
npm start
```

Abrir <http://127.0.0.1:4173>. El usuario inicial es el valor de
`PANEL_ADMIN_USER` y la contraseña la definida en `PANEL_ADMIN_PASSWORD`.

Por seguridad, el panel arranca en `PANEL_PROVISION_MODE=dry-run`. En ese modo
se valida y simula el flujo sin crear recursos. Para ejecutar AWS de verdad:

```powershell
$env:PANEL_PROVISION_MODE = "real"
npm start
```

También se puede cambiar en `.env`. Para AWS, Terraform debe tener sus AMIs y
credenciales configuradas. Para Azure, ejecuta `az login` y configura la
suscripción, las tres imágenes administradas de Packer y una clave pública SSH
en las variables `PANEL_AZURE_*` de `.env`. El panel crea un estado aislado por
tenant: AWS usa la clave `terraform/tenants/<slug>/terraform.tfstate` y Azure
usa `panel_tenant/data/tenants/azure/<slug>/terraform.tfstate`.

El formulario permite elegir AWS o Azure independientemente de Terraform o
Pulumi. Cada nube crea frontend, backend y base de datos en recursos separados;
los tenants antiguos sin campo `cloud` se interpretan como AWS.

Pulumi usa un stack separado por tenant y la passphrase configurada en
`PANEL_PULUMI_PASSPHRASE` (por defecto, `pulumi`). Terraform y Pulumi son los
únicos motores habilitados. OpenTofu y CloudFormation aparecen en el catálogo
para dejar preparada la futura expansión, pero no ejecutan operaciones.

## Análisis de seguridad y calidad

Antes de cada aprovisionamiento, el panel ejecuta Checkov, tfsec y TFLint
contra la configuración Terraform. Los tres resultados quedan registrados en
los logs del trabajo. Los hallazgos, advertencias o incluso la ausencia de un
ejecutable no bloquean la creación del tenant; el aprovisionamiento continúa.
Cuando se elige Pulumi, estos escáneres revisan la configuración Terraform
base, ya que las herramientas no analizan el programa Pulumi TypeScript.

En Windows se pueden instalar así:

```powershell
py -m pip install --user checkov
winget install --id TerraformLinters.tflint
```

tfsec puede descargarse desde sus releases oficiales y dejarse en el `PATH`.
También se pueden indicar rutas concretas en `.env` usando
`PANEL_CHECKOV_COMMAND`, `PANEL_TFSEC_COMMAND` y `PANEL_TFLINT_COMMAND`.
El panel detecta automáticamente las instalaciones habituales de estos
ejecutables en Windows, incluso cuando VS Code todavía no ha actualizado su
`PATH`.

## Planes incluidos

- **Básico:** 10 GB de disco para la base de datos y `t2.micro` (1 GB de RAM).
- **Estándar:** 20 GB de disco para la base de datos y `t2.small` (2 GB de RAM).
- **Avanzado:** 50 GB, `t3.medium`, hasta 5,000 estudiantes y retención de
  respaldo por 30 días.

En Azure los tamaños equivalentes del catálogo son `Standard_F1as_v7`,
`Standard_D2as_v7` y `Standard_D2ads_v7`.

Cada tenant conserva su identificador, plan, entorno, motor, estado, trabajos
y eventos de auditoría. La implementación real delega el aprovisionamiento a
Terraform/Pulumi; no guarda claves AWS ni contraseñas de tenants en el código.

## Métricas

La sección Monitoreo registra URLs de Prometheus y Grafana, el último intento
de sincronización y la cantidad de tenants activos. No inventa métricas cuando
Grafana todavía no está desplegado. El siguiente paso será añadir un exporter
por tenant y dashboards provisionados.
