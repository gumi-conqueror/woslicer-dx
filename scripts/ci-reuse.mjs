import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function eligiblePullRequest(event, eventName, repository) {
  const pr = event.pull_request;
  return (
    eventName === 'pull_request' &&
    pr?.base.ref === 'main' &&
    pr.head.ref === 'dev' &&
    pr.base.repo.full_name === repository &&
    pr.head.repo?.full_name === repository
  );
}

export function selectDevRun(runs, repository, commit, now = Date.now()) {
  const run = runs
    .filter(
      (item) =>
        item.head_sha === commit &&
        item.head_branch === 'dev' &&
        item.head_repository?.full_name === repository &&
        item.event === 'push' &&
        item.path === '.github/workflows/build.yml',
    )
    .sort((a, b) => b.id - a.id)[0];
  assert.ok(run, 'No dev push build for this commit');
  assert.equal(run.status, 'completed', 'The latest dev build is not complete');
  assert.equal(run.conclusion, 'success', 'The latest dev build did not succeed');
  const age = now - Date.parse(run.created_at);
  assert.ok(age >= 0 && age <= 24 * 60 * 60 * 1000, 'The dev build must be less than 24 hours old');
  return run;
}

export function verifyEvidence(run, jobs, receipt, environment, sourceTree) {
  for (const name of [
    'Quality (required)',
    'Web (required)',
    'Windows x64 (required)',
    'Required release checks',
  ]) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate source job: ${name}`);
    assert.equal(matches[0].conclusion, 'success', `Source job did not succeed: ${name}`);
  }
  assert.equal(sourceTree, environment.tree, 'The PR merge tree differs from the tested dev tree');
  assert.deepEqual(
    receipt,
    {
      ...environment,
      commit: run.head_sha,
      runId: String(run.id),
      runAttempt: String(run.run_attempt),
    },
    'The validation environment or run attempt differs',
  );
}

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  const env = process.env;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const environment = {
    tree: git('rev-parse', 'HEAD^{tree}'),
    node: process.version,
    imageOS: env.ImageOS,
    imageVersion: env.ImageVersion,
  };
  if (command === 'record') {
    assert.ok(
      environment.imageOS && environment.imageVersion,
      'Missing hosted runner image identity',
    );
    writeFileSync(
      join(env.RUNNER_TEMP, 'validation-environment.json'),
      JSON.stringify({
        ...environment,
        commit: git('rev-parse', 'HEAD'),
        runId: env.GITHUB_RUN_ID,
        runAttempt: env.GITHUB_RUN_ATTEMPT,
      }),
    );
  } else if (command === 'probe') {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    let source = '';
    let reason = 'This event is not an internal dev-to-main PR.';
    if (eligiblePullRequest(event, env.GITHUB_EVENT_NAME, env.GITHUB_REPOSITORY)) {
      // Lookup failures must run the normal checks, never authorize a skip.
      try {
        assert.ok(
          environment.imageOS && environment.imageVersion,
          'Missing hosted runner image identity',
        );
        const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 30000 });
        const api = (path) => JSON.parse(gh('api', `repos/${env.GITHUB_REPOSITORY}/${path}`));
        const commit = event.pull_request.head.sha;
        assert.match(commit, /^[a-f0-9]{40}$/);
        const runs = api(
          `actions/workflows/build.yml/runs?branch=dev&event=push&head_sha=${commit}&per_page=20`,
        ).workflow_runs;
        const run = selectDevRun(runs, env.GITHUB_REPOSITORY, commit);
        const jobs = api(
          `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        ).jobs;
        const directory = mkdtempSync(join(env.RUNNER_TEMP, 'dev-validation-'));
        gh(
          'run',
          'download',
          String(run.id),
          '--repo',
          env.GITHUB_REPOSITORY,
          '--name',
          `validation-environment-${commit}-${run.run_attempt}`,
          '--dir',
          directory,
        );
        const receipt = JSON.parse(
          readFileSync(join(directory, 'validation-environment.json'), 'utf8'),
        );
        verifyEvidence(run, jobs, receipt, environment, api(`git/commits/${commit}`).tree.sha);
        source = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${run.id}/attempts/${run.run_attempt}`;
        reason = `Reused source validation from [dev run ${run.id}, attempt ${run.run_attempt}](${source}).\n\nMerge tree: \`${environment.tree}\`. Current commit identity and version are checked separately. No PR packages are produced.`;
      } catch (error) {
        reason = `Run the normal checks: ${error.message}`;
      }
    }
    appendFileSync(env.GITHUB_OUTPUT, `reused=${Boolean(source)}\nsource-url=${source}\n`);
    appendFileSync(env.GITHUB_STEP_SUMMARY, `## Validation reuse\n\n${reason}\n`);
    console.log(reason);
  } else throw new Error('Expected probe or record');
}
