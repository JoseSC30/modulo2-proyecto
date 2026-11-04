# Pulumi: Control de Asistencia

Este proyecto crea la misma infraestructura que Terraform, pero con nombres
y estado propios para poder coexistir con Terraform:

- `pulumi-control-asistencia-2026-backend-db`: backend Node.js + PostgreSQL.
- `pulumi-control-asistencia-2026-frontend`: frontend React/Vite servido por Nginx.
- Security groups separados y etiquetados con `pulumi-control-asistencia-2026`.
- La VPC predeterminada se consulta, pero no se administra.
- Las instancias usan EC2 Instance Connect; no se configura key pair.
- El contenido de `cloud-init/` se copia desde la implementación funcional de
  Terraform y se renderiza con valores de Pulumi.

## Uso

Desde esta carpeta:

```powershell
npm install
pulumi stack init dev
pulumi config set aws:region us-east-2
```

Si la configuración del stack está cifrada, define la misma passphrase usada
para `Pulumi.dev.yaml`:

```powershell
$env:PULUMI_CONFIG_PASSPHRASE = "tu-passphrase"
pulumi preview
pulumi up
```

Los valores opcionales se pueden cambiar así:

```powershell
pulumi config set projectName pulumi-control-asistencia-2026
pulumi config set backendRepository https://github.com/JoseSC30/backend-control-asistencia.git
pulumi config set frontendRepository https://github.com/JoseSC30/frontend-control-asistencia.git
```

Para eliminar únicamente los recursos administrados por Pulumi:

```powershell
pulumi destroy
```

Terraform usa sus propios nombres, estado y recursos. No reutilices el mismo
stack/estado de Pulumi para administrar recursos Terraform.
