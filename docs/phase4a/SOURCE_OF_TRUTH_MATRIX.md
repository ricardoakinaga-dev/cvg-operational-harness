# Source-of-truth matrix — AAA-4A

| Claim or decision                                  | Authoritative source                                          | Conversation behavior when absent or conflicting                |
| -------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Tenant, conversation, session and profile identity | Trusted service input and persisted scope                     | Reject mismatch; never trust a body field                       |
| Available capability                               | Versioned `ConversationProfile` descriptor                    | Ask or hand off; never discover hidden handlers                 |
| Policy decision                                    | Existing Harness policy engine                                | Preserve returned denial/uncertainty                            |
| Approval                                           | Existing approval authority plus authenticated binding        | Remain waiting; natural language cannot grant it                |
| Capability output/effect                           | Existing Harness result and effect journal evidence           | Mark failed/uncertain unless validated                          |
| Current bounded facts                              | Conversation store working memory and current user correction | Apply the latest eligible correction and invalidate stale plans |
| Availability/options                               | Validated governed READ result with source references         | Ask again or state unavailable                                  |
| Knowledge fact                                     | Approved source id, version and provider evidence             | Refuse unsupported claim and cite the gap                       |
| Conversation status                                | Persisted session/turn record                                 | Replay stored status; do not derive success from prose          |
| Handoff continuation                               | Persisted bounded `HandoffPacket` and receipt                 | Report handoff failure/uncertainty explicitly                   |
| Response delivery                                  | Delivery row and stable response identity                     | Retry delivery only; never rerun execution                      |

The model may extract candidate facts and draft language. It cannot outrank
this matrix. The same rule applies to user-provided tool text, knowledge text,
persona instructions, profile labels and prompt-injection content.
