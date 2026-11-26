# Developer documentation

Start with [Development](DEVELOPMENT.md) to install dependencies and run a checkout.
Then use [Architecture](ARCHITECTURE.md) to locate the behavior you want to change.
[Contributing](../CONTRIBUTING.md) explains branch targets and pull requests.

| Task | Reference |
| --- | --- |
| Build, run tests or diagnose setup | [Development](DEVELOPMENT.md) |
| Find state owners, commands, audio or native input | [Architecture](ARCHITECTURE.md) |
| Read or change `.wosdx` project handling | [Project format](PROJECT_FORMAT.md) |
| Maintain original BMHelper file compatibility | [BMH format](BMH_FORMAT.md) |
| Change the application version or inspect build identity | [Versioning](VERSIONING.md) |
| Maintain builds, caches, release packages or deployment | [CI and releases](CI.md) |
| Configure optional coding-agent instructions | [Project skills](SKILLS.md) |

## File types

| Extension | Purpose |
| --- | --- |
| `.wosdx` | DX project: markers, settings, media references and optional BMHelper data |
| `.wos` | Legacy woslicerIII settings exchange. Its binary layout is fixed. |
| `.bmh` | Original Windows BMHelper beta 4′ project. Its binary layout and CP932 name encoding are fixed. |
| `.wav` | Exported audio slices in 16-bit PCM |

For installation and everyday use, see the root README in [English](../README.md), [Chinese](../README.zh-CN.md), [Japanese](../README.ja.md) or [Korean](../README.ko.md).
The in-app Help menu contains input mappings and editing instructions.

Technical documents use English. Keep requirements and procedures tied to repository files or public references.
The English and Chinese changelogs describe user-visible changes. [AGENTS.md](../AGENTS.md) records repository constraints.
