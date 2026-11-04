resource "aws_instance" "backend_db" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  vpc_security_group_ids      = [aws_security_group.backend_db.id]
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/cloud-init/backend-db.yaml", {
    application_user  = var.application_user
    database_name     = var.database_name
    database_user     = var.database_user
    database_password = random_password.database.result
    jwt_secret        = random_password.jwt_secret.result
    vpc_cidr          = data.aws_vpc.default.cidr_block
    repository_url    = var.backend_db_repository
    repository_branch = var.repository_branch
  })

  tags = {
    Name    = "${var.project_name}-backend-db"
    Project = var.project_name
    Role    = "backend-db"
  }
}

resource "aws_instance" "frontend" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  vpc_security_group_ids      = [aws_security_group.frontend.id]
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/cloud-init/frontend.yaml", {
    application_user   = var.application_user
    backend_private_ip = aws_instance.backend_db.private_ip
    repository_url     = var.frontend_repository
    repository_branch  = var.repository_branch
  })

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
    Role    = "frontend"
  }
}
