from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from dataclasses import dataclass, field

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
Plan = Literal["free", "indie", "pro"]


@dataclass
class Job:
    id: str
    name: str
    endpoint_url: str
    cron_expression: str
    http_method: HttpMethod
    headers: Dict[str, str]
    body: Optional[str]
    enabled: bool
    notify_url: Optional[str]
    max_retries: int
    signing_secret: str
    timeout_ms: int
    next_run_at: Optional[str]
    last_run_at: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Job":
        return cls(
            id=d["id"],
            name=d["name"],
            endpoint_url=d["endpointUrl"],
            cron_expression=d["cronExpression"],
            http_method=d["httpMethod"],
            headers=d.get("headers") or {},
            body=d.get("body"),
            enabled=d["enabled"],
            notify_url=d.get("notifyUrl"),
            max_retries=d["maxRetries"],
            signing_secret=d.get("signingSecret", ""),
            timeout_ms=d["timeoutMs"],
            next_run_at=d.get("nextRunAt"),
            last_run_at=d.get("lastRunAt"),
            created_at=d["createdAt"],
            updated_at=d["updatedAt"],
        )


@dataclass
class CreateJobParams:
    name: str
    endpoint_url: str
    cron_expression: str
    http_method: HttpMethod = "GET"
    headers: Dict[str, str] = field(default_factory=dict)
    body: Optional[str] = None
    notify_url: Optional[str] = None
    max_retries: int = 3
    timeout_ms: int = 30_000

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "name": self.name,
            "endpointUrl": self.endpoint_url,
            "cronExpression": self.cron_expression,
            "httpMethod": self.http_method,
            "headers": self.headers,
            "maxRetries": self.max_retries,
            "timeoutMs": self.timeout_ms,
        }
        if self.body is not None:
            d["body"] = self.body
        if self.notify_url is not None:
            d["notifyUrl"] = self.notify_url
        return d


@dataclass
class UpdateJobParams:
    name: Optional[str] = None
    endpoint_url: Optional[str] = None
    cron_expression: Optional[str] = None
    http_method: Optional[HttpMethod] = None
    headers: Optional[Dict[str, str]] = None
    body: Optional[str] = None
    enabled: Optional[bool] = None
    notify_url: Optional[str] = None
    max_retries: Optional[int] = None
    timeout_ms: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {}
        if self.name is not None:
            d["name"] = self.name
        if self.endpoint_url is not None:
            d["endpointUrl"] = self.endpoint_url
        if self.cron_expression is not None:
            d["cronExpression"] = self.cron_expression
        if self.http_method is not None:
            d["httpMethod"] = self.http_method
        if self.headers is not None:
            d["headers"] = self.headers
        if self.body is not None:
            d["body"] = self.body
        if self.enabled is not None:
            d["enabled"] = self.enabled
        if self.notify_url is not None:
            d["notifyUrl"] = self.notify_url
        if self.max_retries is not None:
            d["maxRetries"] = self.max_retries
        if self.timeout_ms is not None:
            d["timeoutMs"] = self.timeout_ms
        return d


@dataclass
class Execution:
    id: str
    job_id: str
    status: str
    status_code: Optional[int]
    duration_ms: Optional[int]
    response_body: Optional[str]
    error: Optional[str]
    started_at: str
    finished_at: Optional[str]

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Execution":
        return cls(
            id=d["id"],
            job_id=d.get("jobId", d.get("job_id", "")),
            status=d["status"],
            status_code=d.get("statusCode") or d.get("status_code"),
            duration_ms=d.get("durationMs") or d.get("duration_ms"),
            response_body=d.get("responseBody") or d.get("response_body"),
            error=d.get("error"),
            started_at=d.get("startedAt") or d.get("started_at", ""),
            finished_at=d.get("finishedAt") or d.get("finished_at"),
        )


@dataclass
class PeriodStats:
    total_runs: int
    success_count: int
    failure_count: int
    success_rate: float
    avg_response_ms: int

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "PeriodStats":
        return cls(
            total_runs=d["totalRuns"],
            success_count=d["successCount"],
            failure_count=d["failureCount"],
            success_rate=d["successRate"],
            avg_response_ms=d["avgResponseMs"],
        )


@dataclass
class JobStats:
    last_24h: PeriodStats
    last_7d: PeriodStats

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "JobStats":
        return cls(
            last_24h=PeriodStats.from_dict(d["last24h"]),
            last_7d=PeriodStats.from_dict(d["last7d"]),
        )


@dataclass
class ApiKey:
    id: str
    name: str
    prefix: str
    created_at: str
    last_used_at: Optional[str]

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ApiKey":
        return cls(
            id=d["id"],
            name=d["name"],
            prefix=d.get("prefix", ""),
            created_at=d.get("createdAt", d.get("created_at", "")),
            last_used_at=d.get("lastUsedAt") or d.get("last_used_at"),
        )


@dataclass
class RegisterResult:
    message: str
    user_id: str
    email: str
    plan: Plan
    api_key: str
    key_id: str

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "RegisterResult":
        return cls(
            message=d["message"],
            user_id=d["userId"],
            email=d["email"],
            plan=d["plan"],
            api_key=d["apiKey"],
            key_id=d["keyId"],
        )


@dataclass
class CreateKeyResult:
    message: str
    api_key: str
    key_id: str

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CreateKeyResult":
        return cls(
            message=d["message"],
            api_key=d["apiKey"],
            key_id=d["keyId"],
        )


@dataclass
class UserProfile:
    user_id: str
    email: str
    plan: Plan

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "UserProfile":
        return cls(
            user_id=d["userId"],
            email=d["email"],
            plan=d["plan"],
        )
