/// <reference types="vite/client" />

declare const __CVG_WEB_IDENTITY_MODE__: string
declare const __CVG_WEB_CONTROLLED_TEST__: boolean
declare const __CVG_WEB_MODE__: string
/** SPEC0259 §4.6: `''` (current profile) or `'oidc'`. */
declare const __CVG_OPERATOR_LOGIN__: string
/** SPEC0259 §4.6: exact `https:` origins of the OIDC profile, else `''`. */
declare const __CVG_CONSOLE_ORIGIN__: string
declare const __CVG_API_ORIGIN__: string
