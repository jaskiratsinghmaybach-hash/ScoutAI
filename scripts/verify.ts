// Manual verification for conversationTree.ts (synthetic-root design)
// Run with: npx tsx verify.ts

import {
  createEmptyTree,
  addMessage,
  setActiveChild,
  getActivePath,
  getChildren,
  getSiblingInfo,
  treeFromFlatHistory,
  SYNTHETIC_ROOT_ID,
} from "../src/lib/conversationTree";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

// --- Test 1: basic linear chain (no branching) ---
(function testLinearChain() {
  let tree = createEmptyTree();
  let r = addMessage(tree, null, "user", "hey scout");
  tree = r.tree;
  const msg1 = r.nodeId;

  r = addMessage(tree, msg1, "assistant", "hey! what scene?");
  tree = r.tree;
  const msg2 = r.nodeId;

  r = addMessage(tree, msg2, "user", "a rooftop confrontation");
  tree = r.tree;

  const path = getActivePath(tree);
  assert(path.length === 3, "linear chain has 3 nodes in active path");
  assert(path[0].content === "hey scout", "path[0] is the first real message");
  assert(path[2].content === "a rooftop confrontation", "path[2] is the latest message");
  assert(
    !path.some((n) => n.id === SYNTHETIC_ROOT_ID),
    "synthetic root never appears in the active path",
  );
})();

// --- Test 2 (THE BUG THIS FIX ADDRESSES): editing the FIRST visible
// message must create a real sibling, not silently discard the old
// branch. This is exactly the scenario from the live bug report. ---
(function testEditingFirstMessageCreatesRealSibling() {
  let tree = createEmptyTree();
  let r = addMessage(tree, null, "user", "hello");
  tree = r.tree;
  const firstMsg = r.nodeId;

  r = addMessage(tree, firstMsg, "assistant", "Hey there! I'm Scout...");
  tree = r.tree;

  // Edit "hello" -> "hello, who are you". This should add a SIBLING
  // under the synthetic root, not replace/discard anything.
  r = addMessage(tree, null, "user", "hello, who are you");
  tree = r.tree;
  const firstMsgEdit = r.nodeId;

  const siblings = getChildren(tree, SYNTHETIC_ROOT_ID);
  assert(
    siblings.length === 2,
    "editing the first message produces 2 children under the synthetic root (not a replaced root)",
  );

  const info = getSiblingInfo(tree, firstMsg);
  assert(info !== null, "getSiblingInfo works for a child of the synthetic root");
  assert(info!.total === 2, "first message now reports 2 total siblings");
  assert(info!.position === 1, "original 'hello' is position 1 of 2");

  const infoEdit = getSiblingInfo(tree, firstMsgEdit);
  assert(infoEdit!.position === 2, "edited version is position 2 of 2");

  // The original branch (with its assistant reply) must still be
  // reachable — this is the actual regression from the bug report.
  let path = getActivePath(tree);
  assert(
    path.some((n) => n.content === "Hey there! I'm Scout..."),
    "original assistant reply is still reachable before switching branches",
  );

  // Switch to the edited version and confirm it becomes active
  tree = setActiveChild(tree, SYNTHETIC_ROOT_ID, firstMsgEdit);
  path = getActivePath(tree);
  assert(
    path[0].content === "hello, who are you",
    "after switching, the edited first message is active",
  );
  assert(
    !path.some((n) => n.content === "Hey there! I'm Scout..."),
    "old branch's downstream is no longer in the active path (but still exists in tree.nodes)",
  );

  // Switch back and confirm the original is fully recoverable
  tree = setActiveChild(tree, SYNTHETIC_ROOT_ID, firstMsg);
  path = getActivePath(tree);
  assert(
    path[0].content === "hello" &&
      path.some((n) => n.content === "Hey there! I'm Scout..."),
    "switching back to the original restores it AND its downstream reply",
  );
})();

