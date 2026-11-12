// Small, safe markdown renderer: escapes all HTML first, then adds formatting.
// opts.interactive: checkboxes become real (clickable) inputs carrying their source line.
// Every block carries data-line (0-based source line) so the page view can jump to a search hit.
(function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s
      // images: local files are loaded by the page view; web images just become links
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => (/^https?:\/\//.test(src)
        ? `<a href="#" data-ext="${src}">🖼 ${alt || 'image'}</a>`
        : `<img class="md-img" alt="${alt}" data-src="${src}">`))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(page:([^)]+)\)/g, (_, t, p) => `<a href="#" class="page-link" data-page="${p.replace(/"/g, '')}">📄 ${t}</a>`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="#" data-ext="$2">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="#" data-ext="$2">$2</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function render(src, opts = {}) {
    const lines = esc(String(src || '')).split('\n');
    let html = '';
    let list = null; // 'ul' | 'ol'
    let para = [], paraLine = 0;
    const L = (i) => ` data-line="${i}"`;
    const flushPara = () => { if (para.length) { html += `<p${L(paraLine)}>${inline(para.join('<br>'))}</p>`; para = []; } };
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        flushPara(); closeList();
        const start = i;
        const buf = [];
        while (++i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i]);
        html += `<pre${L(start)}><code>${buf.join('\n')}</code></pre>`;
        continue;
      }
      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        flushPara(); closeList();
        const n = Math.min(m[1].length, 3);
        html += `<h${n}${L(i)}>${inline(m[2])}</h${n}>`;
      } else if ((m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
        const done = m[1] !== ' ';
        const box = opts.interactive
          ? `<input type="checkbox" class="md-check" data-line="${i}"${done ? ' checked' : ''}>`
          : '<span class="box"></span>';
        html += `<li class="check${done ? ' done' : ''}"${L(i)}>${box}<span>${inline(m[2])}</span></li>`;
      } else if ((m = line.match(/^(\s*)[-*+]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
        const depth = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2));   // indented = sub-point
        html += `<li${L(i)}${depth ? ` class="sub" style="margin-left:${depth * 1.2}em"` : ''}>${inline(m[2])}</li>`;
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
        html += `<li${L(i)}>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
        flushPara(); closeList();
        html += `<blockquote${L(i)}>${inline(m[1])}</blockquote>`;
      } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
        flushPara(); closeList();
        html += '<hr>';
      } else if (!line.trim()) {
        flushPara(); closeList();
      } else {
        closeList();
        if (!para.length) paraLine = i;
        para.push(line);
      }
    }
    flushPara(); closeList();
    return html;
  }

  // Flip "- [ ]" <-> "- [x]" on one source line
  function toggleCheckbox(src, lineNo, checked) {
    const lines = String(src).split('\n');
    if (lines[lineNo] == null) return src;
    lines[lineNo] = lines[lineNo].replace(/^(\s*[-*+]\s+)\[[ xX]\]/, `$1[${checked ? 'x' : ' '}]`);
    return lines.join('\n');
  }

  window.renderMarkdown = render;
  window.toggleCheckbox = toggleCheckbox;
})();
