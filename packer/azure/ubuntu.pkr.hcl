packer {
  required_plugins {
    azure = {
      version = ">= 2.6.0"
      source  = "github.com/hashicorp/azure"
    }
  }
}

variable "azure_subscription_id" {
  type = string
}

variable "azure_tenant_id" {
  type    = string
  default = ""
}

variable "azure_location" {
  type    = string
  default = "eastus2"
}

variable "azure_image_resource_group" {
  type = string
}

variable "project_name" {
  type    = string
  default = "control-asistencia"
}

variable "azure_vm_size" {
  type    = string
  default = "Standard_D2ads_v7"
}

locals {
  image_prefix = "${var.project_name}-${formatdate("YYYYMMDDhhmmss", timestamp())}"
}

source "azure-arm" "database" {
  use_azure_cli_auth                = true
  subscription_id                   = var.azure_subscription_id
  tenant_id                         = var.azure_tenant_id
  location                          = var.azure_location
  managed_image_resource_group_name = var.azure_image_resource_group
  managed_image_name                = "${local.image_prefix}-database"
  vm_size                           = var.azure_vm_size
  disk_controller_type              = "NVMe"
  os_type                           = "Linux"
  image_publisher                   = "Canonical"
  image_offer                       = "ubuntu-24_04-lts"
  image_sku                         = "server"
  image_version                     = "latest"
  communicator                      = "ssh"
  ssh_username                      = "azureuser"
  os_disk_size_gb                   = 30
  azure_tags = {
    Project = var.project_name
    Role    = "database"
  }
}

source "azure-arm" "backend" {
  use_azure_cli_auth                = true
  subscription_id                   = var.azure_subscription_id
  tenant_id                         = var.azure_tenant_id
  location                          = var.azure_location
  managed_image_resource_group_name = var.azure_image_resource_group
  managed_image_name                = "${local.image_prefix}-backend"
  vm_size                           = var.azure_vm_size
  disk_controller_type              = "NVMe"
  os_type                           = "Linux"
  image_publisher                   = "Canonical"
  image_offer                       = "ubuntu-24_04-lts"
  image_sku                         = "server"
  image_version                     = "latest"
  communicator                      = "ssh"
  ssh_username                      = "azureuser"
  os_disk_size_gb                   = 30
  azure_tags = {
    Project = var.project_name
    Role    = "backend"
  }
}

source "azure-arm" "frontend" {
  use_azure_cli_auth                = true
  subscription_id                   = var.azure_subscription_id
  tenant_id                         = var.azure_tenant_id
  location                          = var.azure_location
  managed_image_resource_group_name = var.azure_image_resource_group
  managed_image_name                = "${local.image_prefix}-frontend"
  vm_size                           = var.azure_vm_size
  disk_controller_type              = "NVMe"
  os_type                           = "Linux"
  image_publisher                   = "Canonical"
  image_offer                       = "ubuntu-24_04-lts"
  image_sku                         = "server"
  image_version                     = "latest"
  communicator                      = "ssh"
  ssh_username                      = "azureuser"
  os_disk_size_gb                   = 30
  azure_tags = {
    Project = var.project_name
    Role    = "frontend"
  }
}

build {
  name    = "azure-database"
  sources = ["source.azure-arm.database"]

  provisioner "shell" {
    script = "scripts/database.sh"
  }

  provisioner "shell" {
    inline = ["sudo waagent -force -deprovision+user"]
  }
}

build {
  name    = "azure-backend"
  sources = ["source.azure-arm.backend"]

  provisioner "shell" {
    script = "scripts/backend.sh"
  }

  provisioner "shell" {
    inline = ["sudo waagent -force -deprovision+user"]
  }
}

build {
  name    = "azure-frontend"
  sources = ["source.azure-arm.frontend"]

  provisioner "shell" {
    script = "scripts/frontend.sh"
  }

  provisioner "shell" {
    inline = ["sudo waagent -force -deprovision+user"]
  }
}
