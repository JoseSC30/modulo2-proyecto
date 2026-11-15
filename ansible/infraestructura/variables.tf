variable "project_name" {
  description = "Prefijo de los recursos y etiqueta que usa el inventario de Ansible."
  type        = string
  default     = "control-asistencia-ansible"
}

variable "aws_region" {
  description = "Región de AWS donde se creará la instancia."
  type        = string
  default     = "us-east-2"
}

variable "availability_zone" {
  description = "Zona de disponibilidad de la instancia."
  type        = string
  default     = "us-east-2a"
}

variable "instance_type" {
  description = "Tipo de instancia EC2."
  type        = string
  default     = "t2.micro"
}

variable "ami_id" {
  description = "AMI Ubuntu compatible con la región seleccionada."
  type        = string
  default     = "ami-09519cc56eb20524a"
}

variable "key_name" {
  description = "Nombre del key pair registrado en AWS para acceder por SSH."
  type        = string
  default     = "aws_ec2_key"
}

variable "ssh_cidr_blocks" {
  description = "CIDR autorizado para SSH. Reducirlo a la IP pública del administrador."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
