terraform {
  backend "s3" {
    bucket         = "proyecto-tfstate-backend-2026"
    key            = "terraform/backend-db-app/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
