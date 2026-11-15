output "database_public_ip" {
  description = "IP pública de la instancia de base de datos."
  value       = aws_instance.database.public_ip
}

output "backend_public_ip" {
  description = "IP pública de la instancia backend."
  value       = aws_instance.backend.public_ip
}

output "frontend_public_ip" {
  description = "IP pública de la instancia del frontend."
  value       = aws_instance.frontend.public_ip
}

output "frontend_url" {
  description = "URL pública del frontend."
  value       = "http://${aws_instance.frontend.public_ip}"
}

output "backend_url" {
  description = "URL pública de comprobación del backend."
  value       = "http://${aws_instance.backend.public_ip}"
}

output "database_private_ip" {
  description = "IP privada de la instancia usada por el backend para PostgreSQL."
  value       = aws_instance.database.private_ip
}

output "backend_private_ip" {
  description = "IP privada de la instancia backend."
  value       = aws_instance.backend.private_ip
}
