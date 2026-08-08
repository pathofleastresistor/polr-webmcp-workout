# Field notes: making one sentence work

These notes come from building a single feature in Spotter: making _"start my
workout"_ do what it says. The intended behaviour is unremarkable — close out
any session still running, begin a new one, and program it — and the server
code for it was correct on the first attempt. Getting a real agent to _call_ it
that way took four tries.

Everything below is grounded in that one exercise: one app, one browser agent
(the MCP-B extension driving a GPT-5.6-class model), one feature. It is a
sample size of one, and some of it will be wrong in general. But every failure
here survived code review and looked fine in the source, which is itself the
main finding.

---

## What actually happened

| #   | Change                                                             | What the agent did                                                                                  |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | `exercises` added to `start_workout` as an **optional** plan       | Skipped it. Started an empty session, then asked the person what they wanted to train.              |
| 2   | Added `ifActive` so one call could close a running session         | **Worked first time.** Correctly discarded an unlogged session and said so.                         |
| 3   | Zod `.refine`: require `exercises` **or** an explicit `startEmpty` | Passed `startEmpty: true`. Took the escape hatch.                                                   |
| 4   | Made `exercises` **required** in the schema                        | Complied — but on the first ask deferred: _"tell me what you want to train."_ Worked on the second. |
| 5   | Rewrote descriptions to grant permission to decide                 | Pending.                                                                                            |

Attempt 2 is as instructive as the failures. `ifActive` is an enum with a
documented default and no way to express the wrong thing; the agent used it
correctly without being coaxed. The parameters that failed were the ones where
doing nothing was a valid call.

---

## Descriptions are advice; schemas are rules

The single most useful thing we learned.

A tool description is read by a model that is simultaneously weighing its own
instructions, the conversation, and its disposition. It is one input among
several, and it loses to a strong prior. Attempt 1's description said, in as
many words, _"Omit `exercises` only if they explicitly want to build the
session themselves."_ The agent omitted `exercises`. It was not being
disobedient; an optional parameter is one a model is entitled to skip, and
"only if" is a sentence it can weigh rather than a rule it must obey.

`required: ["exercises"]` cannot be weighed. That is the whole difference.

**Corollary: a constraint the agent cannot see before it calls is a constraint
it will meet as an error and route around.** Attempt 3 failed for a specific,
generalizable reason: Zod's `.refine` does not serialize into JSON Schema. We
confirmed this directly — the emitted schema for a refined object contains no
trace of the refinement:

```jsonc
{
  "type": "object",
  "properties": { "exercises": { ... }, "startEmpty": { "type": "boolean" } }
  // the refinement requiring one of them: gone
}
```

So the agent composed its call from a schema where both fields were optional,
got a runtime rejection, and satisfied the error message the cheapest way
available. Which brings us to the sharpest lesson of the four:

**Anything you offer in an error message will be taken.** Our message named
`startEmpty: true` as an alternative, intending it for a narrow case. It became
the default recovery. If a remediation path exists in the error text, treat it
as the behaviour you are most likely to get.

(JSON Schema itself _can_ express this, via `oneOf` or `dependentRequired`. Our
problem was the Zod-to-JSON-Schema conversion dropping it silently. We did not
test whether agents honour those combinators reliably — worth knowing before
depending on them.)

## Descriptions still matter for the thing schemas cannot express

Attempt 4 got the agent to supply a plan, and it still stalled once — asking
which focus the person wanted, rather than choosing. Nothing in the schema can
fix that: the call was well-formed and the model simply preferred to check in.

Two things it needed, both prose:

1. **Permission to decide.** _"'Start a workout' with no further detail is a
   complete instruction, not an ambiguous one."_ A terse request reads as
   under-specified unless you say otherwise. Prohibitions ("do not ask") are
   weaker than a positive statement of remit.
2. **Correction of a bad inference.** The agent saw an empty active session and
   concluded _"already active and empty, so there's nothing to replace."_ Sound
   reasoning, wrong conclusion. `get_active_workout` now states that an empty
   session is one waiting to be programmed, not a blocker.

These are nudges, not enforcement, and we expect them to raise the first-ask
success rate rather than guarantee it. A model that asks a clarifying question
before acting on a terse instruction is exercising a disposition, and a tool
description only argues with it.

---

## Opportunities: the WebMCP spec

Offered as observations from one implementation, not demands.

