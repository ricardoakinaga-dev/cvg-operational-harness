"""Synthetic journey over already-open FDs. Host owns FDs and server lifetime."""
import argparse
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cvg_sdk import StdioOptions, SdkWireError, attach_stdio, create_sdk_client


async def journey(args):
    transport = attach_stdio(input_fd=args.input_fd, output_fd=args.output_fd,
        options=StdioOptions(args.expected_tenant_id, request_timeout_ms=5000))
    try:
        client = create_sdk_client(transport)
        hello = await client.hello()
        session = None
        if hello['capabilities']['sessions']:
            session = (await client.open_session('stdio_session'))['sessionId']
        turn = await client.send_turn('Olá 🌿', session)
        if hello['capabilities']['events']:
            await client.read_events(session)
        return turn['stopReason']
    finally:
        await transport.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-fd', type=int, required=True)
    parser.add_argument('--output-fd', type=int, required=True)
    parser.add_argument('--expected-tenant-id', required=True)
    args = parser.parse_args()
    try:
        reason = asyncio.run(journey(args))
    except SdkWireError as error:
        print(f'sdk-python-example:{error.kind}:{error.outcome}', file=sys.stderr)
        return 1
    except (ValueError, TypeError):
        print('sdk-python-example:setup-failed', file=sys.stderr)
        return 2
    print(f'sdk-python-example:{reason}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
