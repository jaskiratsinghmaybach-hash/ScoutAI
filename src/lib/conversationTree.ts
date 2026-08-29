/**
 * Conversation tree — message-branching data layer.
 *
 * This module is pure data logic: no React, no side effects. It exists
 * so the tree structure and its core operations (add, resolve active
 * path, list siblings) can be reasoned about and manually verified in
 * isolation before anything in the app depends on them.
 *
 * Design notes:
 * - Nodes live in a flat map keyed by id, not nested objects. This makes
 *   adding/updating a single node cheap (no deep cloning of the whole
 *   tree) and maps directly onto how this will eventually serialize to
 *   Supabase/localStorage (a flat table/array of rows).
 * - `activeChildByParent` is the only extra bit of state needed to
 *   resolve "what's currently showing": for any node with multiple
 *   children (i.e. a message that was edited, creating siblings), this
 *   records which child is the active one. Nodes with a single child
 *   don't need an entry here — getActivePath falls back to "the only
 *   child" when there's no entry.
 * - No cap on sibling count. A message can have as many edited versions
 *   as the user creates (product requirement: at least up to 5, but
 *   nothing here assumes any specific number).
 * - SYNTHETIC ROOT: every tree has a fixed, hidden anchor node (id
 *   `__root__`) that is never displayed and never itself edited. Real
 *   conversation-starting messages are its children. This means editing
 *   the FIRST visible message works exactly like editing any other
 *   message — add a sibling under its parent — with zero special-casing.
 *   Before this, editing the first message had no parent to attach a
 *   sibling to and had to "replace the root" instead, silently losing
 *   the ability to branch on the single most commonly-edited message in
 *   real usage. Verified against how ChatGPT's own edit-to-branch
 *   feature behaves (no special case for the first message either).
 *   getActivePath() and getChildren() automatically skip/exclude the
 *   synthetic root from anything callers see.
 */

export type MessageRole = "user" | "assistant";

export const SYNTHETIC_ROOT_ID = "__root__";