// --- Test 3: real sibling case — editing a NON-first message ---
(function testSiblingBranchingMidConversation() {
  let tree = createEmptyTree();
  let r = addMessage(tree, null, "user", "hey scout");
  tree = r.tree;
  const msg1 = r.nodeId;

  r = addMessage(tree, msg1, "assistant", "hey! what scene?");
  tree = r.tree;
  const msg2 = r.nodeId;

  r = addMessage(tree, msg2, "user", "a rooftop confrontation");
  tree = r.tree;

  r = addMessage(tree, msg1, "assistant", "hi! ready when you are");
  tree = r.tree;
  const msg2Edit = r.nodeId;

  const msg2Siblings = getChildren(tree, msg1);
  assert(msg2Siblings.length === 2, "msg1 now has 2 children (original msg2 + edited version)");

  const info = getSiblingInfo(tree, msg2);
  assert(info!.total === 2, "sibling total is 2");
  assert(info!.position === 1, "original msg2 is position 1 of 2");

  const infoEdit = getSiblingInfo(tree, msg2Edit);
  assert(infoEdit!.position === 2, "edited version is position 2 of 2");

  let path = getActivePath(tree);
  assert(
    path.some((n) => n.id === msg2),
    "active path still follows original msg2 (addMessage doesn't auto-switch active branch)",
  );

  tree = setActiveChild(tree, msg1, msg2Edit);
  path = getActivePath(tree);
  assert(
    path.some((n) => n.id === msg2Edit),
    "after setActiveChild, active path follows the edited version",
  );
  assert(
    !path.some((n) => n.id === msg2),
    "original msg2 (and its old downstream) no longer in active path",
  );
})();

// --- Test 4: up to 5 siblings on one message (explicit product requirement) ---
(function testFiveSiblings() {
  let tree = createEmptyTree();
  const rootRes = addMessage(tree, null, "user", "scene brief");
  tree = rootRes.tree;
  const sharedParent = rootRes.nodeId;

  const fiveVersions: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const res = addMessage(tree, sharedParent, "assistant", `reply version ${i}`);
    tree = res.tree;
    fiveVersions.push(res.nodeId);
  }

  const fiveSiblings = getChildren(tree, sharedParent);
  assert(fiveSiblings.length === 5, "a message can have 5 sibling versions (no hardcoded cap)");

  for (let i = 0; i < 5; i++) {
    const infoN = getSiblingInfo(tree, fiveVersions[i]);
    assert(
      infoN!.position === i + 1 && infoN!.total === 5,
      `version ${i + 1} reports position ${i + 1}/5 correctly`,
    );
  }

  for (let i = 0; i < 5; i++) {
    tree = setActiveChild(tree, sharedParent, fiveVersions[i]);
    const p = getActivePath(tree);
    assert(
      p[p.length - 1].id === fiveVersions[i],
      `switching to version ${i + 1} correctly updates active path`,
    );
  }

  const beforeInvalidSwitch = getActivePath(tree);
  const treeAfterInvalidSwitch = setActiveChild(tree, sharedParent, "nonexistent-id");
  const afterInvalidSwitch = getActivePath(treeAfterInvalidSwitch);
  assert(
    JSON.stringify(beforeInvalidSwitch) === JSON.stringify(afterInvalidSwitch),
    "setActiveChild with a bogus childId is a no-op, doesn't corrupt the tree",
  );
})();

// --- Test 5: FIVE siblings on the FIRST message specifically (the
// combination of the bug fix + the explicit 5-version requirement) ---
(function testFiveSiblingsOnFirstMessage() {
  let tree = createEmptyTree();
  const versions: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const res = addMessage(tree, null, "user", `opening line v${i}`);
    tree = res.tree;
    versions.push(res.nodeId);
  }

  const siblings = getChildren(tree, SYNTHETIC_ROOT_ID);
  assert(siblings.length === 5, "the first message can have 5 sibling versions too");

  for (let i = 0; i < 5; i++) {
    const info = getSiblingInfo(tree, versions[i]);
    assert(
      info!.position === i + 1 && info!.total === 5,
      `first-message version ${i + 1} reports ${i + 1}/5 correctly`,
    );
  }
})();

// --- Test 6: migration from flat history ---
(function testMigrationFromFlatHistory() {
  const flatHistory = [
    { role: "user" as const, content: "hey scout" },
    { role: "assistant" as const, content: "hi! what's the scene?" },
    { role: "user" as const, content: "a wedding at a vineyard" },
  ];
  const migratedTree = treeFromFlatHistory(flatHistory);
  const migratedPath = getActivePath(migratedTree);

  assert(migratedPath.length === 3, "flat history of 3 turns migrates to a 3-node path");
  assert(
    migratedPath.every((n, i) => n.content === flatHistory[i].content),
    "migrated path preserves original content and order",
  );
  assert(
    migratedPath.every((n) => getChildren(migratedTree, n.id).length <= 1),
    "migrated tree has no branching (every node has at most 1 child)",
  );
})();

console.log("\nAll checks completed.");