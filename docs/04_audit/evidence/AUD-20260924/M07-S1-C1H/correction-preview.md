# C1H correction preview

The exact proposed changes are in [correction-preview.patch](correction-preview.patch).

- Change the repository policy and scanner's candidate-bound npm file from C1F to C1H.
- Add only the exact `M07-S1-C1H` evidence directory to the scanner's current output allowlist. Keep C1F, C1E, and prior accepted outputs.
- Add a positive scanner test for C1H and a negative test for `M07-S1-C1H-UNAPPROVED`; keep the existing C1F, C1E, historical, traversal, and symlink checks.
- Keep the approved R1 baseline and four candidate additions unchanged. The conversation fixture is snapshotted and must remain identical to C1F.

The C1H packet-local [capture helper](capture_command.py) changes one line from C1G: `REPO = HERE.parents[5]` becomes `REPO = HERE.parents[4]`. This selects the repository directory for subprocess working directories. The C1H command plan uses fresh C1H paths and task/run identifiers; it does not alter the argv semantics of the approved local matrix.

No product source file has been changed by this preview. Applying the three-file patch and running the corrected packet helper require a separate exact human approval of the C1H packet.
