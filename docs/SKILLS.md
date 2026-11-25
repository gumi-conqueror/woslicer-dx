# Project skills

Skills are optional instructions for coding agents. Building and testing the application does not require an agent or these files.
Repository-specific rules remain in [AGENTS.md](../AGENTS.md).

The [.agents](../.agents) submodule contains the shared [agent-skills repository](https://github.com/gumi-conqueror/agent-skills).
After initialization, its catalog is available at [.agents/skills/README.md](../.agents/skills/README.md).

## Initialize submodules

```sh
git clone --branch dev --recurse-submodules https://github.com/gumi-conqueror/woslicer-dx.git
cd woslicer-dx
```

For an existing checkout, run `git submodule update --init --recursive`. Each level uses the recorded commit. The app build does not require these skill files.

## Update pins

Update and test upstream pins in the agent-skills repository first. Then update this repository's `.agents` reference through a PR.
Keep project-specific rules in AGENTS.md rather than changing upstream skill files.
See the [shared setup guide](../.agents/README.md) after initializing the submodule.
