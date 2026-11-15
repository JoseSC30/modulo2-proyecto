# Imágenes Ubuntu para Azure

Este directorio crea tres imágenes administradas independientes para Azure:

- `database`: PostgreSQL, Git y curl.
- `backend`: Node.js 20, Nginx, cliente PostgreSQL, Git y curl.
- `frontend`: Node.js 20, Nginx, Git y curl.

## Requisitos

- Azure CLI instalado y autenticado con `az login`.
- Packer instalado.
- Un grupo de recursos existente para las imágenes.
- Permisos para crear máquinas temporales e imágenes administradas.

Crear los grupos de recursos una sola vez:

```powershell
az group create --name rg-control-asistencia-images --location eastus2
```

## Crear las imágenes

Desde este directorio:

```powershell
Copy-Item packer.auto.pkrvars.hcl.example packer.auto.pkrvars.hcl
# Editar la suscripción y el grupo de imágenes.
packer init .
packer fmt .
packer validate .
packer build .
```

El resultado serán tres IDs de imagen administrada. Deben configurarse en el
panel como `PANEL_AZURE_DATABASE_IMAGE_ID`, `PANEL_AZURE_BACKEND_IMAGE_ID` y
`PANEL_AZURE_FRONTEND_IMAGE_ID`.
