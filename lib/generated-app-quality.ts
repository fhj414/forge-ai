import { parse, type Node } from "acorn";

import type { GeneratedApp } from "@/types/ai";

export const GENERATED_APP_QUALITY_VIOLATION_CODES = [
  "HTML_DOCUMENT_WRAPPER",
  "HTML_SCRIPT_WRAPPER",
  "HTML_STYLE_WRAPPER",
  "HTML_INLINE_EVENT_HANDLER",
  "ACTIONABLE_HTML_REQUIRES_JAVASCRIPT",
  "ACTIONABLE_HTML_REQUIRES_EVENT_LISTENER",
  "JAVASCRIPT_SYNTAX_ERROR",
  "JAVASCRIPT_NETWORK_API",
  "JAVASCRIPT_MODULE_IMPORT",
  "JAVASCRIPT_DOCUMENT_WRITE",
] as const;

export type GeneratedAppQualityViolationCode =
  (typeof GENERATED_APP_QUALITY_VIOLATION_CODES)[number];

export interface GeneratedAppQualityResult {
  violationCodes: GeneratedAppQualityViolationCode[];
  correctiveMessage: string;
}

type AstNode = Node & Record<string, unknown>;

const DIRECT_NETWORK_IDENTIFIERS = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
]);
const GLOBAL_OBJECT_IDENTIFIERS = new Set(["window", "globalThis", "self"]);

interface ScannedHtmlTag {
  name: string;
  attributes: string;
}

function scanHtmlTags(html: string): ScannedHtmlTag[] {
  const tags: ScannedHtmlTag[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const tagStart = html.indexOf("<", cursor);
    if (tagStart < 0) break;

    let nameStart = tagStart + 1;
    while (/\s/.test(html[nameStart] ?? "")) nameStart += 1;

    const nameMatch = /^[a-z][\w:-]*/i.exec(html.slice(nameStart));
    if (!nameMatch) {
      cursor = tagStart + 1;
      continue;
    }

    const attributesStart = nameStart + nameMatch[0].length;
    let quote: '"' | "'" | undefined;
    let tagEnd = attributesStart;
    for (; tagEnd < html.length; tagEnd += 1) {
      const character = html[tagEnd];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }

    if (tagEnd >= html.length) break;
    tags.push({
      name: nameMatch[0].toLowerCase(),
      attributes: html.slice(attributesStart, tagEnd),
    });
    cursor = tagEnd + 1;
  }

  return tags;
}

function hasActionableInput(tags: ScannedHtmlTag[]) {
  return tags.some((tag) => {
    if (tag.name !== "input") return false;
    const { attributes } = tag;
    return !(
      /\btype\s*=\s*(?:"hidden"|'hidden'|hidden\b)/i.test(attributes) ||
      /(?:^|\s)hidden(?:\s|=|$)/i.test(attributes)
    );
  });
}

function hasActionableHtml(html: string, tags: ScannedHtmlTag[]) {
  return /<(?:button|form|select|textarea)\b/i.test(html) || hasActionableInput(tags);
}

function hasInlineEventHandler(tags: ScannedHtmlTag[]) {
  return tags.some((tag) =>
    /(?:^|\s|\/)on[a-z][\w:-]*\s*=/i.test(tag.attributes),
  );
}

function parseClassicScript(javascript: string): {
  program?: AstNode;
  syntaxError: boolean;
} {
  try {
    return {
      program: parse(javascript, {
        ecmaVersion: "latest",
        sourceType: "script",
      }) as unknown as AstNode,
      syntaxError: false,
    };
  } catch {
    try {
      return {
        program: parse(javascript, {
          allowImportExportEverywhere: true,
          ecmaVersion: "latest",
          sourceType: "script",
        }) as unknown as AstNode,
        syntaxError: true,
      };
    } catch {
      return { syntaxError: true };
    }
  }
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { type?: unknown }).type === "string",
  );
}

function isDestructuringPattern(value: unknown): boolean {
  const node = isAstNode(value) ? value : undefined;
  return node?.type === "ObjectPattern" || node?.type === "ArrayPattern";
}

