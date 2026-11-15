data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "selected" {
  availability_zone = var.availability_zone
  default_for_az    = true
  vpc_id            = data.aws_vpc.default.id
}
