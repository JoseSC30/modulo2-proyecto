output "database_public_ip" {
  description = "IP publica de la instancia PostgreSQL."
  value       = aws_instance.database.public_ip
}

output "backend_public_ip" {
  description = "IP publica de la instancia backend."
  value       = aws_instance.backend.public_ip
}

output "frontend_public_ip" {
  description = "IP publica de la instancia frontend."
  value       = aws_instance.frontend.public_ip
}

output "frontend_url" {
  description = "URL publica del frontend."
  value       = "http://${aws_instance.frontend.public_ip}"
}
