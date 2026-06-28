resource "aws_ecr_repository" "processor_image" {
  name                 = "tec-processor-image"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}
