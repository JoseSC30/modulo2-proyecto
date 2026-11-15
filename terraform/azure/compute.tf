resource "azurerm_linux_virtual_machine" "database" {
  name                            = "${var.project_name}-database"
  computer_name                   = "${var.project_name}-db"
  resource_group_name             = azurerm_resource_group.tenant.name
  location                        = azurerm_resource_group.tenant.location
  size                            = var.azure_instance_type
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.database.id]
  source_image_id                 = var.database_image_id
  disk_controller_type            = "NVMe"
  custom_data = base64encode(templatefile("${path.module}/cloud-init/database.yaml", {
    application_user   = var.application_user
    database_name      = var.database_name
    database_user      = var.database_user
    database_password  = random_password.database.result
    vpc_cidr           = local.address_space
    backend_repository = var.backend_repository
    repository_branch  = var.repository_branch
    database_data_disk = "/dev/disk/azure/data/by-lun/0"
  }))
  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }
  os_disk {
    name                 = "${var.project_name}-database-os"
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 30
  }
  tags = {
    Project = var.project_name
    Role    = "database"
  }
}

resource "azurerm_virtual_machine_data_disk_attachment" "database" {
  managed_disk_id    = azurerm_managed_disk.database_data.id
  virtual_machine_id = azurerm_linux_virtual_machine.database.id
  lun                = 0
  caching            = "ReadWrite"
}

resource "azurerm_linux_virtual_machine" "backend" {
  name                            = "${var.project_name}-backend"
  computer_name                   = "${var.project_name}-api"
  resource_group_name             = azurerm_resource_group.tenant.name
  location                        = azurerm_resource_group.tenant.location
  size                            = var.azure_instance_type
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.backend.id]
  source_image_id                 = var.backend_image_id
  disk_controller_type            = "NVMe"
  custom_data = base64encode(templatefile("${path.module}/cloud-init/backend.yaml", {
    application_user    = var.application_user
    backend_repository  = var.backend_repository
    repository_branch   = var.repository_branch
    database_private_ip = azurerm_network_interface.database.private_ip_address
    database_name       = var.database_name
    database_user       = var.database_user
    database_password   = random_password.database.result
    jwt_secret          = random_password.jwt_secret.result
  }))
  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }
  os_disk {
    name                 = "${var.project_name}-backend-os"
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 30
  }
  tags = {
    Project = var.project_name
    Role    = "backend"
  }
}

resource "azurerm_linux_virtual_machine" "frontend" {
  name                            = "${var.project_name}-frontend"
  computer_name                   = "${var.project_name}-web"
  resource_group_name             = azurerm_resource_group.tenant.name
  location                        = azurerm_resource_group.tenant.location
  size                            = var.azure_instance_type
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.frontend.id]
  source_image_id                 = var.frontend_image_id
  disk_controller_type            = "NVMe"
  custom_data = base64encode(templatefile("${path.module}/cloud-init/frontend.yaml", {
    application_user   = var.application_user
    backend_private_ip = azurerm_network_interface.backend.private_ip_address
    repository_url     = var.frontend_repository
    repository_branch  = var.repository_branch
  }))
  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }
  os_disk {
    name                 = "${var.project_name}-frontend-os"
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 30
  }
  tags = {
    Project = var.project_name
    Role    = "frontend"
  }
}
