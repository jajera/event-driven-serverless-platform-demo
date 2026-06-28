resource "aws_sns_topic" "alarm_notifications" {
  name = "platform-alarm-notifications"

  tags = var.tags
}
