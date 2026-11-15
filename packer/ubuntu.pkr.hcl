packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-2"
}

variable "subnet_id" {
  type    = string
  default = null
}

variable "instance_type" {
  type    = string
  default = "t2.micro"
}

variable "aws_profile" {
  type    = string
  default = ""
}

variable "project_name" {
  type    = string
  default = "control-asistencia"
}

variable "source_ami_name" {
  type    = string
  default = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
}

source "amazon-ebs" "database" {
  ami_name                    = "${var.project_name}-database-${formatdate("YYYYMMDDhhmmss", timestamp())}"
  instance_type               = var.instance_type
  region                      = var.aws_region
  profile                     = var.aws_profile
  subnet_id                   = var.subnet_id
  associate_public_ip_address = true
  ssh_username                = "ubuntu"
  source_ami_filter {
    filters = {
      name                = var.source_ami_name
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]
  }
  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 10
    volume_type           = "gp3"
    delete_on_termination = true
  }
  tags = {
    Name    = "${var.project_name}-database"
    Project = var.project_name
    Role    = "database"
  }
}

source "amazon-ebs" "backend" {
  ami_name                    = "${var.project_name}-backend-${formatdate("YYYYMMDDhhmmss", timestamp())}"
  instance_type               = var.instance_type
  region                      = var.aws_region
  profile                     = var.aws_profile
  subnet_id                   = var.subnet_id
  associate_public_ip_address = true
  ssh_username                = "ubuntu"
  source_ami_filter {
    filters = {
      name                = var.source_ami_name
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]
  }
  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 10
    volume_type           = "gp3"
    delete_on_termination = true
  }
  tags = {
    Name    = "${var.project_name}-backend"
    Project = var.project_name
    Role    = "backend"
  }
}

source "amazon-ebs" "frontend" {
  ami_name                    = "${var.project_name}-frontend-${formatdate("YYYYMMDDhhmmss", timestamp())}"
  instance_type               = var.instance_type
  region                      = var.aws_region
  profile                     = var.aws_profile
  subnet_id                   = var.subnet_id
  associate_public_ip_address = true
  ssh_username                = "ubuntu"
  source_ami_filter {
    filters = {
      name                = var.source_ami_name
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]
  }
  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 10
    volume_type           = "gp3"
    delete_on_termination = true
  }
  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
    Role    = "frontend"
  }
}

build {
  name    = "database"
  sources = ["source.amazon-ebs.database"]

  provisioner "shell" {
    script = "scripts/database.sh"
  }
}

build {
  name    = "backend"
  sources = ["source.amazon-ebs.backend"]

  provisioner "shell" {
    script = "scripts/backend.sh"
  }
}

build {
  name    = "frontend"
  sources = ["source.amazon-ebs.frontend"]

  provisioner "shell" {
    script = "scripts/frontend.sh"
  }
}
