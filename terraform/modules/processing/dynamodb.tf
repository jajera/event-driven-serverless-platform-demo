resource "aws_dynamodb_table" "jobs" {
  name         = "Jobs_Table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "job_id"

  attribute {
    name = "job_id"
    type = "S"
  }

  tags = var.tags
}
