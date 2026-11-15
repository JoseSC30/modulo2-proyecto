# Automatización con Ansible

Esta carpeta administra las tres EC2 creadas por
[`infraestructura`](./infraestructura/README.md) usando el inventario dinámico
`amazon.aws.aws_ec2`. El inventario consulta AWS, filtra las instancias con
`Role=database`, `Role=backend` y `Role=frontend`, y usa sus IP públicas como
`ansible_host`.

## Requisitos

- Ansible Core.
- Colección `amazon.aws`.
- Python con `boto3` y `botocore` en el entorno desde el que se ejecuta
  Ansible.
- Credenciales AWS disponibles para Terraform y para el inventario dinámico.
- El key pair `aws_ec2_key` registrado en AWS y su clave privada local
  `keys\aws_ec2_key`.
- La colección `community.postgresql` y `psycopg2`, instaladas mediante los
  archivos de requisitos.

Instalar la colección:

```powershell
python -m pip install -r requirements.txt
ansible-galaxy collection install -r requirements.yml
```

Cuando el proyecto está en una unidad de Windows montada en WSL
(`/mnt/c`, `/mnt/d`, etc.), Ansible puede ignorar `ansible.cfg` porque
considera esa carpeta escribible por todos. Desde la carpeta `ansible`,
configura explícitamente el archivo antes de ejecutar los comandos:

```bash
export ANSIBLE_CONFIG="$PWD/ansible.cfg"
```

Para dejarlo permanente en WSL:

```bash
echo 'export ANSIBLE_CONFIG="/mnt/d/Universidad/Diplomado/MODULO 2/proyecto-completo/ansible/ansible.cfg"' >> ~/.bashrc
source ~/.bashrc
```

Comprueba que Ansible está usando la configuración del proyecto:

```bash
ansible-config dump --only-changed
```

La ruta de la clave ya está configurada en `ansible.cfg`, por lo que los
playbooks usarán automáticamente `~/.ssh/aws_ec2_key` desde WSL. Si todavía
no la copiaste allí:

```bash
mkdir -p ~/.ssh
cp "/mnt/d/Universidad/Diplomado/MODULO 2/proyecto-completo/keys/aws_ec2_key" ~/.ssh/aws_ec2_key
chmod 600 ~/.ssh/aws_ec2_key
```

## Playbooks

Listar los hosts descubiertos:

```powershell
ansible-inventory --graph
```

Probar conectividad:

```powershell
ansible-playbook playbooks\ping.yml
```

Instalar paquetes base:

```powershell
ansible-playbook playbooks\install_packages.yml
```

Ejecutar todo en orden:

```powershell
ansible-playbook site.yml
```

El playbook completo instala PostgreSQL en `database`, Node.js y el backend en
`backend`, y Node.js, el build del frontend y Nginx en `frontend`. También
carga `schema.sql`, crea el servicio systemd del backend y configura el proxy
`/api` del frontend.

Las contraseñas se generan una sola vez en el controlador Ansible mediante
archivos dentro de `.cache/`, que está excluido de Git. No se deben imprimir
ni versionar esos archivos.

Para ejecutar una etapa concreta:

```bash
ansible-playbook playbooks/database.yml
ansible-playbook playbooks/backend.yml
ansible-playbook playbooks/frontend.yml
```
