from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

from .types import (
    ApiKey,
    CreateJobParams,
    CreateKeyResult,
    Execution,
    Job,
    JobStats,
    RegisterResult,
    UpdateJobParams,
    UserProfile,
)

DEFAULT_BASE_URL = "https://cronapi.hakinsight.com"


class CronApiError(Exception):
    """Raised when the CronAPI returns a non-2xx response."""

    def __init__(self, status: int, body: Any) -> None:
        message = (
            body.get("error", f"HTTP {status}")
            if isinstance(body, dict)
            else f"HTTP {status}"
        )
        super().__init__(message)
        self.status = status
        self.body = body


def _raise_for_response(response: httpx.Response) -> Dict[str, Any]:
    try:
        data = response.json()
    except Exception:
        data = {}
    if not response.is_success:
        raise CronApiError(response.status_code, data)
    return data  # type: ignore[return-value]


class CronApiClient:
    """Synchronous CronAPI client."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
        self._base = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=f"{self._base}/api/v1",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "CronApiClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    # ─── Auth ─────────────────────────────────────────────────────────────────

    def get_me(self) -> UserProfile:
        """Get the current user's profile."""
        data = _raise_for_response(self._client.get("/auth/me"))
        return UserProfile.from_dict(data)

    def list_keys(self) -> List[ApiKey]:
        """List API keys for the current user."""
        data = _raise_for_response(self._client.get("/auth/keys"))
        return [ApiKey.from_dict(k) for k in data["keys"]]

    def create_key(self, name: Optional[str] = None) -> CreateKeyResult:
        """Create a new API key."""
        data = _raise_for_response(self._client.post("/auth/keys", json={"name": name}))
        return CreateKeyResult.from_dict(data)

    def revoke_key(self, key_id: str) -> str:
        """Revoke an API key. Returns the confirmation message."""
        data = _raise_for_response(
            self._client.delete(f"/auth/keys/{quote(key_id, safe='')}")
        )
        return data["message"]

    # ─── Jobs ─────────────────────────────────────────────────────────────────

    def list_jobs(self) -> List[Job]:
        """List all cron jobs."""
        data = _raise_for_response(self._client.get("/jobs"))
        return [Job.from_dict(j) for j in data["jobs"]]

    def create_job(self, params: CreateJobParams) -> Job:
        """Create a new cron job."""
        data = _raise_for_response(self._client.post("/jobs", json=params.to_dict()))
        return Job.from_dict(data["job"])

    def get_job(self, job_id: str) -> Job:
        """Get a cron job by ID."""
        data = _raise_for_response(
            self._client.get(f"/jobs/{quote(job_id, safe='')}")
        )
        return Job.from_dict(data["job"])

    def update_job(self, job_id: str, params: UpdateJobParams) -> Job:
        """Partially update a cron job."""
        data = _raise_for_response(
            self._client.patch(f"/jobs/{quote(job_id, safe='')}", json=params.to_dict())
        )
        return Job.from_dict(data["job"])

    def delete_job(self, job_id: str) -> str:
        """Delete a cron job. Returns the confirmation message."""
        data = _raise_for_response(
            self._client.delete(f"/jobs/{quote(job_id, safe='')}")
        )
        return data["message"]

    def trigger_job(self, job_id: str) -> Execution:
        """Manually trigger a job execution."""
        data = _raise_for_response(
            self._client.post(f"/jobs/{quote(job_id, safe='')}/trigger")
        )
        return Execution.from_dict(data["execution"])

    def list_executions(
        self,
        job_id: str,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> tuple[List[Execution], Optional[str]]:
        """
        List execution history for a job.
        Returns (executions, next_cursor).
        """
        params: Dict[str, str] = {}
        if limit is not None:
            params["limit"] = str(limit)
        if cursor is not None:
            params["cursor"] = cursor
        data = _raise_for_response(
            self._client.get(
                f"/jobs/{quote(job_id, safe='')}/executions", params=params
            )
        )
        executions = [Execution.from_dict(e) for e in data["executions"]]
        return executions, data.get("nextCursor")

    def get_job_stats(self, job_id: str) -> JobStats:
        """Get aggregated stats for a job."""
        data = _raise_for_response(
            self._client.get(f"/jobs/{quote(job_id, safe='')}/stats")
        )
        return JobStats.from_dict(data["stats"])


class AsyncCronApiClient:
    """Async CronAPI client (requires httpx async support)."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
        self._base = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=f"{self._base}/api/v1",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncCronApiClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    # ─── Auth ─────────────────────────────────────────────────────────────────

    async def get_me(self) -> UserProfile:
        data = _raise_for_response(await self._client.get("/auth/me"))
        return UserProfile.from_dict(data)

    async def list_keys(self) -> List[ApiKey]:
        data = _raise_for_response(await self._client.get("/auth/keys"))
        return [ApiKey.from_dict(k) for k in data["keys"]]

    async def create_key(self, name: Optional[str] = None) -> CreateKeyResult:
        data = _raise_for_response(
            await self._client.post("/auth/keys", json={"name": name})
        )
        return CreateKeyResult.from_dict(data)

    async def revoke_key(self, key_id: str) -> str:
        data = _raise_for_response(
            await self._client.delete(f"/auth/keys/{quote(key_id, safe='')}")
        )
        return data["message"]

    # ─── Jobs ─────────────────────────────────────────────────────────────────

    async def list_jobs(self) -> List[Job]:
        data = _raise_for_response(await self._client.get("/jobs"))
        return [Job.from_dict(j) for j in data["jobs"]]

    async def create_job(self, params: CreateJobParams) -> Job:
        data = _raise_for_response(
            await self._client.post("/jobs", json=params.to_dict())
        )
        return Job.from_dict(data["job"])

    async def get_job(self, job_id: str) -> Job:
        data = _raise_for_response(
            await self._client.get(f"/jobs/{quote(job_id, safe='')}")
        )
        return Job.from_dict(data["job"])

    async def update_job(self, job_id: str, params: UpdateJobParams) -> Job:
        data = _raise_for_response(
            await self._client.patch(
                f"/jobs/{quote(job_id, safe='')}", json=params.to_dict()
            )
        )
        return Job.from_dict(data["job"])

    async def delete_job(self, job_id: str) -> str:
        data = _raise_for_response(
            await self._client.delete(f"/jobs/{quote(job_id, safe='')}")
        )
        return data["message"]

    async def trigger_job(self, job_id: str) -> Execution:
        data = _raise_for_response(
            await self._client.post(f"/jobs/{quote(job_id, safe='')}/trigger")
        )
        return Execution.from_dict(data["execution"])

    async def list_executions(
        self,
        job_id: str,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> tuple[List[Execution], Optional[str]]:
        params: Dict[str, str] = {}
        if limit is not None:
            params["limit"] = str(limit)
        if cursor is not None:
            params["cursor"] = cursor
        data = _raise_for_response(
            await self._client.get(
                f"/jobs/{quote(job_id, safe='')}/executions", params=params
            )
        )
        executions = [Execution.from_dict(e) for e in data["executions"]]
        return executions, data.get("nextCursor")

    async def get_job_stats(self, job_id: str) -> JobStats:
        data = _raise_for_response(
            await self._client.get(f"/jobs/{quote(job_id, safe='')}/stats")
        )
        return JobStats.from_dict(data["stats"])


def register(email: str, base_url: str = DEFAULT_BASE_URL) -> RegisterResult:
    """
    Register a new CronAPI account (no auth required).
    Returns the API key — **save it, it will not be shown again**.
    """
    with httpx.Client() as client:
        response = client.post(
            f"{base_url.rstrip('/')}/api/v1/auth/register",
            json={"email": email},
            headers={"Content-Type": "application/json"},
        )
    return RegisterResult.from_dict(_raise_for_response(response))


async def register_async(email: str, base_url: str = DEFAULT_BASE_URL) -> RegisterResult:
    """Async version of :func:`register`."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url.rstrip('/')}/api/v1/auth/register",
            json={"email": email},
            headers={"Content-Type": "application/json"},
        )
    return RegisterResult.from_dict(_raise_for_response(response))
