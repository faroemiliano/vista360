from pathlib import Path

from app.core.config import Settings


class S3Storage:
    def __init__(self, settings: Settings):
        try:
            import boto3
            from botocore.config import Config
        except ImportError:
            raise RuntimeError("Instalá el extra backend [s3] para usar almacenamiento S3/R2") from None
        self.bucket = settings.s3_bucket
        self.client = boto3.client("s3", endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key.get_secret_value(),
            aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
            config=Config(signature_version="s3v4", connect_timeout=10, read_timeout=10,
                          retries={"total_max_attempts": 2}, s3={"addressing_style": "path"}))

    def size(self, key: str) -> int:
        return self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"]

    def download(self, key: str, destination: Path, limit: int) -> None:
        body = self.client.get_object(Bucket=self.bucket, Key=key)["Body"]
        count = 0
        try:
            with destination.open("wb") as target:
                for block in body.iter_chunks(512 * 1024):
                    count += len(block)
                    if count > limit:
                        raise ValueError("upload_too_large")
                    target.write(block)
        finally:
            body.close()

    def put(self, key: str, source: Path) -> None:
        with source.open("rb") as body:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType="image/jpeg",
                                   CacheControl="private, max-age=300")

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def copy_from(self, source: "S3Storage", source_key: str, target_key: str) -> None:
        if not isinstance(source, S3Storage):
            raise ValueError("La publicación S3 requiere assets S3")
        self.client.copy_object(Bucket=self.bucket, Key=target_key,
            CopySource={"Bucket": source.bucket, "Key": source_key}, MetadataDirective="REPLACE",
            ContentType="image/jpeg", CacheControl="public, max-age=31536000, immutable")

    def upload_url(self, key: str, expires: int) -> str:
        return self.client.generate_presigned_url("put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": "image/jpeg"}, ExpiresIn=expires)

    def read_url(self, key: str, expires: int) -> str:
        return self.client.generate_presigned_url("get_object",
            Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires)
