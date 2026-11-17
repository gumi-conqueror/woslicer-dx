# Project skills

The [.agents](../.agents) submodule contains the shared [agent-skills repository](https://github.com/gumi-conqueror/agent-skills). Its skill catalog is [.agents/skills/README.md](../.agents/skills/README.md).

## Initialize submodules

```sh
git clone --recurse-submodules https://github.com/gumi-conqueror/woslicer-dx.git
cd woslicer-dx
```

For an existing checkout, run `git submodule update --init --recursive`. Each level uses the recorded commit. The app build does not require these skill files.

Update upstream pins in agent-skills, then update this repository's .agents reference. Keep project rules in AGENTS.md. See the [shared setup guide](../.agents/README.md).
