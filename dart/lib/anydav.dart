/// Aggregated WebDAV client for Flutter and Dart.
///
/// ```dart
/// final client = WebDavClient(
///   provider: 'jianguoyun',
///   baseUrl: 'https://dav.jianguoyun.com/dav/',
///   username: 'me@example.com',
///   password: 'app-password',
/// );
/// await client.writeJson('/myapp/state.json', {'hello': 'world'});
/// ```
library;

export 'src/auth.dart'
    show
        AuthOptions,
        DigestChallenge,
        WebDavAuth,
        basicAuthHeader,
        digestAuthHeader,
        parseDigestChallenge;
export 'src/client.dart' show WebDavClient, createWebDavClient;
export 'src/errors.dart'
    show
        DavError,
        DavErrorCode,
        errorFromStatus,
        hintForStatus,
        networkError,
        parseHttpDate,
        parseRetryAfter;
export 'src/paths.dart'
    show
        NormalizedBaseUrl,
        buildUrl,
        encodePath,
        hrefPath,
        isRootPath,
        joinUrl,
        nameFromPath,
        normalizeBaseUrl,
        normalizePath,
        parentPaths,
        parseContentLength,
        pathFromHref,
        pathsEqual,
        safeDecodeComponent;
export 'src/providers.dart'
    show
        detectProvider,
        fillUrlTemplate,
        getProvider,
        hasProvider,
        providerLabel,
        providerSpec,
        providers,
        resolveProvider;
export 'src/sync.dart'
    show
        JsonSyncEngine,
        JsonSyncOptions,
        MemorySyncCache,
        MergeContext,
        RemoteState,
        SyncCache,
        SyncCacheSnapshot,
        SyncResult,
        createJsonSync,
        stableStringify;
export 'src/types.dart';
export 'src/xml.dart'
    show RawDavResponse, buildPropfindBody, defaultProps, parseMultiStatus;
