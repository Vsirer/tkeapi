/** 文档树节点（与 DocsApi / Portal 公共字段对齐） */
export type DocsTreeNode = {
  id: number;
  slug?: string;
  is_dir: boolean;
  children?: DocsTreeNode[];
};

function findDocBySlug(nodes: DocsTreeNode[], slug: string): DocsTreeNode | null {
  for (const n of nodes) {
    if (!n.is_dir && n.slug === slug) return n;
    if (n.children?.length) {
      const found = findDocBySlug(n.children, slug);
      if (found) return found;
    }
  }
  return null;
}

function findParentSlug(nodes: DocsTreeNode[], targetId: number): string | null {
  for (const node of nodes) {
    if (node.children?.some((c) => c.id === targetId)) {
      return node.slug || null;
    }
    if (node.children?.length) {
      const found = findParentSlug(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

const idToDocSlug = (docId: number) => `doc${String(docId).padStart(4, '0')}`;

/** 构建错误码专页等内置 slug 文档的站内链接 */
export function buildDocHref(
  tree: DocsTreeNode[],
  articleSlug: string,
  basePath: string,
  opts?: { numericId?: boolean },
): string {
  const doc = findDocBySlug(tree, articleSlug);
  if (!doc) return '#';
  if (opts?.numericId) return `${basePath}/${doc.id}`;
  const parentSlug = findParentSlug(tree, doc.id);
  const leaf = idToDocSlug(doc.id);
  return parentSlug ? `${basePath}/${parentSlug}/${leaf}` : `${basePath}/${leaf}`;
}

export function applyDocsContentVars(
  content: string,
  vars: Record<string, string>,
): string {
  let out = content;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, val);
  }
  return out;
}
