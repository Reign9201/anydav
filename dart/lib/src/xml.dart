import 'package:xml/xml.dart';

import 'errors.dart';

class RawDavResponse {
  const RawDavResponse({
    required this.href,
    required this.status,
    required this.propstatStatuses,
    required this.props,
    required this.isCollection,
    this.quotaAvailableBytes,
    this.quotaUsedBytes,
  });

  final String href;
  final int status;
  final List<int> propstatStatuses;
  final Map<String, String> props;
  final bool isCollection;
  final int? quotaAvailableBytes;
  final int? quotaUsedBytes;
}

XmlElement? _firstChild(XmlElement parent, String localName) {
  final wanted = localName.toLowerCase();
  for (final child in parent.childElements) {
    if (child.name.local.toLowerCase() == wanted) return child;
  }
  return null;
}

int _parseStatus(String value, String source) {
  final match = RegExp(r'HTTP/\d\.\d\s+(\d{3})', caseSensitive: false)
          .firstMatch(value) ??
      RegExp(r'^\s*(\d{3})\s*$').firstMatch(value);
  if (match == null) {
    throw DavError(
      DavErrorCode.parse,
      'Malformed WebDAV XML: invalid status line "$value"',
      responseBody: source.length > 2000 ? source.substring(0, 2000) : source,
    );
  }
  return int.parse(match.group(1)!);
}

List<RawDavResponse> parseMultiStatus(String source) {
  XmlDocument document;
  try {
    document = XmlDocument.parse(source);
  } catch (error) {
    throw DavError(
      DavErrorCode.parse,
      'Malformed WebDAV XML: $error',
      responseBody: source.length > 2000 ? source.substring(0, 2000) : source,
      hint: '服务器返回的不是合法 multistatus XML；请检查 baseUrl 是否指向 WebDAV 根路径。',
    );
  }
  final root = document.rootElement;
  if (root.name.local.toLowerCase() != 'multistatus') {
    throw DavError(
      DavErrorCode.parse,
      'Malformed WebDAV XML: expected <multistatus>, got <${root.name.qualified}>',
      responseBody: source.length > 2000 ? source.substring(0, 2000) : source,
    );
  }

  final responses = <RawDavResponse>[];
  for (final response in root.childElements) {
    if (response.name.local.toLowerCase() != 'response') continue;
    final href = _firstChild(response, 'href')?.innerText.trim() ?? '';
    if (href.isEmpty) continue;
    final props = <String, String>{};
    final propstatStatuses = <int>[];
    var isCollection = false;

    for (final propstat in response.childElements) {
      if (propstat.name.local.toLowerCase() != 'propstat') continue;
      final statusText = _firstChild(propstat, 'status')?.innerText.trim();
      final status = statusText == null || statusText.isEmpty
          ? 200
          : _parseStatus(statusText, source);
      propstatStatuses.add(status);
      if (status < 200 || status >= 300) continue;
      final prop = _firstChild(propstat, 'prop');
      if (prop == null) continue;
      for (final node in prop.childElements) {
        final key = node.name.local.toLowerCase();
        if (key == 'resourcetype') {
          isCollection = node.childElements
              .any((child) => child.name.local.toLowerCase() == 'collection');
          props[key] = isCollection ? 'collection' : '';
        } else {
          props[key] = node.innerText.trim();
        }
      }
    }

    final statusText = _firstChild(response, 'status')?.innerText.trim();
    final status = statusText == null || statusText.isEmpty
        ? (propstatStatuses.isEmpty ? 200 : propstatStatuses.first)
        : _parseStatus(statusText, source);
    if (props['resourcetype'] == 'collection') isCollection = true;

    int? numberProp(String name) {
      final raw = props[name];
      if (raw == null || raw.isEmpty) return null;
      final value = int.tryParse(raw);
      return value != null && value >= 0 ? value : null;
    }

    responses.add(
      RawDavResponse(
        href: href,
        status: status,
        propstatStatuses: propstatStatuses,
        props: props,
        isCollection: isCollection,
        quotaAvailableBytes: numberProp('quota-available-bytes'),
        quotaUsedBytes: numberProp('quota-used-bytes'),
      ),
    );
  }
  return responses;
}

const List<String> defaultProps = <String>[
  'resourcetype',
  'getetag',
  'getcontentlength',
  'getlastmodified',
  'getcontenttype',
  'displayname',
  'quota-available-bytes',
  'quota-used-bytes',
];

String buildPropfindBody({List<String> props = defaultProps}) =>
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop>'
    '${props.map((prop) => '<d:$prop/>').join()}'
    '</d:prop></d:propfind>';
