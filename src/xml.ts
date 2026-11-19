import { DavError } from './errors.js';

/**
 * A deliberately small, dependency-free XML reader for WebDAV multistatus
 * bodies. It is not a general-purpose XML implementation: it supports
 * elements, attributes, namespace prefixes, CDATA, comments, processing
 * instructions and the five predefined entities, which is everything WebDAV
 * servers emit in practice.
 */

export interface XmlElement {
  /** Qualified name exactly as written, e.g. `d:response`. */
  name: string;
  /** Local name, e.g. `response`. */
  localName: string;
  /** Namespace prefix, or '' when unprefixed. */
  prefix: string;
  /** Resolved namespace URI, when the document declares one. */
  namespace?: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** Direct text content (decoded), excluding child elements. */
  text: string;
}

function parseError(message: string, source: string): DavError {
  return new DavError({
    code: 'PARSE',
    message: `Malformed WebDAV XML: ${message}`,
    responseBody: source.slice(0, 2000),
    hint: '服务器返回的不是合法 multistatus XML；请检查 baseUrl 是否指向 WebDAV 根路径。',
  });
}

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x?[0-9A-Fa-f]+|amp|lt|gt|quot|apos);/g, (match, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const code = Number.parseInt(entity.slice(2), 16);
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        if (entity.startsWith('#')) {
          const code = Number.parseInt(entity.slice(1), 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return match;
      }
    }
  });
}

function splitQualifiedName(name: string): { localName: string; prefix: string } {
  const index = name.indexOf(':');
  if (index < 0) return { localName: name, prefix: '' };
  return { localName: name.slice(index + 1), prefix: name.slice(0, index) };
}

/**
 * Parse an XML document and return its root element. Throws {@link DavError}
 * with code `PARSE` on malformed input.
 */
export function parseXml(source: string): XmlElement {
  const input = source.replace(/^﻿/, '');
  const holder: XmlElement = {
    name: '#document',
    localName: '#document',
    prefix: '',
    attributes: {},
    children: [],
    text: '',
  };
  const stack: XmlElement[] = [holder];
  const nsStack: Array<Map<string, string>> = [new Map()];
  let index = 0;

  const current = () => stack[stack.length - 1];

  const appendText = (raw: string) => {
    if (!raw) return;
    current().text += decodeEntities(raw);
  };

  const readName = (): string => {
    const start = index;
    while (index < input.length) {
      const ch = input[index];
      if (ch === '>' || ch === '/' || ch === '=' || /\s/.test(ch)) break;
      index++;
    }
    if (start === index) throw parseError('empty tag name', source);
    return input.slice(start, index);
  };

  const skipWhitespace = () => {
    while (index < input.length && /\s/.test(input[index])) index++;
  };

  while (index < input.length) {
    const lt = input.indexOf('<', index);
    if (lt < 0) {
      appendText(input.slice(index));
      break;
    }
    if (lt > index) appendText(input.slice(index, lt));
    index = lt;

    if (input.startsWith('<!--', index)) {
      const end = input.indexOf('-->', index + 4);
      if (end < 0) throw parseError('unterminated comment', source);
      index = end + 3;
      continue;
    }
    if (input.startsWith('<![CDATA[', index)) {
      const end = input.indexOf(']]>', index + 9);
      if (end < 0) throw parseError('unterminated CDATA section', source);
      current().text += input.slice(index + 9, end);
      index = end + 3;
      continue;
    }
    if (input.startsWith('<?', index)) {
      const end = input.indexOf('?>', index + 2);
      if (end < 0) throw parseError('unterminated processing instruction', source);
      index = end + 2;
      continue;
    }
    if (input.startsWith('<!', index)) {
      const end = input.indexOf('>', index + 2);
      if (end < 0) throw parseError('unterminated declaration', source);
      index = end + 1;
      continue;
    }
    if (input.startsWith('</', index)) {
      const end = input.indexOf('>', index + 2);
      if (end < 0) throw parseError('unterminated closing tag', source);
      const name = input.slice(index + 2, end).trim();
      index = end + 1;
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw parseError(`unexpected closing tag </${name}>`, source);
      }
      nsStack.pop();
      continue;
    }

    // Start tag.
    index++; // consume '<'
    const name = readName();
    const attributes: Record<string, string> = {};
    let selfClosing = false;
    while (index < input.length) {
      skipWhitespace();
      if (input[index] === '>') {
        index++;
        break;
      }
      if (input[index] === '/' && input[index + 1] === '>') {
        selfClosing = true;
        index += 2;
        break;
      }
      const attrName = readName();
      skipWhitespace();
      if (input[index] !== '=') throw parseError(`attribute ${attrName} has no value`, source);
      index++;
      skipWhitespace();
      const quote = input[index];
      if (quote !== '"' && quote !== "'") throw parseError(`attribute ${attrName} is not quoted`, source);
      const valueStart = ++index;
      const valueEnd = input.indexOf(quote, valueStart);
      if (valueEnd < 0) throw parseError(`unterminated attribute ${attrName}`, source);
      attributes[attrName] = decodeEntities(input.slice(valueStart, valueEnd));
      index = valueEnd + 1;
    }

    const parentNs = nsStack[nsStack.length - 1];
    let namespaceMap = parentNs;
    const declarations = Object.keys(attributes).filter((key) => key === 'xmlns' || key.startsWith('xmlns:'));
    if (declarations.length > 0) {
      namespaceMap = new Map(parentNs);
      for (const key of declarations) {
        namespaceMap.set(key === 'xmlns' ? '' : key.slice(6), attributes[key]);
      }
    }
    const { localName, prefix } = splitQualifiedName(name);
    const element: XmlElement = {
      name,
      localName,
      prefix,
      namespace: namespaceMap.get(prefix),
      attributes,
      children: [],
      text: '',
    };
    current().children.push(element);
    if (!selfClosing) {
      stack.push(element);
      nsStack.push(namespaceMap);
    }
  }

  if (stack.length !== 1) {
    throw parseError(`unclosed element <${stack[stack.length - 1].name}>`, source);
  }
  const root = holder.children[0];
  if (!root) throw parseError('document has no root element', source);
  return root;
}

