// Discourse's category counts exclude its "About this category" topics.
// Only traverse the categories supplied for the current user's permissions.
export default function categoryTopicCount(category, categories) {
  if (category?.id == null) {
    return null;
  }

  const children = new Map();
  for (const candidate of categories) {
    if (candidate.parent_category_id != null) {
      const parentId = String(candidate.parent_category_id);
      const siblings = children.get(parentId) || [];
      siblings.push(candidate);
      children.set(parentId, siblings);
    }
  }

  const pending = [category];
  const visited = new Set();
  let count = 0;

  while (pending.length) {
    const current = pending.pop();
    const id = String(current.id);
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    // Do not turn incomplete data into a misleading zero or partial total.
    if (!Number.isSafeInteger(current.topic_count) || current.topic_count < 0) {
      return null;
    }
    count += current.topic_count;
    pending.push(...(children.get(id) || []));
  }

  return count;
}
