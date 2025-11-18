/**
 * Static scanner: reads changed files in the PR, parses JSX/TSX/JS files,
 * finds interactive elements missing `data-cy`, generates deterministic names,
 * and posts a formatted comment to the PR with suggestions.
 *
 * Environment variables expected in GitHub Actions:
 * - GITHUB_TOKEN (bot token stored in secrets)
 * - GITHUB_REPOSITORY (owner/repo)
 * - PR_NUMBER (pull request number)
 */
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const recast = require('recast');
const babelParser = require('@babel/parser');
const { generateTag } = require('../utils/nameGenerator');

const token = process.env.GITHUB_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER);

if (!token || !repoFull || !prNumber) {
  console.error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PR_NUMBER env vars');
  process.exit(1);
}

const [owner, repo] = repoFull.split('/');
const octokit = new Octokit({ auth: token });

async function listChangedFiles() {
  const files = [];
  for await (const resp of await octokit.paginate.iterator(octokit.pulls.listFiles, { owner, repo, pull_number: prNumber })) {
    for (const f of resp.data) files.push(f.filename);
  }
  return files;
}

function parseWithBabel(code) {
  return recast.parse(code, {
    parser: {
      parse(source) {
        return babelParser.parse(source, {
          sourceType: 'module',
          plugins: [
            'jsx',
            'typescript',
            'classProperties',
            'objectRestSpread',
            'optionalChaining',
            'nullishCoalescingOperator',
            'decorators-legacy'
          ]
        });
      }
    }
  });
}

function extractSuggestionsFromAST(ast, code, file) {
  const suggestions = [];
  const { visit } = recast.types;
  visit(ast, {
    visitJSXElement(path) {
      try {
        const opening = path.node.openingElement;
        if (!opening) { this.traverse(path); return; }

        const nameNode = opening.name;
        let tag = null;
        if (nameNode) {
          if (nameNode.type === 'JSXIdentifier') tag = nameNode.name.toLowerCase();
          else if (nameNode.type === 'JSXMemberExpression') tag = (nameNode.property && nameNode.property.name) ? nameNode.property.name.toLowerCase() : null;
        }

        const attrs = opening.attributes || [];
        const hasRoleButton = attrs.some(attr => attr && attr.name && attr.name.name === 'role' && attr.value && attr.value.value === 'button');
        const isInteractive = (['button','a','input','select','textarea'].includes(tag)) || hasRoleButton;

        if (!isInteractive) { this.traverse(path); return; }

        const hasDataCy = attrs.some(a => a && a.name && a.name.name === 'data-cy');
        if (hasDataCy) { this.traverse(path); return; }

        // get inner text hints
        let text = '';
        if (path.node.children) {
          for (const ch of path.node.children) {
            if (ch.type === 'JSXText' && ch.value && ch.value.trim()) { text = ch.value.trim(); break; }
            if (ch.type === 'JSXExpressionContainer' && ch.expression) {
              if (ch.expression.type === 'StringLiteral') { text = ch.expression.value; break; }
            }
          }
        }

        // attributes: aria-label / placeholder / alt / title
        let aria = null; let placeholder = null; let alt = null; let title = null;
        attrs.forEach(attr => {
          if (!attr || !attr.name) return;
          const nm = attr.name.name;
          if (nm === 'aria-label' && attr.value && attr.value.value) aria = attr.value.value;
          if (nm === 'placeholder' && attr.value && attr.value.value) placeholder = attr.value.value;
          if (nm === 'alt' && attr.value && attr.value.value) alt = attr.value.value;
          if (nm === 'title' && attr.value && attr.value.value) title = attr.value.value;
        });

        const nameSource = (text || aria || placeholder || alt || title || tag || '').toString();
        const dataCy = generateTag({ tag: tag || 'el', text: nameSource || '', index: suggestions.length });

        const loc = opening.loc && opening.loc.start ? opening.loc.start.line : null;

        suggestions.push({
          file,
          line: loc,
          tag: tag || 'el',
          text: nameSource,
          dataCy
        });
      } catch (e) {
        // ignore node-level issues
      }
      this.traverse(path);
    }
  });
  return suggestions;
}

async function run() {
  const changedFiles = await listChangedFiles();
  const relevant = changedFiles.filter(f => /\.(jsx|js|tsx|ts|html)$/i.test(f));
  if (relevant.length === 0) {
    console.log('No relevant changed files found.');
    return;
  }

  const allSuggestions = [];
  for (const file of relevant) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const code = fs.readFileSync(full, 'utf8');
    let ast;
    try {
      ast = parseWithBabel(code);
    } catch (e) {
      console.warn('Parse failed for', file, e.message);
      continue;
    }
    const sug = extractSuggestionsFromAST(ast, code, file);
    allSuggestions.push(...sug);
  }

  if (allSuggestions.length === 0) {
    console.log('No suggestions generated.');
    // Optionally post a short comment indicating nothing to do
    return;
  }

  // Compose a markdown comment
  let body = '🔧 **Automated `data-cy` suggestions** — I scanned the files changed in this PR and found interactive elements that do not have `data-cy` attributes. You can copy these into your components, or comment `@bot apply` to request an automated PR (if enabled by repo admins).\n\n';
  body += '| File | Line | Element | Suggested `data-cy` |\n';
  body += '|---|---:|---|---:|\n';
  for (const s of allSuggestions) {
    const safeText = (s.text || '').toString().replace(/\|/g, ' ').replace(/\n/g, ' ').slice(0, 100);
    body += `| \`${s.file}\` | ${s.line || '-'} | \`${s.tag}\`${safeText ? ` — ${safeText}` : ''} | \`${s.dataCy}\` |\n`;
  }
  body += '\n_If you want me to apply these changes automatically, ask by commenting `@bot apply` on this PR._\n';

  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
  console.log('Posted suggestions, count:', allSuggestions.length);
}

run().catch(err => { console.error(err); process.exit(1); });
