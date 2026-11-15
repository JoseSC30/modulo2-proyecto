resource "aws_key_pair" "ansible" {
  key_name   = var.key_name
  public_key = file("${path.module}/../../keys/aws_ec2_key.pub")

  tags = {
    Name    = var.key_name
    Project = var.project_name
  }
}
