# resource "aws_security_group" "prueba_terraform" {
#   name        = "terraform-prueba-sg"
#   description = "Security Group creado temporalmente para probar Terraform"
#   vpc_id      = aws_default_vpc.default.id

#   tags = {
#     Name        = "Terraform-Prueba-SG"
#     Environment = "test"
#     ManagedBy   = "Terraform"
#   }
# }

# resource "aws_security_group" "prueba_terraform_2" {
#   name        = "terraform-prueba-sg-2"
#   description = "Segundo Security Group de prueba"
#   vpc_id      = aws_default_vpc.default.id

#   tags = {
#     Name        = "Terraform-Prueba-SG-2"
#     Environment = "test"
#     ManagedBy   = "Terraform"
#   }
# }