variable "project_name" {
  description = "Identificador único del tenant."
  type        = string
}

variable "azure_subscription_id" {
  description = "Suscripción de Azure. El panel la obtiene del Azure CLI."
  type        = string
}

variable "azure_location" {
  description = "Región de Azure."
  type        = string
  default     = "eastus2"
}

variable "azure_resource_group_name" {
  description = "Grupo de recursos del tenant. Si está vacío se genera uno."
  type        = string
  default     = ""
}

variable "azure_instance_type" {
  description = "Tamaño de las máquinas virtuales Azure."
  type        = string
  default     = "Standard_D2ads_v7"
}

variable "database_image_id" {
  description = "ID de la imagen administrada Azure para PostgreSQL."
  type        = string
}

variable "backend_image_id" {
  description = "ID de la imagen administrada Azure para el backend."
  type        = string
}

variable "frontend_image_id" {
  description = "ID de la imagen administrada Azure para el frontend."
  type        = string
}

variable "database_volume_size" {
  description = "Tamaño del disco de datos de PostgreSQL en GB."
  type        = number
  default     = 10

  validation {
    condition     = var.database_volume_size >= 10
    error_message = "database_volume_size debe ser como mínimo 10 GB."
  }
}

variable "admin_username" {
  description = "Usuario SSH de las máquinas Azure."
  type        = string
  default     = "azureuser"
}

variable "admin_ssh_public_key" {
  description = "Clave pública SSH para acceder a las máquinas Azure."
  type        = string
}

variable "backend_repository" {
  description = "Repositorio Git del backend."
  type        = string
  default     = "https://github.com/JoseSC30/backend-control-asistencia.git"
}

variable "frontend_repository" {
  description = "Repositorio Git del frontend."
  type        = string
  default     = "https://github.com/JoseSC30/frontend-control-asistencia.git"
}

variable "repository_branch" {
  description = "Rama de los repositorios."
  type        = string
  default     = "main"
}

variable "application_user" {
  description = "Usuario Linux de la aplicación."
  type        = string
  default     = "app"
}

variable "database_name" {
  description = "Nombre de la base de datos."
  type        = string
  default     = "appdb"
}

variable "database_user" {
  description = "Usuario de PostgreSQL."
  type        = string
  default     = "appuser"
}
