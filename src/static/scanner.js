/**
 * Static scanner: reads changed files in the PR, parses JSX/TSX/JS files,
 * finds interactive elements missing `data-cy`, generates deterministic names,
 * and posts a formatted comment to the PR with suggestions.
 */

const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");
const recast = require("recast");
const babelParser = require("@babel/parser");
const { generateTag } = require("../utils/nameGenerator");

const token = process.env.GITHUB_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER);

if (!token || !repoFull || !prNumber) {
  console.error(
    "Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PR_NUMBER env vars"
  );
  process.exit(1);
}

const [owner, repo] = repoFull.split("/");
const octokit = new Octokit({ auth: token });

async function listChangedFiles() {
  const files = [];
  for await (const resp of await octokit.paginate.iterator(
    octokit.pulls.listFiles,
    { owner, repo, pull_number: prNumber }
  )) {
    for (const f of resp.data) files.push(f.filename);
  }
  return files;
}

// FORCE Babel parser, not Esprima
function parseWithBabel(code, file) {
  return recast.parse(code, {
    parser: {
      parse(source) {
        return babelParser.parse(source, {
          sourceType: "module",
          plugins: [
            "jsx",
            "typescript",
            "classProperties",
            "objectRestSpread",
            "optionalChaining",
            "nullishCoalescingOperator",
            "decorators-legacy",
          ],
        });
      },
    },
  });
}

function extractSuggestionsFromAST(ast, code, file) {
  const suggestions = [];
  const { visit } = recast.types;

  visit(ast, {
    visitJSXElement(path) {
      try {
        const opening = path.node.openingElement;
        if (!opening) {
          this.traverse(path);
          return;
        }

        const nameNode = opening.name;

        // SKIP React Component usages (e.g. <MyButton />)
        if (
          nameNode?.type === "JSXIdentifier" &&
          /^[A-Z]/.test(nameNode.name)
        ) {
          this.traverse(path);
          return;
        }

        let tag = null;
        if (nameNode?.type === "JSXIdentifier")
          tag = nameNode.name.toLowerCase();

        // Interactive elements
        const attrs = opening.attributes || [];
        const hasRoleButton = attrs.some(
          (attr) =>
            attr?.name?.name === "role" && attr?.value?.value === "button"
        );

        const isInteractive =
          ["button", "a", "input", "select", "textarea"].includes(tag) ||
          hasRoleButton;

        if (!isInteractive) {
          this.traverse(path);
          return;
        }

        // Skip if already has data-cy
        const hasDataCy = attrs.some((a) => a?.name?.name === "data-cy");
        if (hasDataCy) {
          this.traverse(path);
          return;
        }

        // Extract text / aria-label / placeholder / alt / title
        let text = "";
        if (path.node.children) {
          for (const ch of path.node.children) {
            if (ch.type === "JSXText" && ch.value?.trim()) {
              text = ch.value.trim();
              break;
            }
            if (
              ch.type === "JSXExpressionContainer" &&
              ch.expression?.type === "StringLiteral"
            ) {
              text = ch.expression.value;
              break;
            }
          }
        }

        let aria = null,
          placeholder = null,
          alt = null,
          title = null;
        attrs.forEach((attr) => {
          if (!attr?.name) return;
          const nm = attr.name.name;
          const val =
            attr.value?.value || attr.value?.expression?.value || null;

          if (nm === "aria-label") aria = val;
          if (nm === "placeholder") placeholder = val;
          if (nm === "alt") alt = val;
          if (nm === "title") title = val;
        });

        const nameSource = (
          text ||
          aria ||
          placeholder ||
          alt ||
          title ||
          tag ||
          ""
        ).toString();

        const dataCy = generateTag({
          tag: tag || "el",
          text: nameSource,
          index: suggestions.length,
        });

        const loc = opening.loc?.start?.line || null;

        suggestions.push({
          file,
          line: loc,
          tag: tag || "el",
          text: nameSource,
          dataCy,
        });
      } catch (_) {}

      this.traverse(path);
    },
  });

  return suggestions;
}

async function run() {
  const changedFiles = await listChangedFiles();
  const relevant = changedFiles.filter((f) =>
    /\.(jsx|js|tsx|ts|html)$/i.test(f)
  );

  if (relevant.length === 0) {
    console.log("No relevant changed files found.");
    return;
  }

  const allSuggestions = [];

  for (const file of relevant) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;

    const code = fs.readFileSync(full, "utf8");
    let ast;

    try {
      ast = parseWithBabel(code, file);
    } catch (e) {
      console.warn("Parse failed for", file, e.message);
      continue;
    }

    const sug = extractSuggestionsFromAST(ast, code, file);
    allSuggestions.push(...sug);
  }

  if (allSuggestions.length === 0) {
    console.log("No suggestions generated.");
    return;
  }

  // Build comment
  let body =
    "🔧 **Automated `data-cy` suggestions** — Here are interactive elements missing `data-cy` in this PR.\n\n";
  body += "| File | Line | Element | Suggested `data-cy` |\n";
  body += "|---|---:|---|---:|\n";

  for (const s of allSuggestions) {
    const safeText = (s.text || "")
      .replace(/\|/g, " ")
      .replace(/\n/g, " ")
      .slice(0, 100);

    body += `| \`${s.file}\` | ${s.line || "-"} | \`${s.tag}\`${
      safeText ? ` — ${safeText}` : ""
    } | \`${s.dataCy}\` |\n`;
  }

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });

  console.log("Posted suggestions:", allSuggestions.length);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
