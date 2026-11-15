# Imágenes Ubuntu con Packer

Este directorio crea tres AMIs independientes para el despliegue:

- `database`: PostgreSQL, Git y curl.
- `backend`: Node.js 20, Nginx, cliente PostgreSQL, Git y curl.
- `frontend`: Node.js 20, Nginx, Git y curl.

Las imágenes no incluyen repositorios, credenciales, secretos ni datos de la
base de datos. Terraform y `cloud-init` configuran cada instancia al arrancar.

## Requisitos

- AWS CLI configurado y con permisos para EC2, EBS y creación de AMIs.
- Packer instalado.
- Una subred con salida a Internet para que Packer instale paquetes.

## Crear las AMIs

Desde este directorio:

```powershell
Copy-Item packer.auto.pkrvars.hcl.example packer.auto.pkrvars.hcl
# Editar subnet_id y, si corresponde, aws_profile.
packer init .
packer fmt .
packer validate .
packer build .
```

Al finalizar, Packer mostrará los tres IDs de AMI. Deben copiarse en
`terraform.tfvars` como `database_ami_id`, `backend_ami_id` y
`frontend_ami_id`.

Las AMIs se crean en la región indicada. Para usarlas en otra región deben
construirse o copiarse allí.
