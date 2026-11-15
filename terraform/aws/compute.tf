resource "aws_instance" "database" {
  ami                         = var.database_ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  vpc_security_group_ids      = [aws_security_group.database.id]
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/cloud-init/database.yaml", {
    application_user   = var.application_user
    database_name      = var.database_name
    database_user      = var.database_user
    database_password  = random_password.database.result
    vpc_cidr           = data.aws_vpc.default.cidr_block
    backend_repository = var.backend_repository
    repository_branch  = var.repository_branch
  })

  root_block_device {
    volume_size           = var.database_volume_size
    volume_type           = "gp3"
    delete_on_termination = true
  }

  tags = {
    Name    = "${var.project_name}-database"
    Project = var.project_name
    Role    = "database"
  }
}

resource "aws_instance" "backend" {
  ami                         = var.backend_ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  vpc_security_group_ids      = [aws_security_group.backend.id]
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/cloud-init/backend.yaml", {
    application_user    = var.application_user
    backend_repository  = var.backend_repository
    repository_branch   = var.repository_branch
    database_private_ip = aws_instance.database.private_ip
    database_name       = var.database_name
    database_user       = var.database_user
    database_password   = random_password.database.result
    jwt_secret          = random_password.jwt_secret.result
  })

  tags = {
    Name    = "${var.project_name}-backend"
    Project = var.project_name
    Role    = "backend"
  }
}

resource "aws_instance" "frontend" {
  ami                         = var.frontend_ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  vpc_security_group_ids      = [aws_security_group.frontend.id]
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/cloud-init/frontend.yaml", {
    application_user   = var.application_user
    backend_private_ip = aws_instance.backend.private_ip
    repository_url     = var.frontend_repository
    repository_branch  = var.repository_branch
  })

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
    Role    = "frontend"
  }
}
