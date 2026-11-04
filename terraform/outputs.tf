output "backend_db_public_ip" {
  description = "IP pública de la instancia backend con PostgreSQL."
  value       = aws_instance.backend_db.public_ip
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
  value       = "http://${aws_instance.backend_db.public_ip}"
}

output "backend_db_private_ip" {
  description = "IP privada usada por el backend para PostgreSQL."
  value       = aws_instance.backend_db.private_ip
}
