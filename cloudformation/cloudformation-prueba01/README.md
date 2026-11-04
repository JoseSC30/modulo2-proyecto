# CloudFormation: Control de Asistencia

Esta plantilla crea recursos independientes de Terraform y Pulumi:

- Backend Node.js + PostgreSQL.
- Frontend React/Vite servido por Nginx.
- Security groups e instancias con nombres `cfn-control-asistencia-*`.
- Cloud-init ejecutado mediante `UserData`.
- Acceso administrativo sin key pair mediante EC2 Instance Connect.
- La VPC predeterminada no se administra.

Las copias de referencia de las plantillas están en `cloud-init/`.
CloudFormation no lee archivos locales durante el despliegue, por lo que una
versión equivalente de su contenido también está embebida en `template.yaml`.

## Despliegue

Desde AWS CloudFormation, crea un stack usando `template.yaml` y proporciona:

- `DatabasePassword`: mínimo 16 caracteres.
- `JwtSecret`: mínimo 32 caracteres.
- Región y zona compatibles, por defecto `us-east-2` / `us-east-2a`.
- `LatestAmiId`, por defecto `ami-0fc53b217ec1ad816`, una AMI Ubuntu 24.04
  válida en `us-east-2`. Debe cambiarse si se despliega en otra región.

Si utilizas Git Sync, reemplaza los valores `REPLACE_WITH_*` de
`cfn-deplyment.json` antes de sincronizar. Son placeholders intencionales y no
deben llegar a producción.

También puedes usar AWS CLI:

```powershell
aws cloudformation deploy `
  --template-file template.yaml `
  --stack-name cfn-control-asistencia `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides DatabasePassword="cambia-esta-clave" JwtSecret="cambia-este-secreto-largo"
```

Para eliminar solo los recursos de este stack:

```powershell
aws cloudformation delete-stack --stack-name cfn-control-asistencia
```

Terraform, Pulumi y CloudFormation usan nombres y estados separados. Pueden
coexistir sin administrar los recursos de los otros proyectos.
