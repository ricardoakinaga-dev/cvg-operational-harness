# C1G correction preview

The exact proposed changes are in [correction-preview.patch](correction-preview.patch).

- Change the repository policy and scanner's candidate-bound npm file from C1F to C1G.
- Add only the exact `M07-S1-C1G` evidence directory to the scanner's current output allowlist. Keep C1F, C1E, and prior accepted outputs.
- Add a positive scanner test for C1G and a negative test for `M07-S1-C1G-UNAPPROVED`; keep the existing C1F, C1E, historical, traversal, and symlink checks.
- Keep the approved R1 baseline and four candidate additions unchanged. The conversation fixture is snapshotted and must remain identical to C1F.

No source file has been changed by this preview. Applying it requires a separate exact human approval of the C1G packet.
