resource "aws_instance" "database" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  subnet_id                   = data.aws_subnet.selected.id
  key_name                    = aws_key_pair.ansible.key_name
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.database.id]
  user_data                   = file("${path.module}/user-data.sh")
  user_data_replace_on_change = true

  tags = {
    Name    = "${var.project_name}-database"
    Project = var.project_name
    Role    = "database"
  }
}

resource "aws_instance" "backend" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  subnet_id                   = data.aws_subnet.selected.id
  key_name                    = aws_key_pair.ansible.key_name
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.backend.id]
  user_data                   = file("${path.module}/user-data.sh")
  user_data_replace_on_change = true

  tags = {
    Name    = "${var.project_name}-backend"
    Project = var.project_name
    Role    = "backend"
  }
}

resource "aws_instance" "frontend" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  subnet_id                   = data.aws_subnet.selected.id
  key_name                    = aws_key_pair.ansible.key_name
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.frontend.id]
  user_data                   = file("${path.module}/user-data.sh")
  user_data_replace_on_change = true

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
    Role    = "frontend"
  }
}