export interface MessageNode {
  id: string;
  parentId: string | null;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface ConversationTree {
  nodes: Record<string, MessageNode>;
  rootId: string; // always SYNTHETIC_ROOT_ID; kept as a field (rather
  // than a bare constant reference everywhere) so tree shape stays
  // self-describing and serialization-friendly.
  activeChildByParent: Record<string, string>;
}

function makeSyntheticRoot(): MessageNode {
  return {
    id: SYNTHETIC_ROOT_ID,
    parentId: null,
    role: "assistant", // never rendered; role is arbitrary but typed
    content: "",
    createdAt: 0,
  };
}

export function createEmptyTree(): ConversationTree {
  const root = makeSyntheticRoot();
  return {
    nodes: { [root.id]: root },
    rootId: root.id,
    activeChildByParent: {},
  };
}

let idCounter = 0;
function generateNodeId(): string {
  idCounter += 1;
  return `node_${Date.now()}_${idCounter}`;
}

/**
 * Adds a new message as a child of parentId. Pass null to attach
 * directly under the synthetic root (i.e. this is a new "first
 * message" of the conversation, or a sibling/edit of one). Returns a
 * new tree — does not mutate the input.
 *
 * If the parent already has an active child, this new node does NOT
 * automatically become active — that would silently discard the
 * existing branch's "active" status. Callers that want the new sibling
 * to become active immediately (e.g. the edit flow) do so explicitly
 * via setActiveChild, same as switching to any other existing sibling.
 */
export function addMessage(
  tree: ConversationTree,
  parentId: string | null,
  role: MessageRole,
  content: string,
): { tree: ConversationTree; nodeId: string } {
  const id = generateNodeId();
  const resolvedParentId = parentId ?? tree.rootId;
  const node: MessageNode = {
    id,
    parentId: resolvedParentId,
    role,
    content,
    createdAt: Date.now(),
  };

  const nodes = { ...tree.nodes, [id]: node };
  const activeChildByParent = { ...tree.activeChildByParent };

  const existingActiveChild = activeChildByParent[resolvedParentId];
  if (existingActiveChild === undefined) {
    // Parent had zero or one child before this call. Since this is the
    // first child being added under this parent in that case, make it
    // active by default so getActivePath has something to follow.
    activeChildByParent[resolvedParentId] = id;
  }
  // If the parent already had an active child recorded, leave it as-is
  // — this new node becomes an inactive sibling until something
  // explicitly switches to it (see setActiveChild below).

  return {
    tree: { nodes, rootId: tree.rootId, activeChildByParent },
    nodeId: id,
  };
}

/**
 * Explicitly marks childId as the active branch under its parent.
 * Used by the pager UI to switch between sibling versions, including
 * siblings of the first visible message (children of the synthetic
 * root). Returns a new tree.
 */
export function setActiveChild(
  tree: ConversationTree,
  parentId: string,
  childId: string,
): ConversationTree {
  if (!tree.nodes[childId] || tree.nodes[childId].parentId !== parentId) {
    // Defensive: refuse to point at a node that isn't actually a child
    // of the given parent. Returning the tree unchanged rather than
    // throwing keeps this safe to call from UI code without a
    // surrounding try/catch.
    return tree;
  }
  return {
    ...tree,
    activeChildByParent: {
      ...tree.activeChildByParent,
      [parentId]: childId,
    },
  };
}

/**
 * Walks the tree from the synthetic root, following
 * activeChildByParent at each step, and returns the resulting path as
 * a flat, ordered array of REAL (non-synthetic) messages — exactly the
 * shape the rest of the app expects. The synthetic root itself is
 * never included in the result.
 */
export function getActivePath(tree: ConversationTree): MessageNode[] {
  const path: MessageNode[] = [];
  let currentId: string = tree.rootId;

  while (true) {
    const children = getChildren(tree, currentId);
    if (children.length === 0) break;

    const activeChildId: string | undefined =
      tree.activeChildByParent[currentId];
    const activeChild: MessageNode =
      (activeChildId && tree.nodes[activeChildId]) || children[0];

    path.push(activeChild);
    currentId = activeChild.id;
  }

  return path;
}

/**
 * Returns all direct children of a node (including children of the
 * synthetic root), in creation order. Used both by getActivePath (to
 * know how many children exist / pick a fallback) and by the pager (to
 * know the full sibling set and count for the "N/M" label).
 */
export function getChildren(
  tree: ConversationTree,
  nodeId: string,
): MessageNode[] {
  return Object.values(tree.nodes)
    .filter((n) => n.parentId === nodeId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Returns the sibling set for a given node (its parent's children,
 * including the node itself) along with the node's 1-based position
 * in that set — exactly what the "N/M" pager label needs. Works
 * identically whether the node's parent is the synthetic root or a
 * real message — there is no special case for the first visible
 * message in the conversation.
 */
export function getSiblingInfo(
  tree: ConversationTree,
  nodeId: string,
): { siblings: MessageNode[]; position: number; total: number } | null {
  const node = tree.nodes[nodeId];
  if (!node) return null;

  const siblings = getChildren(tree, node.parentId ?? tree.rootId);
  const position = siblings.findIndex((s) => s.id === nodeId) + 1;

  return { siblings, position, total: siblings.length };
}

/**
 * Converts a flat ConversationTurn[]-shaped array (the app's legacy
 * history format) into a tree with no branching — every message is a
 * single-child chain hanging off the synthetic root. Used to migrate
 * existing saved chats (localStorage/Supabase) on first read.
 */
export function treeFromFlatHistory(
  turns: { role: MessageRole; content: string }[],
): ConversationTree {
  let tree = createEmptyTree();
  let parentId: string | null = null;

  for (const turn of turns) {
    const result = addMessage(tree, parentId, turn.role, turn.content);
    tree = result.tree;
    parentId = result.nodeId;
  }

  return tree;
}