variable "source_bucket" {
  description = "Name of the source S3 bucket for RINEX data (e.g., geonet-open-data)"
  type        = string
  default     = "geonet-open-data"
}

variable "lookback_hours" {
  description = "UTC rolling window for ingest sync (1-168). Default 1h with hourly schedule."
  type        = number
  default     = 1
}

variable "source_prefix" {
  description = "S3 prefix for source RINEX hourly data"
  type        = string
  default     = "gnss/rinexhourly/"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
