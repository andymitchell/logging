/**
 * One trace exactly as libraries before entries were versioned stored it: a "Sign in" span holding a "Check
 * password" span, which logged an `info` (whose context held a bigint, stored as its `redact:` marker) and a
 * `warn` (with its stack trace), each span then ended. No entry carries `format_version`.
 *
 * Frozen: never regenerate or edit it. It stands for what is already on users' devices.
 */
export const unversionedTrace: readonly Record<string, unknown>[] = [
    {
        type: 'event',
        meta: {
            type: 'span',
            span: {
                id: '23770716-e188-4758-99f7-1b5b6e3f041e',
                top_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
            },
        },
        message: 'Sign in',
        context: {
            method: 'password',
        },
        event: {
            name: 'span_start',
        },
        timestamp: 1748768400000,
        ulid: '01JWNBG8M01XSAN1G0W7BZXFAC',
    },
    {
        type: 'event',
        meta: {
            type: 'span',
            span: {
                id: '962f66dd-45a4-4bd0-ad47-f187b35995b7',
                parent_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
                top_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
            },
        },
        message: 'Check password',
        context: {
            user: 'u_1',
        },
        event: {
            name: 'span_start',
        },
        timestamp: 1748768400000,
        ulid: '01JWNBG8M01XSAN1G0W7BZXFAD',
    },
    {
        type: 'info',
        message: 'Password checked',
        context: {
            attempts: 1,
            session_bytes: 'redact:bigint:12',
        },
        meta: {
            type: 'span',
            span: {
                id: '962f66dd-45a4-4bd0-ad47-f187b35995b7',
                parent_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
                top_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
            },
        },
        timestamp: 1748768400000,
        ulid: '01JWNBG8M01XSAN1G0W7BZXFAE',
    },
    {
        type: 'warn',
        message: 'Password is due for renewal',
        context: {
            days_left: 3,
        },
        meta: {
            type: 'span',
            span: {
                id: '962f66dd-45a4-4bd0-ad47-f187b35995b7',
                parent_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
                top_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
            },
        },
        timestamp: 1748768400000,
        stack_trace: '    at guardedWrite (https://my-app.example/assets/index.js:51:47)\n    at Span.#write (https://my-app.example/assets/index.js:80:16)\n    at Span.warn (https://my-app.example/assets/index.js:101:21)\n    at checkPassword (https://my-app.example/assets/sign-in.js:16:17)',
        ulid: '01JWNBG8M01XSAN1G0W7BZXFAF',
    },
    {
        type: 'event',
        meta: {
            type: 'span',
            span: {
                id: '962f66dd-45a4-4bd0-ad47-f187b35995b7',
                parent_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
                top_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
            },
        },
        event: {
            name: 'span_end',
        },
        timestamp: 1748768400000,
        ulid: '01JWNBG8M01XSAN1G0W7BZXFAG',
    },
    {
        type: 'event',
        meta: {
            type: 'span',
            span: {
                id: '23770716-e188-4758-99f7-1b5b6e3f041e',
                top_id: '23770716-e188-4758-99f7-1b5b6e3f041e',
            },
        },
        event: {
            name: 'span_end',
        },
        timestamp: 1748768400000,
        ulid: '01JWNBG8M01XSAN1G0W7BZXFAH',
    },
];

/** The id of {@link unversionedTrace}: its top span's id, which every entry in it carries as `top_id`. */
export const unversionedTraceId = '23770716-e188-4758-99f7-1b5b6e3f041e';
