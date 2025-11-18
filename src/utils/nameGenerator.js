// deterministic name generator for data-cy
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function generateTag(info) {
  // info: { tag, text, aria, placeholder, alt, compPath }
  const parts = [];
  if (info.compPath) parts.push(info.compPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  const role = info.tag === 'a' ? 'link' : info.tag;
  parts.push(role);

  const text = (info.text || info.aria || info.placeholder || info.alt || '').trim();
  if (text) parts.push(text.split('\n')[0].trim().split(' ').slice(0,5).join(' '));

  if (info.index != null) parts.push(String(info.index));

  return slugify(parts.join('-'));
}

module.exports = { generateTag, slugify };