**1. Tool availability is a function of navigation, and the agent cannot see
the graph.** This is the deepest issue we hit, and it is structural rather than
incidental. WebMCP's scoping model is a genuine security property — this app
registers workout-editing tools only while that workout's page is mounted, so
an agent cannot log sets into a session the person is not looking at. But an
agent plans _before_ it navigates, and there is no way to express "`log_set`
exists once you are on a workout page." So the natural plan — `start_workout`,
then `propose_workout_plan` — names a tool that does not exist at the moment it
is chosen. Our fix was to collapse the flow into one call, which works but does
not generalize: every cross-page flow has to be pre-collapsed by the site.

A way to declare **prospective tools** — names and schemas an agent will gain
under stated conditions — would let agents plan across a navigation instead of
discovering a dead end. Even a purely advisory list would help.

**2. No machine-readable "what now".** Tool results carry prose, so we encode
next steps as English: _"the workout page is open, so `log_set` is now
available."_ That works only as well as the model's reading. A structured
`suggestedNextTools` (or similar) on a result would make the handoff explicit
rather than inferred.

**3. Errors have no remediation shape.** The spec has agents return errors as
values, which is right. But the remedy is free prose, and — per above — agents
optimise against whatever it says. A structured remediation (which tool, which
argument, retryable or not) would make the recovery path deliberate rather than
a matter of phrasing.

**4. No hint that a tool will prompt the person.** Annotations cover
`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` — all
about consequences, none about _interaction cost_. Roughly half our write tools
open a confirmation dialog. An agent that knew which ones prompt could batch
work to spend a person's attention once rather than three times. We got there
by hand, collapsing close-and-plan into a single approval, but the agent had no
way to know that was what it was buying.

**5. Registration lifetime is fragile in ways sites must discover.** A page
frozen into the back/forward cache and restored keeps its React tree intact —
nothing unmounts, no effect re-runs, nothing in the app observes anything
happened — but every registration behind it is dead. The failure surfaces to
the agent as `The page keeping the extension port is moved into back/forward
cache, so the message channel is closed`. We handle it with a `pageshow`
listener and a re-registration epoch (see `app/webmcp/provider.tsx`). Every
WebMCP site will hit this, and every one will have to rediscover it. It belongs
in the spec's lifecycle section, or better, in the runtime's recovery
behaviour.

---

## Opportunities: guidance for agents implementing WebMCP

- **Re-read the tool list after every navigation, and never cache across one.**
  Tool sets are page-scoped by design; a stale list is the common case, not an
  edge case.
- **Recover from bfcache invalidation without involving the model.** The
  message-channel error above is a transport detail. Surfacing it as a tool
  failure teaches the model that the site is unreliable.
- **Pass validation errors through verbatim.** Sites write them for the model —
  ours name the exact tools to call next. Summarising or rewrapping them
  discards the most useful thing in the response.
- **Treat a rejected call as a step, not a dead end.** A missing required
  argument means gather it and retry, which is what we eventually saw.
- **Weight the site's stated remit above the instinct to check in.** When a tool
  description says an instruction is complete, asking the person anyway is a
  regression from the site's point of view — it is precisely the interaction the
  tool exists to remove.
- **Prefer the fewest approvals for one user intent.** If a site collapses three
  operations into one confirmable call, calling it once is better than
  reconstructing the long way round.

---

## Opportunities: guidance for sites writing WebMCP tools

In rough order of how much they cost us.

1. **Put the constraint in the schema, not the prose.** If a parameter carries
   the point of the tool, make it required. "Optional but you should really
   pass it" is a parameter that will be skipped.
2. **Never name an escape hatch you do not want taken.** Error messages are
   read as menus.
3. **Verify what your schema actually serialises to.** Refinements, cross-field
   rules, and anything your validation library expresses outside plain JSON
   Schema may vanish. Assert on the emitted schema in a test — we now assert
   that `exercises` appears in `required`, because that one property is the
   entire fix.
4. **Collapse flows that cross a page boundary into a single call.** If step two
   of a plan lives on a page step one navigates to, the agent cannot plan it.
   This is the tax of scoped registration and it falls on you.
5. **Grant permission to decide, explicitly.** State that a terse request is
   complete. Name the tool that answers the question the agent would otherwise
   ask the person.
6. **Say what state _means_, not just what it is.** "An empty active session is
   one waiting to be programmed, not a blocker" prevented a wrong inference that
   correct data alone produced.
7. **Write tool results as prompts.** Say what became possible and with which
   ids. The result text is the agent's next-step context, and often its only
   one.
8. **Spend one approval per user intent.** A person who asked for a workout
   should approve a workout, not a session-close and then a plan.
9. **Test against a real agent, early.** This is the one that matters. Three of
   our fixes read correctly in review, passed their tests, and failed on
   contact. None of the failures were visible from the source — they were
   visible in about ninety seconds of using the thing.
