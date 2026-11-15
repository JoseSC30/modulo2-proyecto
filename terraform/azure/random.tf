resource "random_password" "database" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "azurerm_managed_disk" "database_data" {
  name                 = "${var.project_name}-database-data"
  location             = azurerm_resource_group.tenant.location
  resource_group_name  = azurerm_resource_group.tenant.name
  storage_account_type = "Standard_LRS"
  create_option        = "Empty"
  disk_size_gb         = var.database_volume_size
}
