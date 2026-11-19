import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligiblePullRequest, selectDevRun, verifyEvidence } from './ci-reuse.mjs';

const repository = 'owner/project';
const commit = 'a'.repeat(40);
const now = Date.parse('2026-11-19T12:00:00Z');
const run = {
  id: 42,
  run_attempt: 2,
  head_sha: commit,
  head_branch: 'dev',
  head_repository: { full_name: repository },
  event: 'push',
  path: '.github/workflows/build.yml',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-19T11:00:00Z',
};
const environment = {
  tree: 'b'.repeat(40),
  node: 'v26.13.1',
  imageOS: 'ubuntu24',
  imageVersion: '20261118.1',
};
const receipt = { ...environment, commit, runId: '42', runAttempt: '2' };
const jobs = [
  'Quality (required)',
  'Web (required)',
  'Windows x64 (required)',
  'Required release checks',
].map((name) => ({ name, conclusion: 'success' }));

// These cases distinguish release promotion from ordinary contribution and cache-producer runs.
test('only a same-repository dev-to-main PR can reuse checks', () => {
  const event = {
    pull_request: {
      base: { ref: 'main', repo: { full_name: repository } },
      head: { ref: 'dev', repo: { full_name: repository } },
    },
  };
  assert.equal(eligiblePullRequest(event, 'pull_request', repository), true);
  assert.equal(eligiblePullRequest(event, 'push', repository), false);
  for (const update of [
    { base: { ...event.pull_request.base, ref: 'dev' } },
    { head: { ...event.pull_request.head, ref: 'feature/test' } },
    { head: { ...event.pull_request.head, repo: { full_name: 'fork/project' } } },
  ]) {
    assert.equal(
      eligiblePullRequest(
        { pull_request: { ...event.pull_request, ...update } },
        'pull_request',
        repository,
      ),
      false,
    );
  }
});

test('reuse requires the latest completed, successful and recent dev push', () => {
  assert.equal(selectDevRun([run], repository, commit, now), run);
  for (const change of [
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { created_at: '2026-11-17T11:00:00Z' },
    { head_sha: 'different' },
    { head_branch: 'main' },
    { event: 'pull_request' },
    { head_repository: { full_name: 'fork/project' } },
    { path: '.github/workflows/other.yml' },
  ]) {
    assert.throws(() => selectDevRun([{ ...run, ...change }], repository, commit, now));
  }
  assert.throws(() =>
    selectDevRun([run, { ...run, id: 43, conclusion: 'failure' }], repository, commit, now),
  );
});

test('matching source tree and validation environment permit reuse despite a new merge commit', () => {
  verifyEvidence(run, jobs, receipt, environment, environment.tree);
});

test('changed files, tool environment, run attempt or incomplete checks require normal validation', () => {
  assert.throws(() => verifyEvidence(run, jobs, receipt, environment, 'different merge tree'));
  for (const change of [
    { tree: 'different' },
    { node: 'v26.14.0' },
    { imageVersion: 'new-image' },
    { runAttempt: '1' },
    { runId: '41' },
    { commit: 'different' },
  ]) {
    assert.throws(() =>
      verifyEvidence(run, jobs, { ...receipt, ...change }, environment, environment.tree),
    );
  }
  assert.throws(() => verifyEvidence(run, jobs.slice(1), receipt, environment, environment.tree));
  assert.throws(() =>
    verifyEvidence(run, [...jobs, jobs[0]], receipt, environment, environment.tree),
  );
  for (const conclusion of ['failure', 'cancelled', 'skipped']) {
    assert.throws(() =>
      verifyEvidence(
        run,
        jobs.map((job) => ({ ...job, conclusion })),
        receipt,
        environment,
        environment.tree,
      ),
    );
  }
});
