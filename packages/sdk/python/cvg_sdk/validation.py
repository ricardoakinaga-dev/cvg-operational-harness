"""Bounded JSON and source-pinned CVG v1 validation; no remote schema resolver."""
import hashlib
import json
import math
from pathlib import Path
import re

from .protocol import _CONTRACT, SDK_METHODS, STOP_REASONS

SAFE = 9007199254740991
JS_SPACE = '\t\n\v\f\r \u00a0\ufeff\u1680' + ''.join(map(chr, range(0x2000, 0x200b))) + '\u2028\u2029\u202f\u205f\u3000'


class Invalid(ValueError):
    def __init__(self):
        super().__init__('Invalid SDK value')


class Limit(Invalid):
    pass


def require(ok):
    if not ok:
        raise Invalid()


def number(v):
    try:
        return type(v) in (int, float) and math.isfinite(v)
    except OverflowError:
        return False


def integer(v, minimum=-SAFE, maximum=SAFE):
    return number(v) and minimum <= v <= maximum and int(v) == v


def utf16(s):
    return sum(2 if ord(c) > 65535 else 1 for c in s)


def identifier(v):
    return (type(v) is str and bool(v.strip(JS_SPACE)) and utf16(v) <= 200
            and '\0' not in v and not any(0xd800 <= ord(c) <= 0xdfff for c in v))


def valid_id(v):
    return identifier(v) or integer(v)


def id_key(v):
    require(valid_id(v))
    return ('string', v) if type(v) is str else ('number', int(v))


def _string_size(s, ascii_only):
    size = 2
    for c in s:
        n = ord(c)
        require(not 0xd800 <= n <= 0xdfff)
        if c in '\"\\\b\t\n\f\r':
            size += 2
        elif n < 32:
            size += 6
        elif ascii_only and n > 126:
            size += 12 if n > 65535 else 6
        else:
            size += 1 if n < 128 else 2 if n < 2048 else 3 if n < 65536 else 4
        yield size


def json_size(value, cap, *, canonical_upper=False):
    """Preflight exact ensure_ascii size, or safe JS-canonical upper bound.

    No custom converters/subclasses, recursion, cycles or unbounded string chunk.
    Keys do not count as value nodes, matching the CVG event node budget.
    """
    nodes, total, seen = 0, 0, set()

    def charge(n):
        nonlocal total
        total += n
        if total > cap:
            raise Limit()

    def string(s):
        previous = 0
        for count in _string_size(s, not canonical_upper):
            charge(count - previous)
            previous = count
        if not s:
            charge(2)

    def walk(v, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= 20000 and depth <= 64)
        t = type(v)
        if t is str:
            string(v)
        elif v is None:
            charge(4)
        elif t is bool:
            charge(4 if v else 5)
        elif t in (int, float):
            require(number(v))
            charge(25 if canonical_upper else len(str(v)))
        elif t in (dict, list):
            require(id(v) not in seen)
            seen.add(id(v))
            charge(2 + max(0, len(v) - 1))
            if t is dict:
                for k, item in v.items():
                    require(type(k) is str)
                    string(k)
                    charge(1)
                    walk(item, depth + 1)
            else:
                for item in v:
                    walk(item, depth + 1)
            seen.remove(id(v))
        else:
            raise Invalid()
    walk(value, 0)
    return total


def _prescan(text):
    # Count value tokens and container nesting before the stdlib allocates a tree.
    i, depth, nodes = 0, 0, 0
    while i < len(text):
        c = text[i]
        if c in ' \t\r\n,:':
            i += 1
            continue
        if c in '}]':
            depth -= 1
            require(depth >= 0)
            i += 1
            continue
        require(depth <= 64)
        if c == '"':
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                elif text[i] == '"':
                    i += 1
                    break
                else:
                    i += 1
            j = i
            while j < len(text) and text[j] in ' \t\r\n':
                j += 1
            if j < len(text) and text[j] == ':':
                continue
        elif c in '[{':
            depth += 1
            i += 1
        else:
            while i < len(text) and text[i] not in ' \t\r\n,]}:':
                i += 1
        nodes += 1
        require(nodes <= 20000)


