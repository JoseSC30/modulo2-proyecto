# Proyecto Terraform: backend y PostgreSQL

Este directorio es un proyecto independiente del despliegue anterior. Usa
la clave `terraform/backend-db-app/terraform.tfstate` del backend S3, por lo
que no lee ni modifica el estado anterior.

## Recursos

- Una instancia EC2 para el backend con PostgreSQL.
- Una instancia EC2 para el frontend.
- No se configura key pair: el acceso administrativo se realizará mediante
  EC2 Instance Connect en la consola de AWS. El puerto SSH queda abierto para
  permitir esa conexión; conviene restringirlo posteriormente al rango
  publicado por AWS para EC2 Instance Connect.
- La VPC predeterminada se consulta, pero no se administra.
- `cloud-init` instala Node.js, PostgreSQL y Nginx, crea los servicios
  systemd, carga `schema.sql`, crea el usuario de aplicación y clona los
  repositorios indicados en las variables.

El backend escucha en el puerto 3000 dentro de la VPC. El frontend se
construye con Vite usando `/api` y Nginx hace proxy interno hacia el backend;
los usuarios solo necesitan acceder al frontend por el puerto 80.

## Uso

1. Configura el perfil de AWS:

   ```powershell
   aws configure
   aws sts get-caller-identity
   ```

2. Copia `terraform.tfvars.example` como `terraform.tfvars` y reemplaza las
   URLs de GitHub y los valores del proyecto.

3. Inicializa este estado independiente:

   ```powershell
   terraform init -reconfigure
   terraform plan
   terraform apply
   ```

   Las plantillas se ejecutan durante el primer arranque. Para diagnosticar una
   instancia desde EC2 Instance Connect:

   ```bash
   cloud-init status --long
   tail -n 100 /var/log/cloud-init-output.log
   systemctl status nginx --no-pager
   systemctl status control-asistencia-backend --no-pager
   nginx -T
   ls -la /etc/nginx/sites-enabled /var/www/control-asistencia
   ```

   No agregues `terraform.tfvars`, credenciales AWS ni archivos de estado al
   repositorio.
