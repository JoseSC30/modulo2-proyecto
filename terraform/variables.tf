variable "project_name" {
  description = "Prefijo único para los recursos de este proyecto."
  type        = string
  default     = "backend-db-app-2026"
}

variable "aws_region" {
  description = "Región de AWS donde se crearán los recursos."
  type        = string
  default     = "us-east-2"
}

variable "availability_zone" {
  description = "Zona de disponibilidad para las instancias EC2."
  type        = string
  default     = "us-east-2a"
}

variable "instance_type" {
  description = "Tipo de instancia EC2."
  type        = string
  default     = "t2.micro"
}

variable "ami_id" {
  description = "ID fijo de la AMI de Ubuntu utilizada por las instancias."
  type        = string
  default     = "ami-09519cc56eb20524a"
}

variable "backend_db_repository" {
  description = "URL HTTPS del repositorio GitHub para el backend con PostgreSQL."
  type        = string
  default     = "https://github.com/JoseSC30/backend-control-asistencia.git"
}

variable "frontend_repository" {
  description = "URL HTTPS del repositorio GitHub para el frontend."
  type        = string
  default     = "https://github.com/JoseSC30/frontend-control-asistencia.git"
}

variable "repository_branch" {
  description = "Rama que se clonará en ambas instancias."
  type        = string
  default     = "main"
}

variable "application_user" {
  description = "Usuario Linux que será propietario de los repositorios clonados."
  type        = string
  default     = "app"
}

variable "database_name" {
  description = "Nombre de la base de datos PostgreSQL."
  type        = string
  default     = "appdb"
}

variable "database_user" {
  description = "Usuario de PostgreSQL para la aplicación."
  type        = string
  default     = "appuser"
}
