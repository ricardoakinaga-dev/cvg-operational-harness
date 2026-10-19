"""Four v1 wrappers; no session cache, spawn, reconnect or retry."""
from .protocol import (SDK_PROTOCOL_VERSION, SdkHelloResult, SessionOpenResult,
                       TurnSendResult, SessionEvent, SdkWireError)
from .stdio import StdioTransport


class SdkClient:
    protocol_version = SDK_PROTOCOL_VERSION

    def __init__(self, transport: StdioTransport):
        if transport._client_bound:
            raise ValueError('SDK transport already has a client')
        transport._client_bound = True
        self._transport, self._next_id = transport, 1

    async def _call(self, method, params):
        request_id = f'py:{self._next_id}'
        if self._next_id > self._transport.options.max_lifetime_requests:
            raise SdkWireError('limit', request_id, method, 'not_dispatched')
        self._next_id += 1
        response = await self._transport.request({
            'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params})
        return response['result']

    async def hello(self) -> SdkHelloResult:
        return await self._call('sdk.hello', {'protocolVersion': SDK_PROTOCOL_VERSION})

    async def open_session(self, session_id: str) -> SessionOpenResult:
        return await self._call('session.open', {'sessionId': session_id})

    async def send_turn(self, user_message: str, session_id: str | None = None) -> TurnSendResult:
        return await self._call('turn.send', {'userMessage': user_message,
            **({'sessionId': session_id} if session_id is not None else {})})

    async def read_events(self, session_id: str, *, after_sequence: int = 0,
                          limit: int = 100) -> list[SessionEvent]:
        result = await self._call('session.events', {'sessionId': session_id,
            **({'afterSequence': after_sequence} if after_sequence is not None else {}),
            **({'limit': limit} if limit is not None else {})})
        return result['events']


def create_sdk_client(transport: StdioTransport) -> SdkClient:
    return SdkClient(transport)
