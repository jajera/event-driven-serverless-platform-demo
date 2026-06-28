data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

locals {
  processor_image_uri = trimspace(var.processor_image_uri) != "" ? trimspace(var.processor_image_uri) : "${aws_ecr_repository.processor_image.repository_url}:${var.processor_image_tag}"
}