def decode(frame):
    text = frame.decode('utf-8', errors='strict')
    _prescan(text)

    def pairs(items):
        d = {}
        for k, v in items:
            require(k not in d)
            d[k] = v
        return d

    def numeric(s):
        value = int(s) if len(s.lstrip('-')) <= 16 else float(s)
        if type(value) is int and abs(value) > SAFE:
            value = float(value)
        require(number(value))
        return value

    def bad_constant(_):
        raise Invalid()
    value = json.loads(text, object_pairs_hook=pairs, parse_int=numeric,
                       parse_constant=bad_constant)
    # Check finite floats and escaped lone surrogates after decode, under budget.
    json_size(value, 32 * 1024 * 1024, canonical_upper=True)
    return value


def encode(value, cap):
    json_size(value, cap - 1)
    frame = (''.join(json.JSONEncoder(ensure_ascii=True, allow_nan=False,
                     separators=(',', ':')).iterencode(value)) + '\n').encode('ascii')
    if len(frame) > cap:
        raise Limit()
    return frame


def validate_request(r):
    require(type(r) is dict and r.get('jsonrpc') == '2.0' and valid_id(r.get('id')))
    require(type(r.get('method')) is str and len(r['method']) > 0)
    require('params' not in r or type(r['params']) in (dict, list))
    m, p = r['method'], r.get('params')
    if m not in SDK_METHODS:
        return
    require(type(p) is dict)
    if m == 'sdk.hello':
        require(number(p.get('protocolVersion')))
    elif m == 'session.open':
        require(identifier(p.get('sessionId')))
    elif m == 'turn.send':
        msg = p.get('userMessage')
        require(type(msg) is str and bool(msg.strip(JS_SPACE)))
        require(len(msg.encode('utf-8')) <= 65536)
        require('sessionId' not in p or identifier(p['sessionId']))
    else:
        require(identifier(p.get('sessionId')))
        require(integer(p.get('afterSequence') if p.get('afterSequence') is not None else 0, 0))
        require(integer(p.get('limit') if p.get('limit') is not None else 100, 1, 500))


def _catalog():
    data = Path(__file__).with_name('session_event_schemas_v1.json').read_bytes()
    require(hashlib.sha256(data).hexdigest() == _CONTRACT['source_sha256'][
        'packages/contracts/src/session-event-schemas.v1.json'])
    catalog = json.loads(data)
    check_catalog(catalog)
    return catalog


def check_catalog(catalog):
    keywords = {'$ref', 'type', 'enum', 'minimum', 'maximum', 'minLength',
                'maxLength', 'pattern', 'x-maxUtf8Bytes', 'items', 'required',
                'additionalProperties', 'properties'}

    def schema(s):
        require(type(s) is dict and set(s) <= keywords)
        if '$ref' in s:
            require(s['$ref'].startswith('#/definitions/') and s['$ref'][14:] in catalog['definitions'])
        if 'pattern' in s:
            require(s['pattern'] in ('^[^\\u0000]+$', '^[a-f0-9]{64}$'))
        if 'type' in s:
            require(s['type'] in ('string', 'integer', 'number', 'object', 'array'))
        for child in s.get('properties', {}).values():
            schema(child)
        if 'items' in s:
            schema(s['items'])
    require(catalog['formatVersion'] == 1)
    require(set(catalog['events']) == set(_CONTRACT['event_fingerprints']))
    for s in [*catalog['definitions'].values(), *catalog['events'].values()]:
        schema(s)


CATALOG = _catalog()


def _check(s, v):
    if '$ref' in s:
        return _check(CATALOG['definitions'][s['$ref'][14:]], v)
    if 'enum' in s:
        require(any(type(x) is type(v) and x == v for x in s['enum']))
    t = s.get('type')
    if t == 'string':
        require(type(v) is str)
        if 'minLength' in s:
            require(bool(v.strip(JS_SPACE)) and utf16(v) >= s['minLength'])
        if 'maxLength' in s:
            require(utf16(v) <= s['maxLength'])
        if s.get('pattern') == '^[^\\u0000]+$':
            require(bool(v) and '\0' not in v)
        elif 'pattern' in s:
            require(re.fullmatch('[a-f0-9]{64}', v) is not None)
        if 'x-maxUtf8Bytes' in s:
            require(len(v.encode('utf-8')) <= s['x-maxUtf8Bytes'])
    elif t in ('integer', 'number'):
        require(integer(v) if t == 'integer' else number(v))
        require(v >= s.get('minimum', -math.inf) and v <= s.get('maximum', math.inf))
    elif t == 'array':
        require(type(v) is list)
        for item in v:
            _check(s['items'], item)
    elif t == 'object':
        require(type(v) is dict and set(s.get('required', [])) <= v.keys())
        props = s.get('properties', {})
        for k, item in v.items():
            if k in props:
                _check(props[k], item)
            else:
                require(s.get('additionalProperties') is not False)


