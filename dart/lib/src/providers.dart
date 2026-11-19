import 'dart:convert';

import 'errors.dart';
import 'providers.generated.dart';
import 'types.dart';

final Map<String, dynamic> providerSpec =
    (jsonDecode(providerSpecJson) as Map).cast<String, dynamic>();

final List<ProviderPreset> providers = (providerSpec['providers'] as List)
    .map((item) => ProviderPreset.fromJson((item as Map).cast<String, dynamic>()))
    .toList(growable: false);

final Map<String, ProviderPreset> _byId = <String, ProviderPreset>{
  for (final provider in providers) provider.id: provider,
};

ProviderPreset getProvider(String id) {
  final provider = _byId[id.trim().toLowerCase()];
  if (provider == null) {
    throw DavError(
      DavErrorCode.providerUnknown,
      'Unknown WebDAV provider: $id',
      hint: '可用 provider: ${providers.map((item) => item.id).join(', ')}',
    );
  }
  return provider;
}

bool hasProvider(String id) => _byId.containsKey(id.trim().toLowerCase());

bool _hostMatches(String host, String pattern) {
  final normalized = pattern.toLowerCase();
  if (host == normalized) return true;
  final suffix = normalized.startsWith('.') ? normalized : '.$normalized';
  return host.endsWith(suffix);
}

ProviderMatch detectProvider(String baseUrl) {
  final uri = Uri.tryParse(baseUrl.trim());
  if (uri == null || uri.host.isEmpty) {
    throw DavError(
      DavErrorCode.invalidUrl,
      'Invalid WebDAV URL: $baseUrl',
      hint: '地址必须以 http:// 或 https:// 开头。',
    );
  }
  final host = uri.host.toLowerCase();
  final path = uri.path.toLowerCase();
  final port = uri.port;
  var bestScore = 0;
  ProviderPreset? best;
  final reasons = <String>[];

  for (final provider in providers) {
    final detect = provider.detect;
    if (detect == null) continue;
    var score = 0;
    final matches = <String>[];
    for (final candidate in detect.hosts ?? const <String>[]) {
      if (host == candidate.toLowerCase()) {
        score += 100;
        matches.add('host=$candidate');
      }
    }
    for (final suffix in detect.hostSuffixes ?? const <String>[]) {
      if (_hostMatches(host, suffix)) {
        score += 80;
        matches.add('host~$suffix');
      }
    }
    for (final fragment in detect.pathIncludes ?? const <String>[]) {
      if (path.contains(fragment.toLowerCase())) {
        score += 60;
        matches.add('path~$fragment');
      }
    }
    for (final candidatePort in detect.ports ?? const <int>[]) {
      if (port == candidatePort) {
        score += 30;
        matches.add('port=$candidatePort');
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = provider;
      reasons
        ..clear()
        ..addAll(matches);
    }
  }

  if (best != null) {
    return ProviderMatch(
      provider: best,
      confidence: bestScore >= 100
          ? 'high'
          : bestScore >= 60
              ? 'medium'
              : 'low',
      reason: reasons.join(', '),
    );
  }
  return ProviderMatch(
    provider: getProvider('generic'),
    confidence: 'none',
    reason: 'no provider pattern matched',
  );
}

ResolvedProvider resolveProvider(String? providerId, String baseUrl) {
  if (providerId != null && providerId.trim().isNotEmpty) {
    final preset = getProvider(providerId);
    return ResolvedProvider(
      provider: preset,
      match: ProviderMatch(
        provider: preset,
        confidence: 'high',
        reason: 'explicit provider id',
      ),
      detected: false,
    );
  }
  final match = detectProvider(baseUrl);
  return ResolvedProvider(
    provider: match.provider,
    match: match,
    detected: match.confidence != 'none',
  );
}

String fillUrlTemplate(
  String template, {
  String? host,
  String? username,
  String? email,
  String? server,
  String? id,
  Object? port,
  String? share,
}) {
  final values = <String, String?>{
    'host': host,
    'username': username,
    'email': email,
    'server': server,
    'id': id,
    'port': port?.toString(),
    'share': share,
  };
  return template.replaceAllMapped(RegExp(r'\{([a-zA-Z][a-zA-Z0-9]*)\}'), (match) {
    final key = match.group(1)!;
    final value = values[key];
    return value == null || value.isEmpty ? match.group(0)! : value;
  });
}

String providerLabel(ProviderPreset provider, {String? locale}) {
  if (locale != null && locale.toLowerCase().startsWith('zh')) {
    return provider.nameZh ?? provider.name;
  }
  return provider.name;
}
