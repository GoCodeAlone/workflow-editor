import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(args, failure = `Git verification failed: ${args[0]}`) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error(failure);
  }
}

try {
  const tag = process.argv[2];
  if (process.argv.length !== 3 || !/^v0\.2\.(0|[1-9][0-9]*)$/.test(tag ?? '')) {
    throw new Error('invalid maintenance tag');
  }
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  if (manifest.name !== '@gocodealone/workflow-editor' || manifest.version !== tag.slice(1)) {
    throw new Error('package identity does not match tag');
  }
  const gitHead = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  if (gitHead !== git(['rev-parse', '--verify', `${tag}^{commit}`])) {
    throw new Error('checkout does not match tag');
  }
  if (git(['status', '--porcelain=v1', '--untracked-files=normal'])) {
    throw new Error('checkout is not clean');
  }
  git(['fetch', '--no-tags', 'origin', '+refs/heads/release/0.2.x:refs/remotes/origin/release/0.2.x']);
  git(['merge-base', '--is-ancestor', gitHead, 'refs/remotes/origin/release/0.2.x'],
    'tag is not on remote maintenance branch');
  console.log(JSON.stringify({ tag, version: manifest.version, gitHead }));
} catch (error) {
  console.error(`maintenance release refused: ${error.message}`);
  process.exitCode = 1;
}
