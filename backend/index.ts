import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import { simpleGit } from 'simple-git';
import axios from 'axios';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', 'package-lock.json', '.DS_Store', 'bun.lockb'];
const DEFAULT_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.md'];

/**
 * HELPER: Parse GitHub URL
 */
const parseGitHubUrl = (url: string) => {
  try {
    const cleanUrl = url.replace('https://github.com/', '').replace('.git', '');
    const [owner, repo] = cleanUrl.split('/');
    return { owner, repo };
  } catch (e) {
    return null;
  }
};

/**
 * LOGIC: Local File System Data
 */
async function getLocalData(dir: string, ignoreList: string[], allowedExts: string[]) {
  let treeText = "";
  let contentStr = "";
  let nodes: any[] = [];
  let links: any[] = [];

  const walk = async (currentDir: string, prefix: string = "") => {
    const files = await fs.readdir(currentDir);
    const parentId = currentDir;

    if (nodes.length === 0) {
      nodes.push({ id: currentDir, label: path.basename(currentDir) || currentDir, type: 'folder' });
    }

    for (const file of files) {
      if (ignoreList.includes(file)) continue;
      const fullPath = path.join(currentDir, file);
      const stats = await fs.stat(fullPath);
      const isDir = stats.isDirectory();

      treeText += `${prefix}├── ${file}\n`;
      nodes.push({ id: fullPath, label: file, type: isDir ? 'folder' : 'file' });
      links.push({ source: parentId, target: fullPath });

      if (isDir) {
        treeText += await walk(fullPath, prefix + "│   ");
      } else if (allowedExts.includes(path.extname(file))) {
        const content = await fs.readFile(fullPath, 'utf8');
        contentStr += `\nFILE: ${fullPath}\n--- CODE START ---\n${content}\n--- CODE END ---\n`;
      }
    }
  };

  await walk(dir);
  return { treeText, contentStr, graph: { nodes, links } };
}

/**
 * LOGIC: GitHub API Data
 */
async function getGitHubData(owner: string, repo: string, allowedExts: string[]) {
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
  const response = await axios.get(treeUrl);
  const gitTree = response.data.tree;

  let treeText = "";
  let contentStr = "";
  let nodes: any[] = [{ id: 'root', label: repo, type: 'folder' }];
  let links: any[] = [];

  for (const item of gitTree) {
    const parts = item.path.split('/');
    const fileName = parts[parts.length - 1];
    const isDir = item.type === 'tree';
    const parentId = parts.length === 1 ? 'root' : parts.slice(0, -1).join('/');

    if (DEFAULT_IGNORE.some(ig => item.path.includes(ig))) continue;

    nodes.push({ id: item.path, label: fileName, type: isDir ? 'folder' : 'file' });
    links.push({ source: parentId, target: item.path });

    const indent = "│   ".repeat(parts.length - 1);
    treeText += `${indent}├── ${fileName}\n`;

    const extension = `.${fileName.split('.').pop()}`;
    if (!isDir && allowedExts.includes(extension)) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${item.path}`;
      try {
        const fileContent = await axios.get(rawUrl);
        contentStr += `\nFILE: ${item.path}\n--- CODE START ---\n${fileContent.data}\n--- CODE END ---\n`;
      } catch (e) {}
    }
  }

  return { treeText, contentStr, graph: { nodes, links } };
}

/**
 * API: BUNDLE
 */
app.post('/api/bundle', async (req: Request, res: Response) => {
  const { projectPath, allowedExtensions } = req.body;
  const finalExts = allowedExtensions || DEFAULT_EXTS;

  try {
    let result;
    if (projectPath.startsWith('http')) {
      const github = parseGitHubUrl(projectPath);
      if (!github) return res.status(400).json({ error: "Invalid URL" });
      result = await getGitHubData(github.owner, github.repo, finalExts);
    } else {
      if (!fs.existsSync(projectPath)) return res.status(400).json({ error: "Local path not found" });
      result = await getLocalData(projectPath, DEFAULT_IGNORE, finalExts);
    }

    const finalBundle = `=== PROJECT ARCHITECTURE ===\n${result.treeText}\n\n=== FULL CODEBASE ===\n${result.contentStr}`.trim();

    res.json({
      bundle: finalBundle,
      graph: result.graph,
      stats: {
        files: (finalBundle.match(/--- CODE START ---/g) || []).length,
        chars: finalBundle.length,
        tokens: Math.ceil(finalBundle.length / 4)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: "Bundling failed." });
  }
});

/**
 * API: HISTORY (Local Only)
 */
app.post('/api/history', async (req: Request, res: Response) => {
  const { projectPath } = req.body;
  if (projectPath.startsWith('http')) return res.status(400).json({ error: "Local repos only" });

  try {
    const git = simpleGit(projectPath);
    const log = await git.log(['--numstat', '--pretty=format:%at|%an|%ae']);
    const timeline = log.all.map(commit => ({
      timestamp: parseInt(commit.date),
      author: commit.author_name,
      files: commit.diff?.files.map(f => ({ path: f.file, changes: (f.before || 0) + (f.after || 0) })) || []
    }));
    res.json({ timeline: timeline.reverse() });
  } catch (error) {
    res.status(500).json({ error: "Git failed" });
  }
});

app.listen(PORT, () => console.log(`🚀 Bun Backend: http://localhost:${PORT}`));