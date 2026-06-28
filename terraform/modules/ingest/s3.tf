resource "aws_s3_bucket" "data_lake" {
  bucket_prefix = "data-lake-"
  force_destroy = true

  tags = merge(var.tags, {
    Name = "DataLakeBucket"
  })
}
