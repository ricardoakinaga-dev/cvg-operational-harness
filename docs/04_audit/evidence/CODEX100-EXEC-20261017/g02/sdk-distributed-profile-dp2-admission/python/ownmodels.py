"""Own Pydantic models of DIAG-PY-MODELORACLE (CAP-2B-MODEL-ORACLE, D2B-07). Not the SDK.

Loaded only by python-driver.py in the DIAG-PY-MODELORACLE service, after pydantic_gate: the profile carries the sealed
python-deps tree and no sdk-python tree, so this module imports pydantic (2.13.4 / pydantic-core 2.46.4 of the identity freeze)
and never openai_codex. The models mirror the patterns of openai_codex.generated.v2_all that the 2B-2 cases exercise:
populate_by_name with aliases, extra ignored by default, extra='forbid' in a union member, RootModel over an Enum | model union,
RootModel over a Literal-tagged union, `bool | None = False` and `int | None = None` defaults.

oracle(ops) recomputes, directly with the Pydantic API and in the same process, the operations that the DIAG row runs through
the driver steps (model.validate, model.construct, model.dump, the static probes); the DIAG check compares both records.
The offline selftests only compile this file (Pydantic never runs outside the contained service).
"""
from __future__ import annotations

import warnings
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, ValidationError


class OwnGoal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    created_at: Annotated[int, Field(alias='createdAt')]
    objective: str
    thread_id: Annotated[str, Field(alias='threadId')]
    tokens_used: Annotated[int, Field(alias='tokensUsed')]
    token_budget: Annotated[int | None, Field(alias='tokenBudget')] = None


class OwnStatus(Enum):
    active = 'active'
    paused = 'paused'


class OwnGoalParams(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    objective: str | None = None
    status: OwnStatus | None = None
    thread_id: Annotated[str, Field(alias='threadId')]


class OwnApprovalValue(Enum):
    on_request = 'on-request'
    never = 'never'


class OwnGranular(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    rules: bool
    skill_approval: bool | None = False


class OwnGranularApproval(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)
    granular: OwnGranular


class OwnApproval(RootModel[OwnApprovalValue | OwnGranularApproval]):
    model_config = ConfigDict(populate_by_name=True)
    root: OwnApprovalValue | OwnGranularApproval


class OwnKindA(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type: Annotated[Literal['a'], Field(title='OwnKindAType')]
    a_value: Annotated[int | None, Field(alias='aValue')] = None


class OwnKindB(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type: Annotated[Literal['b'], Field(title='OwnKindBType')]
    uses_flag: Annotated[bool | None, Field(alias='usesFlag')] = False


class OwnKind(RootModel[OwnKindA | OwnKindB]):
    model_config = ConfigDict(populate_by_name=True)
    root: OwnKindA | OwnKindB


MODELS = {'OwnGoal': OwnGoal, 'OwnGoalParams': OwnGoalParams, 'OwnApproval': OwnApproval, 'OwnGranular': OwnGranular, 'OwnKind': OwnKind}


def _errors(exc):
    errs = exc.errors()
    return {'class': '%s.%s' % (type(exc).__module__, type(exc).__qualname__), 'error_count': exc.error_count(),
            'errors': [{'type': e.get('type'), 'loc': [x if isinstance(x, (int, str)) else str(x) for x in e.get('loc', ())]} for e in errs][:32]}


def _dump(obj, **kw):
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter('always')
        out = obj.model_dump(**kw)
    return out, len(w)


def oracle(ops):
    """ops: [[kind, name, arg, as]] with kind validate | construct | dump | probe_type | probe_vars | probe_extra_none.
    Returns one record per op: {'result': value} or {'error': {class, error_count, errors}}."""
    names, out = {}, []
    for kind, name, arg, as_ in ops:
        try:
            if kind == 'validate':
                v = MODELS[name].model_validate(arg)
                names[as_] = v
                rec = {'result': _dump(v, by_alias=True, mode='json')[0]}
            elif kind == 'construct':
                v = MODELS[name](**arg)
                names[as_] = v
                rec = {'result': _dump(v, by_alias=True, mode='json')[0]}
            elif kind == 'dump':
                rec = {'result': _dump(names[name], by_alias=True, exclude_none=arg, mode='json')[0]}
            elif kind == 'probe_type':
                rec = {'result': type(names[name].root).__name__}
            elif kind == 'probe_vars':
                rec = {'result': arg in vars(names[name])}
            elif kind == 'probe_extra_none':
                rec = {'result': names[name].__pydantic_extra__ is None}
            else:
                rec = {'unknown_op': kind}
        except ValidationError as exc:
            rec = {'error': _errors(exc)}
        out.append(rec)
    return out
