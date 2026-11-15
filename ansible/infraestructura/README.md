# Infraestructura Terraform para la aplicacion

Este proyecto crea tres instancias EC2 Ubuntu en la VPC predeterminada:

- `database`: PostgreSQL.
- `backend`: API Node.js.
- `frontend`: build de Vite servido por Nginx.

Terraform solo crea la infraestructura base. La instalacion de paquetes, la
configuracion de PostgreSQL, el despliegue de Node.js y la publicacion del
frontend se realizan con Ansible.

## Requisitos

- Terraform 1.5 o superior.
- AWS CLI configurado (`aws sts get-caller-identity`).
- El par de claves local `keys\aws_ec2_key` y `keys\aws_ec2_key.pub`.

Terraform registra automáticamente la clave pública en AWS mediante
`aws_key_pair`; la clave privada permanece local y nunca se envía a AWS.

## Crear las tres instancias

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
# Revisar region, AMI, repositorios y ssh_cidr_blocks.
terraform init
terraform plan
terraform apply
```

La configuración abre SSH a las tres instancias, PostgreSQL únicamente desde
el backend, y el puerto 3000 únicamente desde el frontend. El puerto 80 solo
se publica en el frontend.

## Ejecutar Ansible

Desde la carpeta `ansible`, con WSL y el entorno virtual activos:

```bash
export ANSIBLE_CONFIG="$PWD/ansible.cfg"
ansible-inventory --graph
ansible-playbook site.yml
```

El inventario busca la etiqueta `Project=control-asistencia-ansible` y agrupa
las instancias por `Role`.

## Outputs

```powershell
terraform output database_public_ip
terraform output backend_public_ip
terraform output frontend_public_ip
terraform output frontend_url
```

Para destruir las tres instancias:

```powershell
terraform destroy
```
