import json

from reprocess_api import handler as reprocess_handler


class FakeDdbClient:
    def __init__(self):
        self.store = {}

    def put_item(self, TableName, Item, ConditionExpression=None):
        job_id = Item["job_id"]["S"]
        self.store[job_id] = Item
        return {}

    def get_item(self, TableName, Key):
        job_id = Key["job_id"]["S"]
        item = self.store.get(job_id)
        return {"Item": item} if item else {}

    def update_item(self, **kwargs):
        job_id = kwargs["Key"]["job_id"]["S"]
        item = self.store.get(job_id, {"job_id": {"S": job_id}})
        item["status"] = {"S": "failed"}
        self.store[job_id] = item
        return {}


class FakeSqsClient:
    def __init__(self):
        self.messages = []

    def send_message(self, QueueUrl, MessageBody):
        self.messages.append((QueueUrl, MessageBody))
        return {"MessageId": "m-1"}


class FakeS3Client:
    def list_objects_v2(self, **kwargs):
        prefix = kwargs["Prefix"]
        if prefix == "raw/rinexhourly/2024/150/":
            return {
                "Contents": [
                    {"Key": "raw/rinexhourly/2024/150/AUCK00NZL_R_20241500000_01H_30S_MO.rnx.gz"}
                ],
                "IsTruncated": False,
            }
        return {"Contents": [], "IsTruncated": False}


class FakeBoto3:
    def __init__(self, ddb, sqs, s3):
        self._ddb = ddb
        self._sqs = sqs
        self._s3 = s3

    def client(self, service_name):
        if service_name == "dynamodb":
            return self._ddb
        if service_name == "sqs":
            return self._sqs
        if service_name == "s3":
            return self._s3
        raise ValueError(service_name)


def test_reprocess_handler_post_and_get(monkeypatch):
    fake_ddb = FakeDdbClient()
    fake_sqs = FakeSqsClient()
    fake_s3 = FakeS3Client()
    monkeypatch.setenv("JOBS_TABLE_NAME", "jobs")
    monkeypatch.setenv("REPROCESS_QUEUE_URL", "https://queue.local/q")
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    monkeypatch.setattr(reprocess_handler, "boto3", FakeBoto3(fake_ddb, fake_sqs, fake_s3))

    post_event = {
        "httpMethod": "POST",
        "body": json.dumps({"station": "AUCK", "year": 2024, "doy": 150, "parameters": {"NAV_DAY_OFFSET": 2}}),
    }
    post_result = reprocess_handler.handler(post_event, None)
    post_body = json.loads(post_result["body"])
    assert post_result["statusCode"] == 202
    assert post_body["status"] == "queued"
    assert len(fake_sqs.messages) == 1
    queued_body = json.loads(fake_sqs.messages[0][1])
    assert queued_body["key"] == "raw/rinexhourly/2024/150/AUCK00NZL_R_20241500000_01H_30S_MO.rnx.gz"

    get_event = {"httpMethod": "GET", "pathParameters": {"job_id": post_body["job_id"]}}
    get_result = reprocess_handler.handler(get_event, None)
    get_body = json.loads(get_result["body"])
    assert get_result["statusCode"] == 200
    assert get_body["job_id"] == post_body["job_id"]
    assert get_body["status"] == "queued"


def test_reprocess_handler_returns_400_when_raw_key_missing(monkeypatch):
    class EmptyS3Client:
        def list_objects_v2(self, **kwargs):
            return {"Contents": [], "IsTruncated": False}

    fake_ddb = FakeDdbClient()
    fake_sqs = FakeSqsClient()
    monkeypatch.setenv("JOBS_TABLE_NAME", "jobs")
    monkeypatch.setenv("REPROCESS_QUEUE_URL", "https://queue.local/q")
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    monkeypatch.setattr(reprocess_handler, "boto3", FakeBoto3(fake_ddb, fake_sqs, EmptyS3Client()))

    post_event = {
        "httpMethod": "POST",
        "body": json.dumps({"station": "AUCK", "year": 2024, "doy": 150, "parameters": {"NAV_DAY_OFFSET": 2}}),
    }
    post_result = reprocess_handler.handler(post_event, None)
    assert post_result["statusCode"] == 400
    body = json.loads(post_result["body"])
    assert "No raw RINEX file found" in body["error"]
