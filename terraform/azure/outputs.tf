output "resource_group_name" {
  value = azurerm_resource_group.tenant.name
}

output "frontend_public_ip" {
  value = azurerm_public_ip.frontend.ip_address
}

output "frontend_url" {
  value = "http://${azurerm_public_ip.frontend.ip_address}"
}

output "backend_url" {
  value = "http://${azurerm_network_interface.backend.private_ip_address}"
}

output "database_private_ip" {
  value = azurerm_network_interface.database.private_ip_address
}

output "backend_private_ip" {
  value = azurerm_network_interface.backend.private_ip_address
}

output "backend_public_ip" {
  value = ""
}

output "database_public_ip" {
  value = ""
}
