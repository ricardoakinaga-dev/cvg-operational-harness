"""Local typed projections of the existing CVG JSON-RPC v1 contract."""
import json
from pathlib import Path
from types import MappingProxyType
from typing import Literal, NotRequired, TypedDict

_CONTRACT = json.loads(Path(__file__).with_name('contract_v1.json').read_text('utf-8'))
SDK_PROTOCOL_VERSION = _CONTRACT['protocol_version']
SDK_METHODS = tuple(_CONTRACT['methods'])
SDK_ERROR_CODES = MappingProxyType(_CONTRACT['error_codes'])
SDK_TRANSPORT_ERROR_CODES = MappingProxyType(_CONTRACT['transport_error_codes'])
STOP_REASONS = tuple(_CONTRACT['stop_reasons'])
RpcId = str | int | float


class JsonRpcRequest(TypedDict):
    jsonrpc: Literal['2.0']
    id: RpcId
    method: str
    params: NotRequired[object]


class JsonRpcSuccess(TypedDict):
    jsonrpc: Literal['2.0']
    id: RpcId
    result: object


class JsonRpcError(TypedDict):
    code: int
    message: str
    data: NotRequired[object]


class JsonRpcFailure(TypedDict):
    jsonrpc: Literal['2.0']
    id: RpcId | None
    error: JsonRpcError


JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure


class SdkCapabilities(TypedDict):
    sessions: bool
    events: bool
    methods: list[str]


class SdkHelloResult(TypedDict):
    protocolVersion: int
    capabilities: SdkCapabilities


class SessionOpenResult(TypedDict):
    sessionId: str
    formatVersion: Literal[1]


class Usage(TypedDict):
    inputTokens: int
    outputTokens: int
    costUsd: float


class TurnSendResult(TypedDict):
    stopReason: str
    response: str
    modelCalls: int
    toolCalls: int
    usage: Usage
    sessionId: NotRequired[str]


class SessionEvent(TypedDict):
    tenantId: str
    sessionId: str
    formatVersion: Literal[1]
    eventId: str
    timestamp: str
    correlationId: str
    traceId: str
    type: str
    payload: object
    sequence: int
    schemaFingerprint: str


class SessionEventsResult(TypedDict):
    events: list[SessionEvent]


class SdkClientError(Exception):
    def __init__(self, code: int, message: str, data: object = None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data


class SdkWireError(SdkClientError):
    def __init__(self, kind: str, request_id: RpcId, method: str,
                 outcome: Literal['not_dispatched', 'unknown'],
                 code: int | None = None, message: str | None = None,
                 data: object = None):
        super().__init__(code if code is not None else SDK_TRANSPORT_ERROR_CODES[
            'transport' if kind == 'closed' else kind],
            message if kind == 'remote_error' else f'SDK stdio {kind}', data)
        self.kind, self.request_id, self.method = kind, request_id, method
        self.outcome = outcome
        self.retry_safe = outcome == 'not_dispatched'
