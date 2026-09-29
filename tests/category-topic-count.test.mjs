import assert from "node:assert/strict";
import { test } from "node:test";
import categoryTopicCount from "../javascripts/lib/category-topic-count.js";

test("a populated hall includes its parent, children and deeper descendants", () => {
  const root = { id: 5, topic_count: 2 };
  const categories = [
    root,
    { id: 10, parent_category_id: 5, topic_count: 3 },
    { id: 11, parent_category_id: 5, topic_count: 1 },
    { id: 12, parent_category_id: 10, topic_count: 4 },
    { id: 6, topic_count: 20 },
    { id: 13, parent_category_id: 6, topic_count: 10 },
  ];
  assert.equal(categoryTopicCount(root, categories), 10);
});

test("an empty parent still counts populated subcategories", () => {
  const root = { id: 5, topic_count: 0 };
  assert.equal(
    categoryTopicCount(root, [
      root,
      { id: 10, parent_category_id: 5, topic_count: 4 },
    ]),
    4,
  );
});

test("a genuinely empty visible hall remains zero", () => {
  const root = { id: 9, topic_count: 0 };
  assert.equal(categoryTopicCount(root, [root]), 0);
});

test("permission-filtered children are not inferred from subcategory IDs", () => {
  const root = { id: 5, topic_count: 1, subcategory_ids: [10, 11] };
  assert.equal(
    categoryTopicCount(root, [
      root,
      { id: 10, parent_category_id: 5, topic_count: 2 },
    ]),
    3,
  );
});

test("missing or invalid counts remain unknown instead of a partial total", () => {
  assert.equal(categoryTopicCount(undefined, []), null);
  for (const topic_count of [undefined, null, -1, 1.5, "3", NaN]) {
    const root = { id: 5, topic_count: 2 };
    assert.equal(
      categoryTopicCount(root, [
        root,
        { id: 10, parent_category_id: 5, topic_count },
      ]),
      null,
    );
  }
});

test("duplicate records and a malformed cycle never double-count or loop", () => {
  const root = { id: 5, parent_category_id: 10, topic_count: 2 };
  const child = { id: 10, parent_category_id: "5", topic_count: 3 };
  assert.equal(categoryTopicCount(root, [root, child, child]), 5);
});

test("updated data is counted on the next render without caching stale totals", () => {
  const root = { id: 5, topic_count: 0 };
  const child = { id: 10, parent_category_id: 5, topic_count: 2 };
  assert.equal(categoryTopicCount(root, [root, child]), 2);
  child.topic_count = 3;
  assert.equal(categoryTopicCount(root, [root, child]), 3);
});