def _timestamp(v):
    require(type(v) is str)
    match = re.fullmatch(r'([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z', v)
    require(match is not None)
    y, m, d, hh, mm, ss, _ = map(int, match.groups())
    require(1 <= m <= 12 and hh < 24 and mm < 60 and ss < 60)
    days = (31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    require(1 <= d <= days[m - 1])


def validate_event(e):
    json_size(e, 1048576, canonical_upper=True)
    fields = {'tenantId', 'sessionId', 'formatVersion', 'eventId', 'timestamp',
              'correlationId', 'traceId', 'type', 'payload', 'sequence', 'schemaFingerprint'}
    require(type(e) is dict and set(e) == fields)
    for key in ('tenantId', 'sessionId', 'eventId', 'correlationId', 'traceId'):
        _check(CATALOG['definitions']['id'], e[key])
    require(integer(e['formatVersion'], 1, 1) and integer(e['sequence'], 1))
    _timestamp(e['timestamp'])
    require(type(e['type']) is str and e['type'] in CATALOG['events'])
    require(e['schemaFingerprint'] == _CONTRACT['event_fingerprints'][e['type']])
    _check(CATALOG['events'][e['type']], e['payload'])
    p = e['payload']
    if 'correlationId' in p:
        require(p['correlationId'] == e['correlationId'])
    if e['type'] == 'model/request':
        require(p['request']['correlationId'] == e['correlationId'])
    if e['type'] == 'context/compacted':
        require(p['throughSequence'] < e['sequence'])


def validate_response(request, response, tenant):
    r, p, m = response, request.get('params', {}), request['method']
    require(type(r) is dict and r.get('jsonrpc') == '2.0' and valid_id(r.get('id')))
    require(id_key(r['id']) == id_key(request['id']))
    require(('result' in r) != ('error' in r))
    if 'error' in r:
        e = r['error']
        require(type(e) is dict and integer(e.get('code')) and type(e.get('message')) is str)
        require(1 <= len(e['message'].encode('utf-8')) <= 1024)
        return
    v = r['result']
    require(m in SDK_METHODS and type(v) is dict)
    if m == 'sdk.hello':
        c = v.get('capabilities')
        require(integer(v.get('protocolVersion'), 1, 1) and type(c) is dict)
        require(type(c.get('sessions')) is bool and type(c.get('events')) is bool)
        methods = c.get('methods')
        require(type(methods) is list and all(type(x) is str and x in SDK_METHODS for x in methods))
        require(len(set(methods)) == len(methods) and {'sdk.hello', 'turn.send'} <= set(methods))
        require(('session.open' in methods) == c['sessions'])
        require(('session.events' in methods) == c['events'] and (not c['events'] or c['sessions']))
    elif m == 'session.open':
        require(v.get('sessionId') == p['sessionId'] and integer(v.get('formatVersion'), 1, 1))
    elif m == 'turn.send':
        u = v.get('usage')
        require(type(v.get('stopReason')) is str and v['stopReason'] in STOP_REASONS and type(v.get('response')) is str)
        require(integer(v.get('modelCalls'), 0) and integer(v.get('toolCalls'), 0) and type(u) is dict)
        require(integer(u.get('inputTokens'), 0) and integer(u.get('outputTokens'), 0))
        require(number(u.get('costUsd')) and u['costUsd'] >= 0)
        require(v.get('sessionId') == p['sessionId'] if 'sessionId' in p else 'sessionId' not in v)
    else:
        events, cursor, ids = v.get('events'), p.get('afterSequence') or 0, set()
        require(type(events) is list and len(events) <= (p.get('limit') or 100))
        for event in events:
            validate_event(event)
            require(event['tenantId'] == tenant and event['sessionId'] == p['sessionId'])
            require(event['sequence'] > cursor and event['eventId'] not in ids)
            cursor = event['sequence']
            ids.add(event['eventId'])
