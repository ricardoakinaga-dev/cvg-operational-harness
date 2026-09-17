# Phase 4A technical debt register — AAA-4A

| ID     | Debt                                                    | Impact                                                       | Closure condition                                                      |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 4A-D01 | Disposable PostgreSQL run is local and ephemeral        | No shared environment or production HA claim                 | Closed for controlled scope; retain `NO_GO` for production             |
| 4A-D02 | Model fallback is structural and provider-independent   | Natural-language coverage beyond rules is not benchmarked    | Add a synthetic Model Gateway fixture corpus and budget report         |
| 4A-D03 | Delivery PostgreSQL path is adapter-level               | Shared service deployment behavior is not assessed           | Closed for controlled scope; production delivery plan remains separate |
| 4A-D04 | No production channel/provider integration              | Cannot assess operational latency, quotas or channel retries | Separate approved integration project with new gate                    |
| 4A-D05 | No formal load or soak test                             | No production capacity claim                                 | Define load target and run an isolated performance plan                |
| 4A-D06 | Conversation package is not a default application route | Consumer activation is intentionally manual                  | New composition review must preserve optionality and NO_GO guard       |

None of these entries authorizes a workaround. The current result must expose
the debt in the final report and cannot call production ready.