function childIsBindingPosition(
  parent: AstNode,
  parentKey: string,
  child: AstNode,
  parentIsBindingPosition: boolean,
): boolean {
  if (
    (parent.type === "VariableDeclarator" && parentKey === "id") ||
    (parent.type === "AssignmentExpression" &&
      parentKey === "left" &&
      isDestructuringPattern(child)) ||
    ((parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression") &&
      parentKey === "params" &&
      isDestructuringPattern(child)) ||
    (parent.type === "CatchClause" &&
      parentKey === "param" &&
      isDestructuringPattern(child))
  ) {
    return true;
  }

  if (!parentIsBindingPosition) return false;

  if (
    (parent.type === "ObjectPattern" && parentKey === "properties") ||
    (parent.type === "ArrayPattern" && parentKey === "elements") ||
    (parent.type === "Property" && parentKey === "value") ||
    (parent.type === "AssignmentPattern" && parentKey === "left") ||
    (parent.type === "RestElement" && parentKey === "argument")
  ) {
    return true;
  }

  return false;
}

function walkAst(
  node: AstNode,
  visit: (
    node: AstNode,
    parent?: AstNode,
    parentKey?: string,
    grandparent?: AstNode,
    bindingPosition?: boolean,
  ) => void,
  parent?: AstNode,
  parentKey?: string,
  grandparent?: AstNode,
  bindingPosition = false,
) {
  visit(node, parent, parentKey, grandparent, bindingPosition);

  for (const [key, value] of Object.entries(node)) {
    if (isAstNode(value)) {
      walkAst(
        value,
        visit,
        node,
        key,
        parent,
        childIsBindingPosition(node, key, value, bindingPosition),
      );
      continue;
    }

    if (!Array.isArray(value)) continue;
    for (const child of value) {
      if (isAstNode(child)) {
        walkAst(
          child,
          visit,
          node,
          key,
          parent,
          childIsBindingPosition(node, key, child, bindingPosition),
        );
      }
    }
  }
}

function unwrapChain(node: unknown): AstNode | undefined {
  if (!isAstNode(node)) return undefined;
  if (node.type !== "ChainExpression") return node;
  return unwrapChain(node.expression);
}

function staticPropertyName(member: AstNode): string | undefined {
  const property = unwrapChain(member.property);
  if (!property) return undefined;

  if (!member.computed && property.type === "Identifier") {
    return typeof property.name === "string" ? property.name : undefined;
  }

  if (
    member.computed &&
    property.type === "Literal" &&
    typeof property.value === "string"
  ) {
    return property.value;
  }

  if (
    member.computed &&
    property.type === "TemplateLiteral" &&
    Array.isArray(property.expressions) &&
    property.expressions.length === 0 &&
    Array.isArray(property.quasis)
  ) {
    const quasi = property.quasis[0];
    if (isAstNode(quasi) && quasi.type === "TemplateElement") {
      const cooked = (quasi.value as { cooked?: unknown } | undefined)?.cooked;
      return typeof cooked === "string" ? cooked : undefined;
    }
  }

  return undefined;
}

function staticPatternPropertyName(property: AstNode): string | undefined {
  const key = unwrapChain(property.key);
  if (!key) return undefined;

  if (!property.computed && key.type === "Identifier") {
    return typeof key.name === "string" ? key.name : undefined;
  }

  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value;
  }

  if (
    property.computed &&
    key.type === "TemplateLiteral" &&
    Array.isArray(key.expressions) &&
    key.expressions.length === 0 &&
    Array.isArray(key.quasis)
  ) {
    const quasi = key.quasis[0];
    if (isAstNode(quasi) && quasi.type === "TemplateElement") {
      const cooked = (quasi.value as { cooked?: unknown } | undefined)?.cooked;
      return typeof cooked === "string" ? cooked : undefined;
    }
  }

  return undefined;
}

function bindingIdentifier(node: unknown): string | undefined {
  const unwrapped = unwrapChain(node);
  if (!unwrapped) return undefined;

  if (unwrapped.type === "Identifier" && typeof unwrapped.name === "string") {
    return unwrapped.name;
  }

  if (unwrapped.type === "AssignmentPattern") {
    return bindingIdentifier(unwrapped.left);
  }

  return undefined;
}

function staticMemberPath(node: unknown): string[] | undefined {
  const unwrapped = unwrapChain(node);
  if (!unwrapped) return undefined;

  if (unwrapped.type === "Identifier" && typeof unwrapped.name === "string") {
    return [unwrapped.name];
  }

  if (unwrapped.type !== "MemberExpression") return undefined;
  const objectPath = staticMemberPath(unwrapped.object);
  const propertyName = staticPropertyName(unwrapped);
  return objectPath && propertyName
    ? [...objectPath, propertyName]
    : undefined;
}

