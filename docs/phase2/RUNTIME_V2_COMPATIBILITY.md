# Runtime V2 compatibility

## CURRENTLY_SUPPORTED

- A single submitted `RuntimeInput` can be persisted and executed as Runtime
  V1.
- `WAITING_APPROVAL` and `WAITING_USER` are representable states.
- Execution identity, attempt, lease, result, failure, and event history are
  separate from the runtime implementation.
- The public factory is passed options rather than replaced by an internal
  worker bootstrap.

## NOT_IMPLEMENTED

- planner/checkpoint loops;
- multi-step orchestration;
- MCP or multi-agent execution;
- resuming a serialized runtime checkpoint;
- real providers, real tools, RAG, or external effects.

## Compatibility rule

Future V2 work may add checkpoints and step records beside the execution row;
it must not reinterpret a terminal V1 result as a resumable checkpoint or
collapse an uncertain effect into a successful step. The current state machine
keeps paused states and attempt identity explicit so V2 can extend it without
making one model/tool call the permanent execution shape.
