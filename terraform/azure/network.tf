locals {
  resource_group_name = var.azure_resource_group_name != "" ? var.azure_resource_group_name : "${var.project_name}-rg"
  address_space       = "10.0.0.0/16"
  subnet_prefix       = "10.0.1.0/24"
}

resource "azurerm_resource_group" "tenant" {
  name     = local.resource_group_name
  location = var.azure_location
  tags = {
    Project = var.project_name
    Managed = "panel-tenant"
  }
}

resource "azurerm_virtual_network" "tenant" {
  name                = "${var.project_name}-vnet"
  location            = azurerm_resource_group.tenant.location
  resource_group_name = azurerm_resource_group.tenant.name
  address_space       = [local.address_space]
}

resource "azurerm_subnet" "tenant" {
  name                 = "${var.project_name}-subnet"
  resource_group_name  = azurerm_resource_group.tenant.name
  virtual_network_name = azurerm_virtual_network.tenant.name
  address_prefixes     = [local.subnet_prefix]
}

# Solo el frontend tiene IP pública. Backend y database usan solo IPs privadas
# para no exceder el límite de 3 IPs públicas por región de la suscripción.

resource "azurerm_public_ip" "frontend" {
  name                = "${var.project_name}-frontend-ip"
  location            = azurerm_resource_group.tenant.location
  resource_group_name = azurerm_resource_group.tenant.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "database" {
  name                = "${var.project_name}-database-nic"
  location            = azurerm_resource_group.tenant.location
  resource_group_name = azurerm_resource_group.tenant.name
  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.tenant.id
    private_ip_address_allocation = "Dynamic"
  }
}

resource "azurerm_network_interface" "backend" {
  name                = "${var.project_name}-backend-nic"
  location            = azurerm_resource_group.tenant.location
  resource_group_name = azurerm_resource_group.tenant.name
  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.tenant.id
    private_ip_address_allocation = "Dynamic"
  }
}

resource "azurerm_network_interface" "frontend" {
  name                = "${var.project_name}-frontend-nic"
  location            = azurerm_resource_group.tenant.location
  resource_group_name = azurerm_resource_group.tenant.name
  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.tenant.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.frontend.id
  }
}