export function localNameEquals(element: XmlElement, name: string): boolean {
  return element.localName.toLowerCase() === name.toLowerCase();
}

export function findChildren(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => localNameEquals(child, name));
}

export function findFirstChild(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => localNameEquals(child, name));
}

export function findDescendants(element: XmlElement, name: string): XmlElement[] {
  const result: XmlElement[] = [];
  const walk = (node: XmlElement) => {
    for (const child of node.children) {
      if (localNameEquals(child, name)) result.push(child);
      walk(child);
    }
  };
  walk(element);
  return result;
}

export function textContent(element: XmlElement): string {
  let value = element.text;
  for (const child of element.children) value += textContent(child);
  return value;
}

export function trimmedText(element: XmlElement | undefined): string {
  return element ? textContent(element).trim() : '';
}

export interface RawDavResponse {
  href: string;
  status: number;
  propstatStatuses: number[];
  /** Property local name -> trimmed text. `resourcetype` is `collection` or ''. */
  props: Record<string, string>;
  isCollection: boolean;
  quotaAvailableBytes?: number;
  quotaUsedBytes?: number;
}

function parseStatus(value: string, source: string): number {
  const match = /HTTP\/\d\.\d\s+(\d{3})/i.exec(value) || /^\s*(\d{3})\s*$/.exec(value);
  if (!match) throw parseError(`invalid status line "${value}"`, source);
  return Number(match[1]);
}

/**
 * Parse a 207 Multi-Status body into raw responses. The caller resolves hrefs
 * against its base URL because servers differ in prefixes.
 */
export function parseMultiStatus(source: string): RawDavResponse[] {
  const root = parseXml(source);
  if (!localNameEquals(root, 'multistatus')) {
    // Some servers answer 207 with an error body; surface it as a parse error.
    throw parseError(`expected <multistatus>, got <${root.name}>`, source);
  }
  const responses: RawDavResponse[] = [];
  for (const response of findChildren(root, 'response')) {
    const hrefElement = findFirstChild(response, 'href') ?? findDescendants(response, 'href')[0];
    const href = trimmedText(hrefElement);
    if (!href) continue;
    const props: Record<string, string> = {};
    const propstatStatuses: number[] = [];
    let isCollection = false;

    for (const propstat of findChildren(response, 'propstat')) {
      const statusText = trimmedText(findFirstChild(propstat, 'status'));
      const status = statusText ? parseStatus(statusText, source) : 200;
      propstatStatuses.push(status);
      if (status < 200 || status >= 300) continue;
      const prop = findFirstChild(propstat, 'prop');
      if (!prop) continue;
      for (const node of prop.children) {
        const key = node.localName.toLowerCase();
        if (key === 'resourcetype') {
          isCollection =
            findChildren(node, 'collection').length > 0 ||
            findDescendants(node, 'collection').length > 0;
          props[key] = isCollection ? 'collection' : '';
        } else {
          props[key] = textContent(node).trim();
        }
      }
    }

    const statusText = trimmedText(findFirstChild(response, 'status'));
    const status = statusText ? parseStatus(statusText, source) : (propstatStatuses[0] ?? 200);
    if (props.resourcetype === 'collection') isCollection = true;

    const numberProp = (name: string): number | undefined => {
      const raw = props[name];
      if (raw === undefined || raw === '') return undefined;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    };

    responses.push({
      href,
      status,
      propstatStatuses,
      props,
      isCollection,
      quotaAvailableBytes: numberProp('quota-available-bytes'),
      quotaUsedBytes: numberProp('quota-used-bytes'),
    });
  }
  return responses;
}

const DEFAULT_PROPS = [
  'resourcetype',
  'getetag',
  'getcontentlength',
  'getlastmodified',
  'getcontenttype',
  'displayname',
  'quota-available-bytes',
  'quota-used-bytes',
];

/** Build the PROPFIND request body. */
export function buildPropfindBody(props: readonly string[] = DEFAULT_PROPS): string {
  const requested = props.map((prop) => `<d:${prop}/>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop>${requested}</d:prop></d:propfind>`;
}

export { DEFAULT_PROPS };