function isBrowserNetworkPath(path: string[]): boolean {
  const last = path.at(-1);
  const previous = path.at(-2);
  return Boolean(
    (last &&
      DIRECT_NETWORK_IDENTIFIERS.has(last) &&
      GLOBAL_OBJECT_IDENTIFIERS.has(path[0] ?? "")) ||
      (last === "sendBeacon" && previous === "navigator"),
  );
}

function isDocumentWritePath(path: string[]): boolean {
  return path.at(-1) === "write" && path.at(-2) === "document";
}

function isReferenceIdentifier(
  parent: AstNode | undefined,
  parentKey: string | undefined,
  grandparent: AstNode | undefined,
  bindingPosition = false,
): boolean {
  if (!parent) return true;

  if (bindingPosition) return false;

  if (
    parent.type === "Property" &&
    parentKey === "value" &&
    grandparent?.type === "ObjectPattern"
  ) {
    return false;
  }

  if (
    (parent.type === "VariableDeclarator" && parentKey === "id") ||
    ((parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression") &&
      (parentKey === "id" || parentKey === "params")) ||
    ((parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
      parentKey === "id") ||
    (parent.type === "CatchClause" && parentKey === "param") ||
    ((parent.type === "MemberExpression" ||
      parent.type === "Property" ||
      parent.type === "MethodDefinition" ||
      parent.type === "PropertyDefinition") &&
      parentKey === "property" &&
      !parent.computed) ||
    (parent.type === "Property" && parentKey === "key" && !parent.computed) ||
    ((parent.type === "LabeledStatement" ||
      parent.type === "BreakStatement" ||
      parent.type === "ContinueStatement") &&
      parentKey === "label") ||
    parent.type.startsWith("Import")
  ) {
    return false;
  }

  return true;
}

function analyzeJavaScript(program?: AstNode) {
  let hasEventListenerWiring = false;
  let usesBrowserNetworkApi = false;
  let usesModuleImport = false;
  let usesDocumentWrite = false;
  const networkAliases = new Set<string>();
  const documentWriteAliases = new Set<string>();
  const destructuredBindings = new Set<string>();

  if (!program) {
    return {
      hasEventListenerWiring,
      usesBrowserNetworkApi,
      usesModuleImport,
      usesDocumentWrite,
    };
  }

  const registerBindingPath = (value: unknown, sourcePath: string[]) => {
    const unwrappedValue = unwrapChain(value);
    if (!unwrappedValue) return;

    if (unwrappedValue.type === "AssignmentPattern") {
      registerBindingPath(unwrappedValue.left, sourcePath);
      return;
    }

    if (unwrappedValue.type === "ObjectPattern") {
      registerObjectPattern(unwrappedValue, sourcePath);
      return;
    }

    const aliasName = bindingIdentifier(unwrappedValue);
    if (!aliasName) return;

    destructuredBindings.add(aliasName);
    networkAliases.delete(aliasName);
    documentWriteAliases.delete(aliasName);

    if (isBrowserNetworkPath(sourcePath)) {
      networkAliases.add(aliasName);
      usesBrowserNetworkApi = true;
    }

    if (isDocumentWritePath(sourcePath)) {
      documentWriteAliases.add(aliasName);
      usesDocumentWrite = true;
    }
  };

  function registerObjectPattern(pattern: AstNode, sourcePath: string[]) {
    if (!Array.isArray(pattern.properties)) return;
    for (const property of pattern.properties) {
      if (!isAstNode(property) || property.type !== "Property") continue;

      const propertyName = staticPatternPropertyName(property);
      if (!propertyName) continue;
      registerBindingPath(property.value, [...sourcePath, propertyName]);
    }
  }

  const registerDestructuredAliases = (pattern: unknown, source: unknown) => {
    const unwrappedPattern = unwrapChain(pattern);
    const sourcePath = staticMemberPath(source);
    if (unwrappedPattern?.type !== "ObjectPattern" || !sourcePath) return;
    registerObjectPattern(unwrappedPattern, sourcePath);
  };

  walkAst(program, (node, parent, parentKey, grandparent, bindingPosition) => {
    if (node.type === "VariableDeclarator") {
      registerDestructuredAliases(node.id, node.init);
    }

    if (node.type === "AssignmentExpression") {
      registerDestructuredAliases(node.left, node.right);
    }

    if (node.type === "ImportDeclaration" || node.type === "ImportExpression") {
      usesModuleImport = true;
    }

    if (node.type === "CallExpression") {
      const callee = unwrapChain(node.callee);
      if (
        (callee?.type === "Identifier" && callee.name === "addEventListener") ||
        (callee?.type === "MemberExpression" &&
          staticPropertyName(callee) === "addEventListener")
      ) {
        hasEventListenerWiring = true;
      }
    }

    if (
      node.type === "Identifier" &&
      typeof node.name === "string" &&
      isReferenceIdentifier(
        parent,
        parentKey,
        grandparent,
        bindingPosition,
      ) &&
      ((DIRECT_NETWORK_IDENTIFIERS.has(node.name) &&
        !destructuredBindings.has(node.name)) ||
        networkAliases.has(node.name))
    ) {
      usesBrowserNetworkApi = true;
    }

    if (
      node.type === "Identifier" &&
      typeof node.name === "string" &&
      documentWriteAliases.has(node.name) &&
      isReferenceIdentifier(
        parent,
        parentKey,
        grandparent,
        bindingPosition,
      )
    ) {
      usesDocumentWrite = true;
    }

    if (node.type !== "MemberExpression") return;
    const path = staticMemberPath(node);
    if (!path || path.length < 2) return;

    if (isBrowserNetworkPath(path)) {
      usesBrowserNetworkApi = true;
    }

    if (isDocumentWritePath(path)) {
      usesDocumentWrite = true;
    }
  });

  return {
    hasEventListenerWiring,
    usesBrowserNetworkApi,
    usesModuleImport,
    usesDocumentWrite,
  };
}

export function validateGeneratedAppQuality(
  app: GeneratedApp,
): GeneratedAppQualityResult {
  const violationCodes: GeneratedAppQualityViolationCode[] = [];
  const { html, javascript } = app;
  const htmlTags = scanHtmlTags(html);
  const hasInteractiveContent = hasActionableHtml(html, htmlTags);
  const parsedJavaScript =
    javascript.trim().length > 0
      ? parseClassicScript(javascript)
      : { syntaxError: false };
  const javascriptAnalysis = analyzeJavaScript(parsedJavaScript.program);

  if (/<\s*\/?\s*(?:html|head|body)\b/i.test(html)) {
    violationCodes.push("HTML_DOCUMENT_WRAPPER");
  }

  if (/<\s*\/?\s*script\b/i.test(html)) {
    violationCodes.push("HTML_SCRIPT_WRAPPER");
  }

  if (/<\s*\/?\s*style\b/i.test(html)) {
    violationCodes.push("HTML_STYLE_WRAPPER");
  }

  if (hasInlineEventHandler(htmlTags)) {
    violationCodes.push("HTML_INLINE_EVENT_HANDLER");
  }

  if (hasInteractiveContent && javascript.trim().length === 0) {
    violationCodes.push("ACTIONABLE_HTML_REQUIRES_JAVASCRIPT");
  }

  if (
    hasInteractiveContent &&
    javascript.trim().length > 0 &&
    !javascriptAnalysis.hasEventListenerWiring
  ) {
    violationCodes.push("ACTIONABLE_HTML_REQUIRES_EVENT_LISTENER");
  }

  if (parsedJavaScript.syntaxError) {
    violationCodes.push("JAVASCRIPT_SYNTAX_ERROR");
  }

  if (javascriptAnalysis.usesBrowserNetworkApi) {
    violationCodes.push("JAVASCRIPT_NETWORK_API");
  }

  if (javascriptAnalysis.usesModuleImport) {
    violationCodes.push("JAVASCRIPT_MODULE_IMPORT");
  }

  if (javascriptAnalysis.usesDocumentWrite) {
    violationCodes.push("JAVASCRIPT_DOCUMENT_WRITE");
  }

  return {
    violationCodes,
    correctiveMessage:
      violationCodes.length === 0
        ? ""
        : `Correct the JSON artifact. Fix: ${violationCodes.join(", ")}. Return body-only HTML, safe syntactically valid browser JavaScript, and addEventListener wiring for actionable controls.`,
  };
}
